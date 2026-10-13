import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { IssueBadge } from "@/components/issue-badge";
import { UsageRing } from "@/components/usage-ring";
import { StatusCount } from "@/components/status-count";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSurfaceSettings } from "@/hooks/use-surface-settings";
import { MOCK_ISSUES, MOCK_ORGS } from "@/lib/mock";
import { NOTCH_STATUSES, type NotchGeometry } from "@/lib/settings";
import { selectedUsage, usagePercent } from "@/lib/usage";

const PREVIEW_GEOMETRY: NotchGeometry = { available: true, notchWidth: 184, menuBarHeight: 32 };
const WING_WIDTH = 64;
type Phase = "idle" | "peek";

export default function NotchApp() {
  const settings = useSurfaceSettings();
  const [geometry, setGeometry] = useState(PREVIEW_GEOMETRY);
  const [phase, setPhase] = useState<Phase>("idle");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idleWidth = geometry.notchWidth + WING_WIDTH * 2;
  const peekWidth = Math.max(520, idleWidth);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    void invoke<NotchGeometry>("notch_geometry").then((value) => {
      if (!disposed) setGeometry(value);
    }).catch(() => {});
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void invoke("surface_resize", {
      width: phase === "idle" ? idleWidth : peekWidth,
      height: geometry.menuBarHeight + (phase === "peek" ? 200 : 0),
    }).catch(() => {});
  }, [phase, geometry, idleWidth, peekWidth]);

  const close = useCallback(() => {
    clearTimeout(closeTimer.current);
    setPhase("idle");
  }, []);
  useEffect(() => { close(); }, [settings, close]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(closeTimer.current); };
  }, [close]);

  const usage = selectedUsage(MOCK_ORGS, settings);
  const status = NOTCH_STATUSES.find((value) => value.key === settings.notchStatus) ?? NOTCH_STATUSES[0];
  const count = MOCK_ISSUES.filter((issue) => issue.state === status.key).length;
  const label = `${usage.org?.name ?? "组织不可用"} · ${usage.metric.label}`;

  return (
    <div className="notch-surface" data-phase={phase}
      style={{ "--notch-width": `${geometry.notchWidth}px`, "--notch-height": `${geometry.menuBarHeight}px`, "--notch-wing-width": `${WING_WIDTH}px` } as CSSProperties}
      onMouseEnter={() => { clearTimeout(closeTimer.current); setPhase("peek"); }}
      onMouseLeave={() => { closeTimer.current = setTimeout(close, 140); }}
      onFocusCapture={() => { clearTimeout(closeTimer.current); setPhase("peek"); }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
      <button className="notch-header" type="button"
        onClick={() => setPhase("peek")} aria-expanded={phase === "peek"} aria-controls="notch-details"
        aria-label={`${label} ${usage.percent === null ? "暂无数据" : `${usage.percent}%`}，${status.label}：${count}，展开刘海详情`}>
        <span className="notch-usage"><UsageRing compact percent={usage.percent} label={label} /></span>
        <span className="notch-camera" aria-hidden="true" />
        <span className="notch-status"><StatusCount compact count={count} label={status.label} /></span>
      </button>
      {phase === "peek" && (
        <div className="notch-overview" id="notch-details">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span>{usage.metric.label} · 组织概览</span>
            <span className="text-muted-foreground">{usage.org?.name ?? "组织不可用"}</span>
          </div>
          <div className="flex flex-col gap-2">
            {MOCK_ORGS.map((org) => {
              const percent = org.chargeForbidden ? null : usagePercent(org[usage.metric.dimension]);
              return (
                <div key={org.slug} className="grid grid-cols-[7rem_minmax(0,1fr)_4rem] items-center gap-3 text-xs">
                  <span className="truncate">{org.name}</span>
                  <Progress value={Math.min(100, percent ?? 0)} aria-label={`${org.name} ${usage.metric.label} 用量`} />
                  <span className="text-right tabular-nums">{org.chargeForbidden ? "无权限" : percent === null ? "--" : `${percent}%`}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">{NOTCH_STATUSES.map(({ key }) => <IssueBadge key={key} state={key} count={MOCK_ISSUES.filter((issue) => issue.state === key).length} />)}</span>
            <Button size="xs" variant="secondary" onClick={() => { close(); void invoke("panel_show").catch(() => {}); }}>打开工作台</Button>
          </div>
        </div>
      )}
    </div>
  );
}
