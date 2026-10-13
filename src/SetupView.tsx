import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface CliInfo {
  source: "managed" | "system" | "missing";
  path: string | null;
  version: string | null;
  latestVersion: string | null;
  loggedIn: boolean | null;
  loginOutput: string | null;
}

interface CliOutput {
  ok: boolean;
  kind: string;
  data: unknown;
  stdout: string;
  stderr: string;
}

const SOURCE_LABEL: Record<CliInfo["source"], string> = {
  managed: "应用数据目录",
  system: "系统安装",
  missing: "未安装",
};

export default function SetupView() {
  const [info, setInfo] = useState<CliInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInfo(await invoke<CliInfo>("cli_status"));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const un = listen<{ received: number; total: number }>("cli-install-progress", (e) =>
      setProgress(e.payload),
    );
    return () => {
      un.then((f) => f());
    };
  }, [refresh]);

  async function install() {
    setInstalling(true);
    setProgress(null);
    setError(null);
    try {
      setInfo(await invoke<CliInfo>("cli_install"));
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  }

  async function testCall() {
    setUser(null);
    try {
      const out = await invoke<CliOutput>("cnb_call", {
        module: "users",
        tool: "get-user-info",
        args: [],
      });
      const d = out.data as { username?: string; nickname?: string } | null;
      setUser(out.ok && d ? `${d.nickname ?? ""} (@${d.username})` : `调用失败: ${out.kind}`);
    } catch (e) {
      setUser(`调用失败: ${e}`);
    }
  }

  const pct =
    progress && progress.total > 0 ? Math.round((progress.received / progress.total) * 100) : null;

  return (
    <div className="setup">
      <div className="card-head">
        <h2>cnb-cli 状态</h2>
        <button className="ghost" onClick={refresh} disabled={loading}>
          {loading ? "检测中…" : "刷新"}
        </button>
      </div>

      {info && (
        <dl className="kv">
          <dt>安装来源</dt>
          <dd>
            <span className={`badge ${info.source}`}>{SOURCE_LABEL[info.source]}</span>
            {info.version && <span className="version">v{info.version}</span>}
            {info.source === "system" && info.latestVersion && info.version !== info.latestVersion && (
              <span className="badge outdated">可升级到 v{info.latestVersion}</span>
            )}
          </dd>
          <dt>路径</dt>
          <dd className="mono">{info.path ?? "—"}</dd>
          <dt>登录状态</dt>
          <dd>
            {info.loggedIn == null ? (
              "—"
            ) : info.loggedIn ? (
              <span className="badge ok">已登录</span>
            ) : (
              <span className="badge bad">未登录</span>
            )}
            {info.loggedIn === false && (
              <p className="hint">
                请在终端运行 <code>cnb login</code> 完成授权，然后点击刷新。
              </p>
            )}
          </dd>
        </dl>
      )}

      {error && <p className="error">{error}</p>}

      {pct != null && (
        <div className="progress">
          <div className="bar" style={{ width: `${pct}%` }} />
          <span>{pct}%</span>
        </div>
      )}

      <div className="actions">
        {(info?.source === "missing" || info?.source === "system") && (
          <button onClick={install} disabled={installing}>
            {installing ? "下载中…" : info.source === "system" ? "安装到应用数据目录" : "一键安装 cnb-cli"}
          </button>
        )}
        {info?.source === "managed" && info.loggedIn && (
          <button onClick={testCall}>测试调用（获取当前用户）</button>
        )}
      </div>

      {user && <p className="result mono">{user}</p>}
    </div>
  );
}
