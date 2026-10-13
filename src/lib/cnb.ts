export interface AuthInfo {
  source: "saved" | "session" | "environment" | "cli";
  environmentPresent: boolean;
  savedToken: boolean;
  storageError: string | null;
}
export interface UsageSnapshot {
  username: string | null;
  orgs: import("./usage").OrgUsage[];
  updatedAt: number | null;
  error: string | null;
}
export interface NpcSnapshot {
  issues: import("./npc").NpcIssue[];
  updatedAt: number | null;
  error: string | null;
  warnings: string[];
}
