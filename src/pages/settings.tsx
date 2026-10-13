import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AlertCircle, Settings } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { listenDesktop } from "@/lib/desktop";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";
import SetupView from "@/SetupView";

export default function SettingsPage() {
  const desktop = isTauri();
  const [settings, setSettings] = useState<AppSettings | null>(desktop ? null : DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function update(key: "notchEnabled" | "floatEnabled", enabled: boolean) {
    if (!settings || saving) return;
    const previous = settings;
    setSaving(true);
    setError(null);
    setSettings({ ...settings, [key]: enabled });
    try {
      setSettings(await invoke<AppSettings>(key === "notchEnabled" ? "settings_set_notch" : "settings_set_float", { enabled }));
    } catch {
      setSettings(previous);
      setError("保存失败，已恢复之前的显示设置，请重试。");
    } finally {
      setSaving(false);
    }
  }

  const disabled = !desktop || !settings || saving;
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
              <Field orientation="horizontal" data-disabled={disabled}>
                <FieldContent>
                  <FieldLabel htmlFor="notch-enabled">灵动刘海</FieldLabel>
                  <FieldDescription>在屏幕顶部显示用量，悬停展开组织概览。</FieldDescription>
                </FieldContent>
                <Switch id="notch-enabled" disabled={disabled} checked={settings?.notchEnabled ?? false} onCheckedChange={(value) => void update("notchEnabled", value)} />
              </Field>
              <FieldSeparator />
              <Field orientation="horizontal" data-disabled={disabled}>
                <FieldContent>
                  <FieldLabel htmlFor="float-enabled">悬浮球</FieldLabel>
                  <FieldDescription>显示可拖动的用量小球，点击打开工作台。</FieldDescription>
                </FieldContent>
                <Switch id="float-enabled" disabled={disabled} checked={settings?.floatEnabled ?? false} onCheckedChange={(value) => void update("floatEnabled", value)} />
              </Field>
            </FieldGroup>
          )}
        </CardContent>
      </Card>
      <SetupView />
    </>
  );
}
