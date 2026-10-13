// 应用设置（与 src-tauri/src/settings.rs 的 Settings 对齐）

export const USAGE_METRICS = [
  { key: "credit", dimension: "credit", label: "credit" },
  { key: "dev-corehour", dimension: "devCorehour", label: "云原生开发核时" },
  { key: "ci-corehour", dimension: "ciCorehour", label: "云原生构建核时" },
] as const;

export const NOTCH_STATUSES = [
  { key: "NPC_WORKING", label: "工作中" },
  { key: "NPC_REPLIED", label: "待回复" },
  { key: "NPC_FAILED", label: "失败" },
] as const;

export type UsageMetric = (typeof USAGE_METRICS)[number]["key"];
export type NotchStatus = (typeof NOTCH_STATUSES)[number]["key"];

export interface NotchGeometry {
  available: boolean;
  notchWidth: number;
  menuBarHeight: number;
}

export interface AppSettings {
  /** 灵动岛（屏幕顶部，与物理刘海融合） */
  notchEnabled: boolean;
  /** 悬浮球（可拖动，点击打开面板） */
  floatEnabled: boolean;
  /** 悬浮球位置（逻辑坐标，屏幕左上角） */
  floatPos: [number, number] | null;
  usageOrg: string | null;
  usageMetric: UsageMetric;
  notchStatus: NotchStatus;
}

export const DEFAULT_SETTINGS: AppSettings = {
  notchEnabled: true,
  floatEnabled: true,
  floatPos: null,
  usageOrg: null,
  usageMetric: "credit",
  notchStatus: "NPC_WORKING",
};
