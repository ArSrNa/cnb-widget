# CNB Island 开发环境
# 云原生开发（vscode）自动使用本文件构建；流水线通过 docker.build 复用
# 基础镜像已含：Rust 1.99、Node v25.8.0（nvm 管理，PATH 优先于 /usr/local/bin）
# 此处补齐 Tauri Linux 编译依赖与 bun
FROM docker.cnb.cool/arsrna/dev-image/rust

# Tauri 2 Linux 依赖：https://v2.tauri.app/start/prerequisites/#linux
# 显式安装开发包，提供 glib/gobject/gio、Pango、GTK 和 WebKit 的 pkg-config 元数据
# unzip 用于 bun 安装脚本
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        file \
        libayatana-appindicator3-dev \
        libglib2.0-dev \
        libgtk-3-dev \
        libpango1.0-dev \
        librsvg2-dev \
        libssl-dev \
        libwebkit2gtk-4.1-dev \
        libxdo-dev \
        pkg-config \
        unzip \
        wget \
    && pkg-config --print-errors --exists \
        'glib-2.0 >= 2.70' \
        'gobject-2.0 >= 2.70' \
        'gio-2.0 >= 2.70' \
        'pango >= 1.40' \
        gtk+-3.0 \
        webkit2gtk-4.1 \
    && rm -rf /var/lib/apt/lists/*

# bun 装到 /usr/local/bin（运行期依赖缓存目录为 /root/.bun）
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash && bun -v
