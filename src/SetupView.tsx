import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AlertCircle, Download, Laptop, Play, RefreshCw, Terminal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { listenDesktop } from "@/lib/desktop";

interface CliInfo {
  source: "managed" | "system" | "missing";
  path: string | null;
  version: string | null;
  latestVersion: string | null;
  loggedIn: boolean | null;
  loginOutput: string | null;
}
interface CliOutput {
  ok: boolean;
  kind: string;
  data: unknown;
  stdout: string;
  stderr: string;
}
const SOURCE_LABEL = { managed: "应用内安装", system: "系统安装", missing: "未安装" };
const SOURCE_VARIANT = { managed: "default", system: "secondary", missing: "destructive" } as const;

export default function SetupView() {
  const desktop = isTauri();
  const [info, setInfo] = useState<CliInfo | null>(null);
  const [loading, setLoading] = useState(desktop);
  const [installing, setInstalling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try { setInfo(await invoke<CliInfo>("cli_status")); }
    catch (error) { setError(String(error)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    return listenDesktop<{ received: number; total: number }>("cli-install-progress", (event) => setProgress(event.payload));
  }, [refresh]);

  async function install() {
    setInstalling(true);
    setProgress(null);
    setError(null);
    setResult(null);
    try { setInfo(await invoke<CliInfo>("cli_install")); }
    catch (error) { setError(String(error)); }
    finally { setInstalling(false); setProgress(null); }
  }

  async function testCall() {
    setTesting(true);
    setResult(null);
    setError(null);
    try {
      const out = await invoke<CliOutput>("cnb_call", { module: "users", tool: "get-user-info", args: [] });
      const data = out.data as { username?: string; nickname?: string } | null;
      if (!out.ok || !data?.username) throw new Error(`连接验证失败：${out.kind}`);
      setResult(`已连接 ${data.nickname || data.username} (@${data.username})`);
    } catch (error) { setError(String(error)); }
    finally { setTesting(false); }
  }

  const percent = progress && progress.total > 0 ? Math.min(100, Math.round(progress.received / progress.total * 100)) : null;
  const outdated = info?.source === "system" && info.latestVersion && info.version !== info.latestVersion;
  const busy = loading || installing || testing;
  const canInstall = info?.source === "missing" || info?.source === "system";
  const canTest = info && info.source !== "missing" && info.loggedIn === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle>CNB 连接</CardTitle>
        <CardDescription>安装并登录 cnb-cli，以获取组织用量与任务动态。</CardDescription>
        <CardAction><Button size="sm" variant="outline" onClick={() => void refresh()} disabled={!desktop || busy}>{loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}刷新</Button></CardAction>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {!desktop ? (
          <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Laptop /></EmptyMedia><EmptyTitle>在桌面应用中连接 CNB</EmptyTitle><EmptyDescription>桌面应用会检测本机的 cnb-cli，并提供安装与登录引导。</EmptyDescription></EmptyHeader></Empty>
        ) : loading && !info ? (
          <div className="flex flex-col gap-3" aria-label="正在检测 CNB 连接"><Skeleton className="h-16 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : info ? (
          <ItemGroup className="gap-3">
            <Item variant="outline">
              <ItemContent className="min-w-0"><ItemTitle>安装来源</ItemTitle><ItemDescription>{info.version ? `当前版本 v${info.version}` : "尚未检测到可用的命令行"}</ItemDescription></ItemContent>
              <ItemActions className="flex-wrap"><Badge variant={SOURCE_VARIANT[info.source]}>{SOURCE_LABEL[info.source]}</Badge>{outdated && <Badge variant="outline">可升级到 v{info.latestVersion}</Badge>}</ItemActions>
            </Item>
            <Item variant="outline">
              <ItemContent className="min-w-0"><ItemTitle>安装路径</ItemTitle><ItemDescription className="break-all"><code className="select-text font-mono">{info.path ?? "—"}</code></ItemDescription></ItemContent>
            </Item>
            <Item variant="outline">
              <ItemContent><ItemTitle>登录状态</ItemTitle><ItemDescription>使用本机 cnb-cli 的授权信息。</ItemDescription></ItemContent>
              <ItemActions><Badge variant={info.loggedIn ? "secondary" : "outline"}>{info.loggedIn == null ? "尚未检测" : info.loggedIn ? "已登录" : "未登录"}</Badge></ItemActions>
            </Item>
          </ItemGroup>
        ) : null}
        {info?.source !== "missing" && info?.loggedIn === false && <Alert><Terminal /><AlertTitle>完成登录</AlertTitle><AlertDescription><p>在终端运行 <code className="rounded bg-muted px-2 py-1 font-mono select-text">cnb login</code> 完成授权，再点击刷新。</p></AlertDescription></Alert>}
        {error && <Alert variant="destructive"><AlertCircle /><AlertTitle>连接操作失败</AlertTitle><AlertDescription className="break-all">{error}</AlertDescription></Alert>}
        {installing && <div className="flex flex-col gap-3" role="status"><CardDescription>{percent === null ? "正在准备下载…" : `正在下载 · ${percent}%`}</CardDescription>{percent !== null && <Progress value={percent} aria-label="cnb-cli 下载进度" />}</div>}
        {result && <Alert><AlertTitle>连接正常</AlertTitle><AlertDescription>{result}</AlertDescription></Alert>}
      </CardContent>
      {(canInstall || canTest) && <CardFooter className="flex-wrap gap-3">
        {canInstall && <Button onClick={() => void install()} disabled={busy}>{installing ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}{installing ? "安装中…" : info?.source === "system" ? "安装到应用目录" : "安装 cnb-cli"}</Button>}
        {canTest && <Button variant="outline" onClick={() => void testCall()} disabled={busy}>{testing ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}{testing ? "验证中…" : "验证连接"}</Button>}
      </CardFooter>}
    </Card>
  );
}
