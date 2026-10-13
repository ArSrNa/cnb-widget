import { useParams } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useSurfaceSettings } from "@/hooks/use-surface-settings";
import { useCnb } from "@/hooks/use-cnb";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { OrgAvatar } from "@/components/org-avatar";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemHeader, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { USAGE_DIMENSIONS, displayPercent, usagePercent } from "@/lib/usage";

export default function UsagePage() {
  const settings = useSurfaceSettings();
  const displayLabel = settings.usageDisplay === "used" ? "已用" : "剩余";
  const { orgSlug } = useParams({ from: "/usage/$orgSlug" });
  const { data, loading, refresh } = useCnb();
  const org = data.orgs.find((o) => o.slug === orgSlug);

  if (!org && loading) return <div className="flex items-center gap-2" role="status"><Spinner />正在读取组织用量…</div>;
  if (!org) return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><ShieldAlert /></EmptyMedia>
        <EmptyTitle>组织不存在</EmptyTitle>
        <EmptyDescription>{data.error ?? `未找到 ${orgSlug} 对应的组织，请从侧栏重新选择。`}</EmptyDescription>
      </EmptyHeader>
      <Button asChild variant="outline"><Link to="/">前往首页配置连接</Link></Button>
    </Empty>
  );

  return (
    <>
      <PageHeading title={org.name} description={`用量详情 · ${org.slug}`} media={<OrgAvatar org={org} size="lg" />} action={<Button variant="outline" disabled={loading} onClick={() => void refresh(true)}>{loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}刷新</Button>} />
      {(data.error || org.error) && <Alert variant="destructive"><ShieldAlert /><AlertTitle>用量读取失败</AlertTitle><AlertDescription>{data.error ?? org.error}</AlertDescription></Alert>}
      <Card>
        <CardHeader>
          <CardTitle>资源用量</CardTitle>
          <CardDescription>查看各项资源的消耗与剩余额度。</CardDescription>
        </CardHeader>
        <CardContent>
          {org.chargeForbidden ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ShieldAlert /></EmptyMedia>
                <EmptyTitle>无权限查看</EmptyTitle>
                <EmptyDescription>请检查 Token 的 group-resource:r 权限及账号在该组织中的角色。仅成员组织可能无法读取用量。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup className="gap-4">
              {USAGE_DIMENSIONS.map((dimension) => {
                const quota = org[dimension.key];
                const usedPercent = usagePercent(quota);
                const percent = displayPercent(quota, settings.usageDisplay);
                const available = quota && !org.error;
                return (
                  <Item key={dimension.key} variant="outline">
                    <ItemHeader>
                      <ItemTitle>{dimension.label}</ItemTitle>
                      <Badge variant={!available ? "outline" : (usedPercent ?? 0) >= 80 ? "destructive" : "secondary"}>
                        {!available ? "暂无数据" : quota.quota === 0 ? "无可用额度" : (usedPercent ?? 0) >= 100 ? "已达上限" : (usedPercent ?? 0) >= 80 ? "接近上限" : "额度充足"}
                      </Badge>
                    </ItemHeader>
                    <ItemContent className="min-w-0 gap-3">
                      {available ? (
                        <>
                          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm tabular-nums">
                            <span>已用 {quota.used.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {quota.quota.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            <span className="text-muted-foreground">{percent === null ? "无可用额度" : `${percent}% ${displayLabel}`}</span>
                          </div>
                          {percent !== null && <Progress value={Math.min(100, percent)} aria-label={`${dimension.label} ${displayLabel} ${percent}%`} />}
                          {!!quota.frozen && <ItemDescription>冻结 {quota.frozen.toLocaleString(undefined, { maximumFractionDigits: 2 })}{dimension.key === "credit" ? " credit" : " 核时"}（不计入已用比例）</ItemDescription>}
                          <ItemDescription>剩余 {Math.max(0, quota.quota - quota.used).toLocaleString(undefined, { maximumFractionDigits: 2 })}{dimension.key !== "credit" && " 核时"}</ItemDescription>
                        </>
                      ) : <ItemDescription>该组织暂未提供此项用量信息。</ItemDescription>}
                    </ItemContent>
                    {!available && <ItemActions><span aria-label="无可用额度">—</span></ItemActions>}
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </CardContent>
        <CardFooter><CardDescription>本月资源 · 当前比例：{displayLabel}{data.updatedAt && ` · 更新于 ${new Date(data.updatedAt).toLocaleString()}`}{loading && " · 正在刷新"}</CardDescription></CardFooter>
      </Card>
    </>
  );
}
