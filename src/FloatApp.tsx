import { useRef, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { UsageRing } from "@/components/usage-ring";
import { useSurfaceSettings } from "@/hooks/use-surface-settings";
import { useCnb } from "@/hooks/use-cnb";
import { selectedUsage } from "@/lib/usage";

const CLICK_THRESHOLD = 6;

export default function FloatApp() {
  const drag = useRef({ active: false, moved: 0, lastX: 0, lastY: 0 });
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const settings = useSurfaceSettings();
  const { data } = useCnb();
  const usage = selectedUsage(data.error ? [] : data.orgs, settings);
  const label = `${usage.org?.name ?? "组织不可用"} · ${usage.metric.label} · ${usage.display.label}`;

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.current.moved >= CLICK_THRESHOLD) {
      chain.current = chain.current.then(() => invoke("float_settle")).catch(() => {});
    }
  }

  return (
    <div className="grid size-full place-items-center p-1">
      <Button variant="surface" size="float" aria-label={`${label} ${usage.percent ?? "未知"}%，点击打开工作台，拖动调整位置`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { active: true, moved: 0, lastX: event.clientX, lastY: event.clientY };
        }}
        onPointerMove={(event) => {
          if (!drag.current.active) return;
          const dx = event.clientX - drag.current.lastX;
          const dy = event.clientY - drag.current.lastY;
          if (dx === 0 && dy === 0) return;
          drag.current.moved += Math.abs(dx) + Math.abs(dy);
          drag.current.lastX = event.clientX;
          drag.current.lastY = event.clientY;
          chain.current = chain.current.then(() => invoke("float_nudge", { dx, dy })).catch(() => {});
        }}
        onPointerUp={endDrag} onPointerCancel={endDrag}
        onClick={(event) => { if (event.detail === 0 || drag.current.moved < CLICK_THRESHOLD) void invoke("panel_show").catch(() => {}); }}>
        <UsageRing percent={usage.percent} warning={usage.warning} label={label} />
      </Button>
    </div>
  );
}
