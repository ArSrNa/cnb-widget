import { cn } from "@/lib/utils";

export function UsageRing({ percent, label, compact = false }: { percent: number | null; label: string; compact?: boolean }) {
  const progress = Math.min(100, percent ?? 0);
  return (
    <span className={cn("usage-ring", compact && "usage-ring-compact")} role="img" aria-label={`${label}：${percent === null ? "暂无数据" : `${percent}%`}`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="usage-ring-track" cx="20" cy="20" r="18" />
        {progress > 0 && <circle className={cn("usage-ring-progress", percent !== null && percent >= 80 && "usage-ring-warning")} cx="20" cy="20" r="18"
          pathLength="100" strokeDasharray={`${progress} 100`} transform="rotate(-90 20 20)" />}
      </svg>
      <span aria-hidden="true">{percent === null ? "--" : `${percent}%`}</span>
    </span>
  );
}
