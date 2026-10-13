import { Link } from "@tanstack/react-router";
import { AlertCircle, Gauge, RefreshCw } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { OrgAvatar } from "@/components/org-avatar";
import { TokenSettings } from "@/components/token-settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { useCnb } from "@/hooks/use-cnb";
import SetupView from "@/SetupView";

export default function HomePage() {
  const { data, loading, refresh } = useCnb();
  return <>
    <PageHeading title="首页" description="连接 CNB，查看真实组织用量。" media={<Avatar size="lg"><AvatarFallback><Gauge className="size-5" /></AvatarFallback></Avatar>} action={<Button variant="outline" disabled={loading} onClick={() => void refresh(true)}>{loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}刷新用量</Button>} />
    <TokenSettings />
    {data.error && <Alert variant="destructive"><AlertCircle /><AlertTitle>数据读取失败</AlertTitle><AlertDescription>{data.error}</AlertDescription></Alert>}
    <Card>
      <CardHeader><CardTitle>{data.username ? `@${data.username} 的组织` : "所属组织"}</CardTitle><CardDescription>资源用量每 30 分钟刷新，可手动更新。</CardDescription></CardHeader>
      <CardContent>{loading && !data.updatedAt ? <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />正在读取组织与用量…</div> : data.orgs.length ? <ItemGroup className="gap-3">{data.orgs.map((org) => <Item key={org.slug} variant="outline" asChild><Link to="/usage/$orgSlug" params={{ orgSlug: org.slug }}><ItemMedia><OrgAvatar org={org} /></ItemMedia><ItemContent><ItemTitle>{org.name}</ItemTitle><ItemDescription>{org.chargeForbidden ? "无权限读取用量，请检查 Token 权限和组织角色" : org.error ?? org.slug}</ItemDescription></ItemContent></Link></Item>)}</ItemGroup> : <Empty><EmptyHeader><EmptyMedia variant="icon"><Gauge /></EmptyMedia><EmptyTitle>{data.updatedAt ? "暂无组织" : "连接后查看用量"}</EmptyTitle><EmptyDescription>{data.updatedAt ? "当前账号的授权范围中没有组织。" : "先配置 Token 或安装 cnb-cli。"}</EmptyDescription></EmptyHeader></Empty>}</CardContent>
    </Card>
    <SetupView />
  </>;
}
