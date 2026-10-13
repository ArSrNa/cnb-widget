import { cn } from "@/lib/utils";

export function StatusCount({ count, label, compact = false }: { count: number | null; label: string; compact?: boolean }) {
  return (
    <span className={cn("status-count", compact && "status-count-compact")} role="img" aria-label={`${label}：${count ?? "暂无数据"}`}>
      <span className="status-count-number" aria-hidden="true">{count ?? "--"}</span>
      <span className="status-count-label" aria-hidden="true">{label}</span>
    </span>
  );
}
