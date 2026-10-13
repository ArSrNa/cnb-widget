import { useState, type MouseEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Activity, AlertCircle, Inbox } from "lucide-react";
import { IssueBadge } from "@/components/issue-badge";
import { PageHeading } from "@/components/page-heading";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemHeader, ItemTitle } from "@/components/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useNpc } from "@/hooks/use-npc";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ISSUE_STATE_META, type IssueState } from "@/lib/npc";

type Filter = "all" | IssueState;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "全部" },
  ...Object.entries(ISSUE_STATE_META).map(([value, meta]) => ({ value: value as IssueState, label: meta.label })),
];

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const hours = Math.floor(diff / 3600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)} 天前`;
  if (hours >= 1) return `${hours} 小时前`;
  return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
}

export default function NpcPage() {
  const { data, loading, refresh } = useNpc();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const issues = data.issues.filter((issue) => filter === "all" || issue.state === filter);

  function openIssue(event: MouseEvent<HTMLAnchorElement>, url: string) {
    if (!isTauri()) return;
    event.preventDefault();
    setError(null);
    void openUrl(url).catch(() => setError("无法打开浏览器，请稍后重试。"));
  }

  return (
    <>
      <PageHeading title="NPC 动态" description="查看各组织的任务进展与待处理回复。" media={<Avatar size="lg"><AvatarFallback><Activity className="size-5" /></AvatarFallback></Avatar>} action={<Badge variant="outline">{data.issues.length} 个任务</Badge>} />
      <Card>
        <CardHeader>
          <CardTitle>任务列表</CardTitle>
          <CardDescription>每个授权仓库展示最近活跃的 20 个 open Issue，读取最近 5 条评论推断状态；每 90 秒刷新。</CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={2} value={filter} onValueChange={(value) => { if (value) setFilter(value as Filter); }} aria-label="筛选任务状态" className="max-w-full flex-wrap justify-start">
            {FILTERS.map(({ value, label }) => <ToggleGroupItem key={value} value={value} aria-label={`筛选${label}任务`}>{label}</ToggleGroupItem>)}
          </ToggleGroup>
          <Button className="self-start" variant="outline" disabled={loading} onClick={() => void refresh(true)}>{loading && <Spinner data-icon="inline-start" />}刷新任务</Button>
          {loading && <CardDescription role="status">正在读取真实任务状态…</CardDescription>}
          {(data.error || data.warnings.length > 0) && <Alert variant="destructive"><AlertCircle /><AlertTitle>部分任务暂不可用</AlertTitle><AlertDescription>{data.error ?? data.warnings.slice(0, 3).join("；")}{data.warnings.length > 3 && `；另有 ${data.warnings.length - 3} 项读取失败`}</AlertDescription></Alert>}
          {error && <Alert variant="destructive"><AlertCircle /><AlertTitle>打开失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {issues.length === 0 ? (
            <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Inbox /></EmptyMedia><EmptyTitle>暂无任务</EmptyTitle><EmptyDescription>当前状态下没有任务，请选择其他状态。</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <ItemGroup className="gap-3">
              {issues.map((issue) => {
                const url = `https://cnb.cool/${issue.repo}/-/issues/${issue.number}`;
                return (
                  <Item key={`${issue.repo}#${issue.number}`} variant="outline" asChild>
                    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => openIssue(event, url)}>
                      <ItemHeader><IssueBadge state={issue.state} /><span className="text-xs text-muted-foreground">#{issue.number}</span></ItemHeader>
                      <ItemContent className="min-w-0"><ItemTitle>{issue.title}</ItemTitle><ItemDescription className="break-all">{issue.repo}</ItemDescription></ItemContent>
                      <ItemFooter><time className="text-xs text-muted-foreground" dateTime={issue.lastActedAt}>{timeAgo(issue.lastActedAt)}</time><Badge variant="outline">查看详情</Badge></ItemFooter>
                    </a>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </CardContent>
      </Card>
    </>
  );
}
