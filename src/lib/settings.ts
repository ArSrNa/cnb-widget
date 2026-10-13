// 应用设置（与 src-tauri/src/settings.rs 的 Settings 对齐）

export interface AppSettings {
  /** 灵动岛（屏幕顶部，与物理刘海融合） */
  notchEnabled: boolean;
  /** 悬浮球（可拖动，点击打开面板） */
  floatEnabled: boolean;
  /** 悬浮球位置（逻辑坐标，屏幕左上角） */
  floatPos: [number, number] | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  notchEnabled: true,
  floatEnabled: true,
  floatPos: null,
};
