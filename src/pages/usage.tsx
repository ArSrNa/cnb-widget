import { useParams } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { OrgAvatar } from "@/components/org-avatar";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemHeader, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { MOCK_ORGS, USAGE_DIMENSIONS } from "@/lib/mock";
import { usagePercent } from "@/lib/usage";

export default function UsagePage() {
  const { orgSlug } = useParams({ from: "/usage/$orgSlug" });
  const org = MOCK_ORGS.find((o) => o.slug === orgSlug);

  if (!org) return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><ShieldAlert /></EmptyMedia>
        <EmptyTitle>组织不存在</EmptyTitle>
        <EmptyDescription>未找到 {orgSlug} 对应的组织，请从侧栏重新选择。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <>
      <PageHeading title={org.name} description={`用量详情 · ${org.slug}`} media={<OrgAvatar org={org} size="lg" />} action={<Badge variant="outline">演示数据</Badge>} />
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
                <EmptyDescription>当前账号无法读取该组织的资源额度，请切换到有权限的组织。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup className="gap-4">
              {USAGE_DIMENSIONS.map((dimension) => {
                const quota = org[dimension.key];
                const percent = usagePercent(quota);
                const available = quota && percent !== null;
                return (
                  <Item key={dimension.key} variant="outline">
                    <ItemHeader>
                      <ItemTitle>{dimension.label}</ItemTitle>
                      <Badge variant={!available ? "outline" : percent >= 80 ? "destructive" : "secondary"}>
                        {!available ? "暂无数据" : percent >= 100 ? "已达上限" : percent >= 80 ? "接近上限" : "额度充足"}
                      </Badge>
                    </ItemHeader>
                    <ItemContent className="min-w-0 gap-3">
                      {available ? (
                        <>
                          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm tabular-nums">
                            <span>{quota.used.toLocaleString()} / {quota.quota.toLocaleString()}</span>
                            <span className="text-muted-foreground">{percent}% 已使用</span>
                          </div>
                          <Progress value={Math.min(100, percent)} aria-label={`${dimension.label} 已使用 ${percent}%`} />
                          <ItemDescription>剩余 {Math.max(0, quota.quota - quota.used).toLocaleString()}{dimension.key !== "credit" && " 核时"}</ItemDescription>
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
        <CardFooter><CardDescription>当前展示演示数据，实际用量以 CNB 平台为准。</CardDescription></CardFooter>
      </Card>
    </>
  );
}
