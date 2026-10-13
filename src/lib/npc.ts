export type IssueState =
  | "NPC_WORKING"
  | "NPC_FAILED"
  | "NPC_REPLIED"
  | "NPC_QUEUED"
  | "WAITING_REPLY";

export interface NpcIssue {
  repo: string; // org/repo
  number: number;
  title: string;
  state: IssueState;
  lastActedAt: string; // ISO
}

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
