import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import NotchApp from "./NotchApp";
import FloatApp from "./FloatApp";
import { CnbProvider } from "./hooks/use-cnb";
import { router } from "./router";
import "./index.css";
import "./App.css";

// 全应用仅暗色主题（shadcn tokens）
document.documentElement.classList.add("dark");

// 同一前端包按窗口 label 路由：
// - main  → 独立主面板窗口（TanStack Router 承载多页面）
// - notch → 灵动岛（屏幕顶部，与物理刘海融合）
// - float → 悬浮球（可拖动，点击打开面板）
let label = "main";
try {
  label = getCurrentWebviewWindow().label;
} catch {
  // 非 Tauri 环境（浏览器 UI 预览）固定渲染主面板
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CnbProvider>
    {label === "main" ? (
      <RouterProvider router={router} />
    ) : label === "float" ? (
      <FloatApp />
    ) : (
      <NotchApp />
    )}
    </CnbProvider>
  </React.StrictMode>,
);
