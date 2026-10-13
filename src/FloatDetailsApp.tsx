import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { SurfaceUsageList } from "@/components/surface-usage-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useCnb } from "@/hooks/use-cnb";
import { useSurfaceSettings } from "@/hooks/use-surface-settings";
import { readableUsageOrgs, selectedUsage } from "@/lib/usage";

export default function FloatDetailsApp() {
  const { data } = useCnb();
  const settings = useSurfaceSettings();
  const [error, setError] = useState<string | null>(null);
  const orgs = data.error ? [] : readableUsageOrgs(data.orgs);
  const usage = selectedUsage(orgs, settings);
  async function close() {
    try { await invoke("float_details_hide"); }
    catch { setError("无法关闭详情窗口，请重试。"); }
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") void invoke("float_details_hide").catch(() => {}); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <div className="size-full p-1">
    <Card className="h-full min-h-0 gap-4 py-4">
      <CardHeader className="shrink-0 px-4">
        <CardTitle>组织用量</CardTitle>
        <CardDescription>{usage.metric.label} · {usage.display.label} · {orgs.length} 个可读组织</CardDescription>
        <CardAction><Button size="icon-sm" variant="ghost" aria-label="关闭详情" onClick={() => void close()}><X /></Button></CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-4">
        {(error || data.error) && <Alert variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{error ?? data.error}</AlertDescription></Alert>}
        <SurfaceUsageList orgs={orgs} settings={settings} />
      </CardContent>
      <CardFooter className="shrink-0 justify-end px-4"><Button size="sm" variant="secondary" onClick={() => {
        void invoke("panel_show").catch(() => setError("无法打开工作台，请重试。"));
      }}>打开工作台</Button></CardFooter>
    </Card>
  </div>;
}
