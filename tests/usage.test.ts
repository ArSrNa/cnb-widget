import { describe, expect, test } from "bun:test";
import { MOCK_ORGS } from "../src/lib/mock";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { selectedUsage, usagePercent } from "../src/lib/usage";

describe("surface usage selection", () => {
  test("shows the selected organization and metric instead of aggregating", () => {
    const result = selectedUsage(MOCK_ORGS, { ...DEFAULT_SETTINGS, usageOrg: "1024hub", usageMetric: "dev-corehour" });
    expect(result.org?.slug).toBe("1024hub");
    expect(result.percent).toBe(4);
    expect(result.warning).toBe(true);
    expect(selectedUsage(MOCK_ORGS, { ...DEFAULT_SETTINGS, usageOrg: "1024hub", usageMetric: "dev-corehour", usageDisplay: "used" }).percent).toBe(96);
  });

  test("defaults to the first readable organization", () => {
    const result = selectedUsage([MOCK_ORGS[3], MOCK_ORGS[0]], DEFAULT_SETTINGS);
    expect(result.org?.slug).toBe("arsrna");
    expect(result.percent).toBe(39);
    expect(result.warning).toBe(false);
  });

  test("does not replace missing or forbidden selections with another organization", () => {
    for (const usageOrg of ["lab", "deleted-org"]) {
      expect(selectedUsage(MOCK_ORGS, { ...DEFAULT_SETTINGS, usageOrg }).percent).toBeNull();
    }
    expect(selectedUsage(MOCK_ORGS, { ...DEFAULT_SETTINGS, usageOrg: "1024hub", usageMetric: "ci-corehour" }).percent).toBeNull();
  });

  test("distinguishes zero usage, invalid quotas, and over-quota usage", () => {
    expect(usagePercent({ used: 0, quota: 100 })).toBe(0);
    expect(usagePercent({ used: 10, quota: 0 })).toBeNull();
    expect(usagePercent({ used: NaN, quota: 100 })).toBeNull();
    expect(usagePercent({ used: 125, quota: 100 })).toBe(125);
  });
});
