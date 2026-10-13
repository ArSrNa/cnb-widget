// Mock 数据：M1 骨架用，M2 由 collector + store 替换（类型对齐 spec/data.md）

export type IssueState =
  | "NPC_WORKING"
  | "NPC_FAILED"
  | "NPC_REPLIED"
  | "NPC_QUEUED"
  | "WAITING_REPLY";

export interface UsageQuota {
  used: number; // 已用
  quota: number; // 总额度
}

export interface OrgUsage {
  slug: string;
  name: string;
  chargeForbidden?: boolean; // charge 接口 403（成员组织）→ 无权限查看
  credit?: UsageQuota; // 字段缺失 → 数据不可用，显示 —
  devCorehour?: UsageQuota; // 云原生开发核时
  ciCorehour?: UsageQuota; // 云原生构建核时
}

export const USAGE_DIMENSIONS = [
  { key: "credit", label: "credit" },
  { key: "devCorehour", label: "云原生开发核时" },
  { key: "ciCorehour", label: "云原生构建核时" },
] as const;

export type UsageDimensionKey = (typeof USAGE_DIMENSIONS)[number]["key"];

export interface NpcIssue {
  repo: string; // org/repo
  number: number;
  title: string;
  state: IssueState;
  lastActedAt: string; // ISO
}

export const MOCK_ORGS: OrgUsage[] = [
  {
    slug: "arsrna",
    name: "Ar-Sr-Na",
    credit: { used: 612, quota: 1000 },
    devCorehour: { used: 86, quota: 120 },
    ciCorehour: { used: 412, quota: 500 },
  },
  {
    slug: "1024hub",
    name: "1024Hub",
    credit: { used: 8234, quota: 10000 },
    devCorehour: { used: 96, quota: 100 },
  },
  {
    slug: "team-alpha",
    name: "Alpha 团队",
    credit: { used: 156, quota: 2000 },
  },
  { slug: "lab", name: "Lab 实验室", chargeForbidden: true },
];

export const MOCK_ISSUES: NpcIssue[] = [
  {
    repo: "team-alpha/api-gateway",
    number: 128,
    title: "重构网关鉴权中间件，支持多租户",
    state: "NPC_WORKING",
    lastActedAt: "2026-10-13T09:41:00Z",
  },
  {
    repo: "team-alpha/web",
    number: 452,
    title: "修复列表页虚拟滚动丢帧问题",
    state: "NPC_REPLIED",
    lastActedAt: "2026-10-13T08:12:00Z",
  },
  {
    repo: "arsrna/dotfiles",
    number: 17,
    title: "升级 CI 基础镜像到 ubuntu 24.04",
    state: "NPC_FAILED",
    lastActedAt: "2026-10-13T07:55:00Z",
  },
  {
    repo: "lab/vision-demo",
    number: 33,
    title: "跑通推理基准测试流水线",
    state: "NPC_QUEUED",
    lastActedAt: "2026-10-13T06:30:00Z",
  },
  {
    repo: "lab/dataset-tools",
    number: 89,
    title: "数据集去重脚本支持增量模式",
    state: "WAITING_REPLY",
    lastActedAt: "2026-10-12T21:04:00Z",
  },
];

export const ISSUE_STATE_META: Record<
  IssueState,
  { label: string; color: string; dot: string }
> = {
  NPC_WORKING: { label: "工作中", color: "#facc15", dot: "●" },
  NPC_REPLIED: { label: "待回复", color: "#60a5fa", dot: "●" },
  NPC_FAILED: { label: "失败", color: "#f87171", dot: "●" },
  NPC_QUEUED: { label: "已派发", color: "#fb923c", dot: "●" },
  WAITING_REPLY: { label: "等待人", color: "#9ca3af", dot: "○" },
};
