import type { OrgUsage, UsageQuota } from "@/lib/mock";

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
