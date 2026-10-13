# CNB Island 开发环境
# 云原生开发（vscode）自动使用本文件构建；流水线通过 docker.build 复用
# 基础镜像已含：Rust 1.99、Node v25.8.0（nvm 管理，PATH 优先于 /usr/local/bin）
# 此处仅补齐 bun
FROM docker.cnb.cool/arsrna/dev-image/rust

# bun 安装脚本依赖 unzip
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*

# bun 装到 /usr/local/bin（运行期依赖缓存目录为 /root/.bun）
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash && bun -v
