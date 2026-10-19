import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertCircle, Settings } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { UsageRing } from "@/components/usage-ring";
import { StatusCount } from "@/components/status-count";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { listenDesktop } from "@/lib/desktop";
import { useNpc } from "@/hooks/use-npc";
import { DEFAULT_SETTINGS, NOTCH_STATUSES, USAGE_DISPLAYS, USAGE_METRICS, type AppSettings, type NotchGeometry } from "@/lib/settings";
import { selectedUsage } from "@/lib/usage";
import { useCnb } from "@/hooks/use-cnb";
import { TokenSettings } from "@/components/token-settings";
import { UpdateSettings } from "@/components/update-settings";
import SetupView from "@/SetupView";

export default function SettingsPage() {
  const { data } = useCnb();
  const { data: npcData } = useNpc();
  const desktop = isTauri();
  const [settings, setSettings] = useState<AppSettings | null>(desktop ? null : DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [footerError, setFooterError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notchAvailable, setNotchAvailable] = useState<boolean | null>(desktop ? null : true);

  const reload = useCallback(async () => {
    if (!isTauri()) return;
    try {
      setSettings(await invoke<AppSettings>("settings_get"));
      setError(null);
    } catch {
      setError("无法读取显示设置，请重新进入设置页面。");
    }
  }, []);

  useEffect(() => {
    void reload();
    return listenDesktop<AppSettings>("settings-changed", (event) => setSettings(event.payload));
  }, [reload]);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    void invoke<NotchGeometry>("notch_geometry").then(({ available }) => {
      if (!disposed) setNotchAvailable(available);
    }).catch(() => { if (!disposed) setNotchAvailable(false); });
    return () => { disposed = true; };
  }, [desktop]);

  async function update(patch: Partial<Pick<AppSettings, "notchEnabled" | "floatEnabled" | "usageOrg" | "usageMetric" | "usageDisplay" | "notchStatus">>) {
    if (!settings || saving) return;
    const previous = settings;
    setSaving(true);
    setError(null);
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      const command = "notchEnabled" in patch ? "settings_set_notch" : "floatEnabled" in patch ? "settings_set_float" : "settings_set_notch_content";
      const args = "notchEnabled" in patch ? { enabled: next.notchEnabled } : "floatEnabled" in patch ? { enabled: next.floatEnabled }
        : { usageOrg: next.usageOrg, usageMetric: next.usageMetric, usageDisplay: next.usageDisplay, notchStatus: next.notchStatus };
      setSettings(await invoke<AppSettings>(command, args));
    } catch {
      setSettings(previous);
      setError("保存失败，已恢复之前的设置，请重试。");
    } finally {
      setSaving(false);
    }
  }

  const disabled = !desktop || !settings || saving;
  const usage = selectedUsage(data.error ? [] : data.orgs, settings ?? DEFAULT_SETTINGS);
  const status = NOTCH_STATUSES.find((value) => value.key === settings?.notchStatus) ?? NOTCH_STATUSES[0];
  const count = !npcData.updatedAt || npcData.error || npcData.warnings.length > 0 ? null : npcData.issues.filter((issue) => issue.state === status.key).length;
  return (
    <>
      <PageHeading title="设置" description="管理桌面组件与 CNB 连接。" media={<Avatar size="lg"><AvatarFallback><Settings className="size-5" /></AvatarFallback></Avatar>} />
      <Card>
        <CardHeader><CardTitle>桌面显示</CardTitle><CardDescription>灵动刘海与悬浮球可独立开启。</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!desktop && <Alert><AlertTitle>桌面预览</AlertTitle><AlertDescription>请在桌面应用中调整显示设置。</AlertDescription></Alert>}
          {error && <Alert variant="destructive"><AlertCircle /><AlertTitle>设置未保存</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {!settings && !error ? <div className="flex flex-col gap-6" aria-label="正在读取显示设置"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div> : (
            <FieldGroup>
              <Field orientation="horizontal" data-disabled={disabled || !notchAvailable}>
                <FieldContent>
                  <FieldLabel htmlFor="notch-enabled">灵动刘海</FieldLabel>
                  <FieldDescription>{notchAvailable === null ? "正在检测刘海屏…" : !notchAvailable ? "仅支持内建刘海屏，当前没有可用的刘海屏。" : "贴合菜单栏刘海两侧，左侧显示用量环，右侧显示所选状态数量。"}</FieldDescription>
                </FieldContent>
                <Switch id="notch-enabled" disabled={disabled || !notchAvailable} checked={(settings?.notchEnabled ?? false) && !!notchAvailable} onCheckedChange={(value) => void update({ notchEnabled: value })} />
              </Field>
              <FieldSeparator />
              <Field orientation="horizontal" data-disabled={disabled}>
                <FieldContent>
                  <FieldLabel htmlFor="float-enabled">悬浮球</FieldLabel>
                  <FieldDescription>显示可拖动的用量小球，点击查看所有可读组织的用量详情。</FieldDescription>
                </FieldContent>
                <Switch id="float-enabled" disabled={disabled} checked={settings?.floatEnabled ?? false} onCheckedChange={(value) => void update({ floatEnabled: value })} />
              </Field>
            </FieldGroup>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>刘海展示</CardTitle><CardDescription>选择左侧用量和右侧状态，保存后即时生效。悬浮球使用相同的用量设置。</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-disabled={disabled}>
              <FieldLabel id="usage-org-label">用量组织</FieldLabel>
              <ToggleGroup type="single" variant="outline" spacing={2} className="flex-wrap" aria-labelledby="usage-org-label"
                disabled={disabled} value={usage.org?.slug ?? ""} onValueChange={(value) => { if (value) void update({ usageOrg: value }); }}>
                {data.orgs.map((org) => <ToggleGroupItem key={org.slug} value={org.slug} disabled={org.chargeForbidden || !!org.error}>{org.name}{org.chargeForbidden && "（无权限）"}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
            <Field data-disabled={disabled}>
              <FieldLabel id="usage-metric-label">用量类型</FieldLabel>
              <ToggleGroup type="single" variant="outline" spacing={2} className="flex-wrap" aria-labelledby="usage-metric-label"
                disabled={disabled} value={settings?.usageMetric ?? "credit"} onValueChange={(value) => {
                  const metric = USAGE_METRICS.find((candidate) => candidate.key === value);
                  if (metric) void update({ usageMetric: metric.key });
                }}>
                {USAGE_METRICS.map((metric) => <ToggleGroupItem key={metric.key} value={metric.key}>{metric.label}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
            <Field data-disabled={disabled}>
              <FieldLabel id="usage-display-label">展示口径</FieldLabel>
              <ToggleGroup type="single" variant="outline" spacing={2} aria-labelledby="usage-display-label"
                disabled={disabled} value={settings?.usageDisplay ?? "remaining"} onValueChange={(value) => {
                  const display = USAGE_DISPLAYS.find((candidate) => candidate.key === value);
                  if (display) void update({ usageDisplay: display.key });
                }}>
                {USAGE_DISPLAYS.map((display) => <ToggleGroupItem key={display.key} value={display.key}>{display.label}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
            <FieldSeparator />
            <Field data-disabled={disabled}>
              <FieldLabel id="notch-status-label">右侧状态</FieldLabel>
              <ToggleGroup type="single" variant="outline" spacing={2} aria-labelledby="notch-status-label"
                disabled={disabled} value={settings?.notchStatus ?? "NPC_WORKING"} onValueChange={(value) => {
                  const selected = NOTCH_STATUSES.find((candidate) => candidate.key === value);
                  if (selected) void update({ notchStatus: selected.key });
                }}>
                {NOTCH_STATUSES.map((value) => <ToggleGroupItem key={value.key} value={value.key}>{value.label}</ToggleGroupItem>)}
              </ToggleGroup>
              <FieldDescription>统计全部监控组织，上方显示数量，下方显示「{status.label}」。</FieldDescription>
            </Field>
            <FieldSeparator />
            <Field>
              <FieldLabel>展示预览</FieldLabel>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-surface px-5 py-3 text-surface-foreground" aria-label="刘海展示预览">
                <UsageRing percent={usage.percent} warning={usage.warning} label={`${usage.org?.name ?? "组织不可用"} ${usage.metric.label} ${usage.display.label}`} />
                <StatusCount count={count} label={status.label} />
              </div>
              <FieldDescription>{usage.org?.name ?? "组织不可用"} · {usage.metric.label} · {usage.display.label} · 真实数据</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <TokenSettings />
      <UpdateSettings />
      <SetupView />
      {footerError && <Alert variant="destructive"><AlertCircle /><AlertTitle>无法打开网站</AlertTitle><AlertDescription>请在浏览器访问 https://www.arsrna.cn。</AlertDescription></Alert>}
      <footer className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
        <span>Powered by</span>
        <Button variant="link" size="sm" asChild>
          <a href="https://www.arsrna.cn" target="_blank" rel="noopener noreferrer" onClick={(event) => {
            if (!desktop) return;
            event.preventDefault();
            setFooterError(false);
            void openUrl("https://www.arsrna.cn").catch(() => setFooterError(true));
          }}>Ar-Sr-Na</a>
        </Button>
      </footer>
    </>
  );
}
