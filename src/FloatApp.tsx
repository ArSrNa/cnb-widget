import { useRef, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { UsageRing } from "@/components/usage-ring";
import { useSurfaceSettings } from "@/hooks/use-surface-settings";
import { useCnb } from "@/hooks/use-cnb";
import { selectedUsage } from "@/lib/usage";

const CLICK_THRESHOLD = 6;

export default function FloatApp() {
  const drag = useRef({ active: false, started: false, moved: 0, lastX: 0, lastY: 0, totalX: 0, totalY: 0 });
  const pending = useRef({ dx: 0, dy: 0 });
  const frame = useRef<number | null>(null);
  const nudgePump = useRef<Promise<void> | null>(null);
  const settings = useSurfaceSettings();
  const { data } = useCnb();
  const usage = selectedUsage(data.error ? [] : data.orgs, settings);
  const label = `${usage.org?.name ?? "组织不可用"} · ${usage.metric.label} · ${usage.display.label}`;

  function scheduleNudges() {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      void flushNudges();
    });
  }

  function flushNudges(): Promise<void> {
    if (nudgePump.current) return nudgePump.current;

    const pump = (async () => {
      while (pending.current.dx !== 0 || pending.current.dy !== 0) {
        const { dx, dy } = pending.current;
        pending.current = { dx: 0, dy: 0 };
        await invoke("float_nudge", { dx, dy }).catch(() => {});
      }
    })().finally(() => {
      nudgePump.current = null;
      if (pending.current.dx !== 0 || pending.current.dy !== 0) scheduleNudges();
    });

    nudgePump.current = pump;
    return pump;
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.current.started) return;

    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    void flushNudges().then(() => invoke("float_settle")).catch(() => {});
  }

  return (
    <div className="grid size-full place-items-center p-1">
      <Button variant="surface" size="float" aria-label={`${label} ${usage.percent ?? "未知"}%，点击查看组织用量详情，拖动调整位置`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            active: true,
            started: false,
            moved: 0,
            lastX: event.screenX,
            lastY: event.screenY,
            totalX: 0,
            totalY: 0,
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current.active) return;
          // Screen coordinates stay fixed as the window moves under the pointer.
          const dx = event.screenX - drag.current.lastX;
          const dy = event.screenY - drag.current.lastY;
          if (dx === 0 && dy === 0) return;
          drag.current.moved += Math.abs(dx) + Math.abs(dy);
          drag.current.lastX = event.screenX;
          drag.current.lastY = event.screenY;
          if (!drag.current.started) {
            drag.current.totalX += dx;
            drag.current.totalY += dy;
            if (drag.current.moved < CLICK_THRESHOLD) return;
            drag.current.started = true;
            pending.current.dx += drag.current.totalX;
            pending.current.dy += drag.current.totalY;
          } else {
            pending.current.dx += dx;
            pending.current.dy += dy;
          }
          scheduleNudges();
        }}
        onPointerUp={endDrag} onPointerCancel={endDrag}
        onClick={(event) => { if (event.detail === 0 || drag.current.moved < CLICK_THRESHOLD) void invoke("float_details_show").catch(() => {}); }}>
        <UsageRing percent={usage.percent} warning={usage.warning} label={label} />
      </Button>
    </div>
  );
}
