import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { USAGE_METRICS, type AppSettings } from "@/lib/settings";
import { displayPercent, readableUsageOrgs, type OrgUsage } from "@/lib/usage";

export function SurfaceUsageList({ orgs, settings }: { orgs: OrgUsage[]; settings: AppSettings }) {
  const readable = readableUsageOrgs(orgs);
  const metric = USAGE_METRICS.find((candidate) => candidate.key === settings.usageMetric) ?? USAGE_METRICS[0];
  const label = settings.usageDisplay === "used" ? "已用量" : "剩余量";
  if (!readable.length) return <Empty className="min-h-0 p-0 md:p-0" aria-label="暂无可读组织"><EmptyHeader><EmptyDescription>暂无可读组织，请在工作台检查连接和组织权限。</EmptyDescription></EmptyHeader></Empty>;

  return <ScrollArea type="auto" className="min-h-0 w-full flex-1" aria-label="所有可读组织用量">
    <div role="list" className="flex flex-col gap-3 py-1 pr-3">
      {readable.map((org) => {
        const percent = displayPercent(org[metric.dimension], settings.usageDisplay);
        return <div role="listitem" key={org.slug} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-xs">
          <span className="truncate" title={org.name}>{org.name}</span>
          <Progress value={percent === null ? undefined : Math.min(100, percent)} aria-label={`${org.name} ${metric.label} ${label}${percent === null ? "暂无数据" : ` ${percent}%`}`} />
          <span className="text-right tabular-nums">{percent === null ? "--" : `${percent}%`}</span>
        </div>;
      })}
    </div>
  </ScrollArea>;
}
