import type { OrgUsage, UsageQuota } from "@/lib/mock";
import { USAGE_METRICS, type AppSettings } from "@/lib/settings";

export function selectedUsage(orgs: OrgUsage[], settings: AppSettings) {
  const org = settings.usageOrg === null
    ? orgs.find((candidate) => !candidate.chargeForbidden)
    : orgs.find((candidate) => candidate.slug === settings.usageOrg);
  const metric = USAGE_METRICS.find((candidate) => candidate.key === settings.usageMetric) ?? USAGE_METRICS[0];
  const percent = !org || org.chargeForbidden ? null : usagePercent(org[metric.dimension]);
  return { org, metric, percent };
}

export function usagePercent(quota?: UsageQuota): number | null {
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
