#!/usr/bin/env node
/**
 * 上传 Tauri 安装包到腾讯云 COS。
 *
 * 必须在 Node 下运行（package.json 的 upload:cos 通过 node 启动）：
 * cos-nodejs-sdk-v5 的分片上传依赖 Node 的 fs.ReadStream 行为，在 Bun 下
 * UploadPart 会退化成 chunked 编码且不带 Content-Length，COS 返回 MissingContentLength。
 *
 * 环境变量：
 *   SECRET_ID / SECRET_KEY           腾讯云密钥（CI 中由密钥注入）
 *   SESSION_TOKEN                    可选，临时密钥的 SecurityToken
 *   COS_BUCKET   | APP_RELEASE_BUCKET  bucket，含 appid 后缀
 *   COS_REGION   | APP_RELEASE_REGION  region，如 ap-guangzhou
 *   COS_PREFIX                         对象前缀，默认 app-release/cnb-widget
 *
 * 对象 Key：<prefix>/<version>/<platform>/<arch>/<文件名>
 */

import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_PREFIX = "app-release/cnb-widget";
const BUNDLE_FORMAT = { macos: "dmg", windows: "nsis" };
const EXTENSIONS = { macos: [".dmg"], windows: [".exe"] };
const PLATFORM_ALIASES = { darwin: "macos", macos: "macos", win32: "windows", windows: "windows" };
const ARCH_ALIASES = { aarch64: "arm64", arm64: "arm64", x86_64: "x64", x64: "x64", universal: "universal" };
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const HOST_ARCH = ARCH_ALIASES[process.arch];

function usage() {
  console.log("用法：node scripts/upload-cos.mjs [--platform macos|windows] [--arch arm64|x64] [--dry-run]");
  console.log("不传 --platform 时使用当前平台；不传 --arch 时扫描该版本全部安装包。");
  console.log(`对象 Key 规则：<COS_PREFIX>/<version>/<platform>/<arch>/<文件名>，默认前缀 ${DEFAULT_PREFIX}。`);
  console.log("--dry-run 只打印上传计划，不需要 COS 凭据。");
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`缺少环境变量：${name}`);
  return value.trim();
}

function normalizePrefix(value) {
  const prefix = (value || DEFAULT_PREFIX).replace(/\/+$/, "");
  if (!prefix || prefix.includes("\\") || prefix.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`COS_PREFIX 必须是合法的目录前缀，例如 ${DEFAULT_PREFIX}`);
  }
  return prefix;
}

async function readVersion() {
  const pkg = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  if (typeof pkg.version !== "string" || !VERSION_PATTERN.test(pkg.version)) {
    throw new Error("package.json 的 version 必须是有效 semver");
  }
  return pkg.version;
}

/** 从 Tauri 产物文件名识别架构，如 cnb-widget_0.2.0_aarch64.dmg、cnb-widget_0.2.0_x64-setup.exe */
function detectArch(fileName, extension) {
  const stem = fileName.slice(0, -extension.length).replace(/-setup$/i, "");
  const match = stem.match(/[-_](aarch64|arm64|x86_64|x64|universal)$/i);
  return match ? ARCH_ALIASES[match[1].toLowerCase()] : undefined;
}

/**
 * Tauri 用 productName（"CNB Widget"）命名产物，文件名里会带空格。
 * COS 对象名统一成 URL 友好的小写短横线形式，下载链接不需要转义。
 */
function objectName(fileName) {
  return fileName.replace(/\s+/g, "-").toLowerCase();
}

/** Tauri 默认布局 target/release/bundle/<format>，指定 --target 时为 target/<triple>/release/bundle/<format> */
async function bundleDirectories(platform) {
  const targetRoot = path.join(projectRoot, "src-tauri", "target");
  if (!existsSync(targetRoot)) throw new Error(`没有构建产物目录：${targetRoot}`);

  const entries = await readdir(targetRoot, { withFileTypes: true });
  const releaseDirectories = [path.join(targetRoot, "release")];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "release" && entry.name !== "debug") {
      releaseDirectories.push(path.join(targetRoot, entry.name, "release"));
    }
  }

  const format = BUNDLE_FORMAT[platform];
  return releaseDirectories.map((release) => path.join(release, "bundle", format));
}

async function collectInstallers({ platform, arch, version, prefix }) {
  const directories = await bundleDirectories(platform);
  const extensions = EXTENSIONS[platform];
  const files = new Map();
  let foundDirectory = false;

  for (const directory of directories) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
      foundDirectory = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const extension = extensions.find((value) => entry.name.endsWith(value));
      if (!extension) continue;

      const fileArch = detectArch(entry.name, extension) ?? arch ?? HOST_ARCH;
      if (!fileArch) throw new Error(`无法识别 ${entry.name} 的架构，请显式传入 --arch`);
      if (arch && fileArch !== arch) continue;

      const filePath = path.join(directory, entry.name);
      const { size } = await stat(filePath);
      if (!size) throw new Error(`安装包为空：${filePath}`);

      const key = `${prefix}/${version}/${platform}/${fileArch}/${objectName(entry.name)}`;
      if (!files.has(key)) files.set(key, { key, filePath, size, arch: fileArch });
    }
  }

  if (!foundDirectory) {
    throw new Error(`没有构建产物目录，候选位置：${directories.join("、")}，请先构建`);
  }
  if (!files.size) {
    throw new Error(`未找到 ${version} 的 ${platform}${arch ? `/${arch}` : ""} 安装包（${extensions.join("、")}）`);
  }

  return [...files.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function readCosConfig(env) {
  return {
    SecretId: requiredString(env.SECRET_ID, "SECRET_ID"),
    SecretKey: requiredString(env.SECRET_KEY, "SECRET_KEY"),
    SecurityToken: env.SESSION_TOKEN?.trim() || undefined,
    Bucket: requiredString(env.COS_BUCKET || env.APP_RELEASE_BUCKET, "COS_BUCKET / APP_RELEASE_BUCKET"),
    Region: requiredString(env.COS_REGION || env.APP_RELEASE_REGION, "COS_REGION / APP_RELEASE_REGION"),
  };
}

async function upload(files, config) {
  const { default: COS } = await import("cos-nodejs-sdk-v5");
  const client = new COS({
    SecretId: config.SecretId,
    SecretKey: config.SecretKey,
    SecurityToken: config.SecurityToken,
    Protocol: "https:",
  });

  for (const file of files) {
    console.log(`上传：${file.key}（${(file.size / 1024 / 1024).toFixed(1)} MiB）`);
    await new Promise((resolve, reject) => {
      client.uploadFile(
        {
          Bucket: config.Bucket,
          Region: config.Region,
          Key: file.key,
          FilePath: file.filePath,
          SliceSize: 8 * 1024 * 1024,
        },
        (error) => {
          // 不打印 SDK 的 error 对象，里面可能带授权头
          if (error) {
            const code = typeof error.code === "string" && /^[A-Za-z0-9_]+$/.test(error.code) ? error.code : "UploadError";
            reject(new Error(`上传失败：${file.key}（${code}）`));
          } else {
            resolve();
          }
        },
      );
    });
  }
}

async function main(args = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({
    args,
    options: {
      platform: { type: "string" },
      arch: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    usage();
    return;
  }

  const platform = PLATFORM_ALIASES[values.platform ?? process.platform];
  if (!platform) throw new Error("平台必须是 macos 或 windows");

  const arch = values.arch === undefined ? undefined : ARCH_ALIASES[values.arch];
  if (values.arch !== undefined && !arch) throw new Error("不支持的架构，可选 arm64、x64");

  const version = await readVersion();
  const prefix = normalizePrefix(env.COS_PREFIX);
  const files = await collectInstallers({ platform, arch, version, prefix });

  for (const file of files) console.log(`${file.filePath} -> ${file.key}（${file.arch}）`);
  if (values["dry-run"]) {
    console.log(`预览完成：${files.length} 个安装包，版本 ${version}，未发送上传请求`);
    return;
  }

  await upload(files, readCosConfig(env));
  console.log(`上传完成：${files.length} 个安装包，版本 ${version}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
