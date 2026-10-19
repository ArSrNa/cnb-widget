import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Check, ChevronDown, Gauge, RefreshCw, TriangleAlert } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { OrgAvatar } from "@/components/org-avatar";
import { TokenSettings } from "@/components/token-settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCnb } from "@/hooks/use-cnb";
import { USAGE_DIMENSIONS } from "@/lib/usage";
import SetupView from "@/SetupView";

const UNAVAILABLE_MESSAGE = "无法获取用量，请检查权限和组织角色。";

export default function HomePage() {
  const { auth, data, loading, authError, refresh } = useCnb();
  const [connectionExpanded, setConnectionExpanded] = useState<boolean | null>(null);
  const connected = !!data.username && data.updatedAt !== null;
  const failed = !connected && (!!data.error || !!authError);
  const detecting = !connected && loading && !failed;
  const connectionOpen = connectionExpanded ?? !(connected || detecting);
  const tokenSource = auth?.savedToken ? "应用保存的 Token" : auth?.environmentPresent ? "CNB_TOKEN 环境变量" : null;

  return <>
    <PageHeading title="首页" description="连接 CNB，查看真实组织用量。" media={<Avatar size="lg"><AvatarFallback><Gauge className="size-5" /></AvatarFallback></Avatar>} action={<Button variant="outline" disabled={loading} onClick={() => void refresh(true)}>{loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}刷新用量</Button>} />
    <Collapsible open={connectionOpen} onOpenChange={setConnectionExpanded} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>CNB 连接</CardTitle>
          <CardDescription>{connected ? `已连接 @${data.username}` : detecting ? <span className="inline-flex items-center gap-2"><Spinner className="size-3.5" />正在检测 CNB 连接{tokenSource ? ` · ${tokenSource}` : ""}…</span> : "配置访问令牌，开始查看组织用量。"}</CardDescription>
          <CardAction>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" aria-label={connectionOpen ? "收起连接设置" : "展开连接设置"}>
                {connectionOpen ? "收起设置" : "连接设置"}<ChevronDown data-icon="inline-end" className="transition-transform in-data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
      </Card>
      <CollapsibleContent className="flex flex-col gap-4">
        <TokenSettings />
        <SetupView />
      </CollapsibleContent>
    </Collapsible>
    {data.error && <Alert variant="destructive"><AlertCircle /><AlertTitle>数据读取失败</AlertTitle><AlertDescription>{data.error}</AlertDescription></Alert>}
    <Card>
      <CardHeader><CardTitle>{data.username ? `@${data.username} 的组织` : "所属组织"}</CardTitle><CardDescription>资源用量每 30 分钟刷新，可手动更新。</CardDescription></CardHeader>
      <CardContent>
        {loading && !data.updatedAt ? <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />正在读取组织与用量…</div> : data.orgs.length ? (
          <TooltipProvider>
            <ItemGroup aria-label="所属组织" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3">
              {data.orgs.map((org) => {
                const readable = !data.error && !org.chargeForbidden && !org.error && USAGE_DIMENSIONS.some(({ key }) => org[key] != null);
                const tile = <Item variant={readable ? "success" : "outline"} className="grid h-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1" asChild>
                  <Link to="/usage/$orgSlug" params={{ orgSlug: org.slug }} aria-label={`${org.name}，${readable ? "用量可读取" : "无法获取用量"}，查看详情`}>
                    <ItemMedia className="row-span-2"><OrgAvatar org={org} size="lg" /></ItemMedia>
                    <ItemTitle className="min-w-0 max-w-full"><span className="truncate">{org.name}</span></ItemTitle>
                    <Badge variant={readable ? "success" : "warning"} className="col-start-2">
                      {readable ? <Check data-icon="inline-start" aria-hidden="true" /> : <TriangleAlert data-icon="inline-start" aria-hidden="true" />}
                      {readable ? "可读取" : "无用量"}
                    </Badge>
                  </Link>
                </Item>;
                return <div role="listitem" key={org.slug} className="min-w-0">
                  {readable ? tile : <Tooltip><TooltipTrigger asChild>{tile}</TooltipTrigger><TooltipContent>{UNAVAILABLE_MESSAGE}</TooltipContent></Tooltip>}
                </div>;
              })}
            </ItemGroup>
          </TooltipProvider>
        ) : <Empty><EmptyHeader><EmptyMedia variant="icon"><Gauge /></EmptyMedia><EmptyTitle>{data.updatedAt ? "暂无组织" : "连接后查看用量"}</EmptyTitle><EmptyDescription>{data.updatedAt ? "当前账号的授权范围中没有组织。" : "先配置 Token 或安装 cnb-cli。"}</EmptyDescription></EmptyHeader></Empty>}
      </CardContent>
    </Card>
  </>;
}
