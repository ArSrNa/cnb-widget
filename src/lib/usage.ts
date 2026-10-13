import { USAGE_DISPLAYS, USAGE_METRICS, type AppSettings, type UsageDisplay } from "@/lib/settings";

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
  gitStorage?: UsageQuota | null;
  objectStorage?: UsageQuota | null;
  devCorehour?: UsageQuota | null;
  ciCorehour?: UsageQuota | null;
  devGpuCorehour?: UsageQuota | null;
}
export const USAGE_DIMENSIONS = USAGE_METRICS.map(({ dimension, label, unit }) => ({ key: dimension, label, unit }));
export type UsageDimensionKey = (typeof USAGE_DIMENSIONS)[number]["key"];

export function selectedUsage(orgs: OrgUsage[], settings: AppSettings) {
  const org = settings.usageOrg === null
    ? orgs.find((candidate) => !candidate.chargeForbidden && !candidate.error)
    : orgs.find((candidate) => candidate.slug === settings.usageOrg);
  const metric = USAGE_METRICS.find((candidate) => candidate.key === settings.usageMetric) ?? USAGE_METRICS[0];
  const quota = !org || org.chargeForbidden || org.error ? null : org[metric.dimension];
  const usedPercent = usagePercent(quota);
  const display = USAGE_DISPLAYS.find((candidate) => candidate.key === settings.usageDisplay) ?? USAGE_DISPLAYS[0];
  const percent = displayPercent(quota, display.key);
  return { org, metric, display, percent, warning: usedPercent !== null && usedPercent >= 80 };
}

export function displayPercent(quota: UsageQuota | null | undefined, display: UsageDisplay): number | null {
  const used = usagePercent(quota);
  if (used === null) return null;
  return display === "used" ? used : Math.max(0, 100 - used);
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
