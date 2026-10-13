// 演示 fixtures，仅用于已有测试；运行时 UI 读取真实数据。
import type { OrgUsage } from "@/lib/usage";
import type { NpcIssue } from "@/lib/npc";
export type { OrgUsage, UsageQuota, UsageDimensionKey } from "@/lib/usage";
export { USAGE_DIMENSIONS } from "@/lib/usage";
export type { IssueState, NpcIssue } from "@/lib/npc";
export { ISSUE_STATE_META } from "@/lib/npc";

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
