import { USAGE_METRICS, type AppSettings } from "@/lib/settings";

export interface UsageQuota {
  used: number;
  quota: number;
  frozen?: number | null;
}
export interface OrgUsage {
  slug: string;
  name: string;
  chargeForbidden?: boolean;
  error?: string | null;
  credit?: UsageQuota | null;
  devCorehour?: UsageQuota | null;
  ciCorehour?: UsageQuota | null;
}
export const USAGE_DIMENSIONS = [
  { key: "credit", label: "credit" },
  { key: "devCorehour", label: "云原生开发核时" },
  { key: "ciCorehour", label: "云原生构建核时" },
] as const;
export type UsageDimensionKey = (typeof USAGE_DIMENSIONS)[number]["key"];

export function selectedUsage(orgs: OrgUsage[], settings: AppSettings) {
  const org = settings.usageOrg === null
    ? orgs.find((candidate) => !candidate.chargeForbidden && !candidate.error)
    : orgs.find((candidate) => candidate.slug === settings.usageOrg);
  const metric = USAGE_METRICS.find((candidate) => candidate.key === settings.usageMetric) ?? USAGE_METRICS[0];
  const percent = !org || org.chargeForbidden || org.error ? null : usagePercent(org[metric.dimension]);
  return { org, metric, percent };
}

export function usagePercent(quota?: UsageQuota | null): number | null {
  if (!quota || quota.quota <= 0 || !Number.isFinite(quota.used) || !Number.isFinite(quota.quota)) return null;
  return Math.max(0, Math.round((quota.used / quota.quota) * 100));
}

export function creditSummary(orgs: OrgUsage[]) {
  const available = orgs.filter((org) => !org.chargeForbidden && usagePercent(org.credit) !== null);
  return usagePercent({
    used: available.reduce((total, org) => total + org.credit!.used, 0),
    quota: available.reduce((total, org) => total + org.credit!.quota, 0),
  });
}
