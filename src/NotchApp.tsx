import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { IssueBadge } from "@/components/issue-badge";
import { UsageRing } from "@/components/usage-ring";
import { StatusCount } from "@/components/status-count";
import { SurfaceUsageList } from "@/components/surface-usage-list";
import { Button } from "@/components/ui/button";
import { useNotchMotion } from "@/hooks/use-notch-motion";
import { useSurfaceSettings } from "@/hooks/use-surface-settings";
import { listenDesktop } from "@/lib/desktop";
import { useNpc } from "@/hooks/use-npc";
import { useCnb } from "@/hooks/use-cnb";
import { NOTCH_STATUSES, type NotchGeometry } from "@/lib/settings";
import { readableUsageOrgs, selectedUsage } from "@/lib/usage";

const PREVIEW_GEOMETRY: NotchGeometry = { available: true, notchWidth: 184, menuBarHeight: 32 };
const WING_WIDTH = 64;
const MOTION_DURATION_MS = 200;
const MOTION_EASING = "cubic-bezier(0.6, 0, 0.2, 1)";
const CLOSE_DELAY_MS = 200;

export default function NotchApp() {
  const { data } = useCnb();
  const { data: npcData } = useNpc();
  const settings = useSurfaceSettings();
  const [geometry, setGeometry] = useState(PREVIEW_GEOMETRY);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hovered = useRef(false);
  const nativeHover = useRef(false);
  const idleWidth = geometry.notchWidth + WING_WIDTH * 2;
  const peekWidth = Math.max(520, idleWidth);
  const { phase, surfaceRef, open, close: closeMotion } = useNotchMotion(idleWidth, peekWidth, geometry.menuBarHeight);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    void invoke<NotchGeometry>("notch_geometry").then((value) => {
      if (!disposed) setGeometry(value);
    }).catch(() => { });
    return () => { disposed = true; };
  }, []);

  const close = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeMotion();
  }, [closeMotion]);
  const hover = useCallback((inside: boolean) => {
    hovered.current = inside;
    clearTimeout(closeTimer.current);
    if (inside) open();
    else closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
  }, [close, open]);
  useEffect(() => listenDesktop<boolean>("notch-hover", ({ payload }) => {
    nativeHover.current = true;
    hover(payload);
  }), [hover]);
  useEffect(() => { if (!hovered.current) close(); }, [settings, close]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(closeTimer.current); };
  }, [close]);

  const usage = selectedUsage(data.error ? [] : data.orgs, settings);
  const readableOrgs = data.error ? [] : readableUsageOrgs(data.orgs);
  const status = NOTCH_STATUSES.find((value) => value.key === settings.notchStatus) ?? NOTCH_STATUSES[0];
  const count = !npcData.updatedAt || npcData.error || npcData.warnings.length > 0 ? null : npcData.issues.filter((issue) => issue.state === status.key).length;
  const label = `${usage.org?.name ?? "组织不可用"} · ${usage.metric.label} · ${usage.display.label}`;

  return (
    <div className="notch-window">
      <div ref={surfaceRef} className="notch-surface" data-phase={phase}
        style={{
          "--notch-width": `${geometry.notchWidth}px`, "--notch-height": `${geometry.menuBarHeight}px`,
          "--notch-wing-width": `${WING_WIDTH}px`, "--notch-idle-width": `${idleWidth}px`, "--notch-peek-width": `${peekWidth}px`,
          "--notch-motion-duration": `${MOTION_DURATION_MS}ms`, "--notch-motion-easing": MOTION_EASING,
        } as CSSProperties}
        onMouseEnter={() => { if (!nativeHover.current) hover(true); }}
        onMouseLeave={() => { if (!nativeHover.current) hover(false); }}
        onFocusCapture={() => { clearTimeout(closeTimer.current); open(); }}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !hovered.current) close(); }}>
        <button className="notch-header" type="button"
          onClick={open} aria-expanded={phase === "peek"} aria-controls="notch-details"
          aria-label={`${label} ${usage.percent === null ? "暂无数据" : `${usage.percent}%`}，${status.label}：${count ?? "暂无数据"}，展开刘海详情`}>
          <span className="notch-usage"><UsageRing compact percent={usage.percent} warning={usage.warning} label={label} /></span>
          <span className="notch-camera" aria-hidden="true" />
          <span className="notch-status"><StatusCount compact count={count} label={status.label} /></span>
        </button>
        <div className="notch-overview" id="notch-details" inert={phase !== "peek"} aria-hidden={phase !== "peek"}>
          <div className="flex shrink-0 items-center justify-between gap-3 text-xs">
            <span>{usage.metric.label} · {usage.display.label} · 组织概览</span>
            <span className="text-muted-foreground">{readableOrgs.length} 个组织</span>
          </div>
          <SurfaceUsageList orgs={readableOrgs} settings={settings} />
          <div className="flex shrink-0 items-center justify-between gap-2">
            <span className="flex items-center gap-2">{NOTCH_STATUSES.map(({ key }) => <IssueBadge key={key} state={key} count={npcData.issues.filter((issue) => issue.state === key).length} />)}</span>
            <Button size="xs" variant="secondary" onClick={() => { close(); void invoke("panel_show").catch(() => { }); }}>打开工作台</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
