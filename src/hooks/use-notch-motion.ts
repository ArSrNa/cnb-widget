import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

type Phase = "idle" | "peek";
interface FrameSize { width: number; height: number }
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Native resize and WebView painting must finish before the CSS expansion starts.
// On collapse, wait for the actual transition rather than a duration-based timer.
export function useNotchMotion(idleWidth: number, peekWidth: number, menuBarHeight: number) {
  const [phase, setPhase] = useState<Phase>("idle");
  const surfaceRef = useRef<HTMLDivElement>(null);
  const desired = useRef<Phase>("idle");
  const revision = useRef(0);
  const mounted = useRef(true);
  const nativeFrame = useRef<FrameSize | null>(null);
  const resizeQueue = useRef<Promise<void>>(Promise.resolve());

  const request = useCallback(async (next: Phase, force = false) => {
    if (!force && desired.current === next) return;
    desired.current = next;
    const current = ++revision.current;
    const active = () => mounted.current && revision.current === current;
    const resize = (frame: FrameSize) => {
      const operation = resizeQueue.current.catch(() => {}).then(async () => {
        if (!active()) return;
        if (nativeFrame.current?.width === frame.width && nativeFrame.current.height === frame.height
          && Math.abs(window.innerWidth - frame.width) < 1 && Math.abs(window.innerHeight - frame.height) < 1) return;
        if (isTauri()) await invoke("surface_resize", { width: frame.width, height: frame.height });
        nativeFrame.current = frame;
      });
      resizeQueue.current = operation;
      return operation;
    };
    try {
      if (next === "peek") {
        await resize({ width: peekWidth, height: menuBarHeight + 200 });
        if (!active()) return;
        // Two paints let WebKit settle its resized viewport/backing layer first.
        await nextPaint();
        await nextPaint();
        if (active()) setPhase("peek");
      } else {
        setPhase("idle");
        await nextPaint();
        while (active() && surfaceRef.current && surfaceRef.current.dataset.phase !== "idle") await nextPaint();
        if (!active()) return;
        const animations = surfaceRef.current?.getAnimations() ?? [];
        await Promise.allSettled(animations.map((animation) => animation.finished));
        // Present the final collapsed frame before moving/resizing the native window.
        await nextPaint();
        await nextPaint();
        if (active()) await resize({ width: idleWidth, height: menuBarHeight });
      }
    } catch {
      // Allow the next hover to retry if the native resize failed.
      if (active()) { desired.current = "idle"; setPhase("idle"); }
    }
  }, [idleWidth, peekWidth, menuBarHeight]);

  useEffect(() => {
    mounted.current = true;
    void request(desired.current, true);
    return () => { mounted.current = false; revision.current += 1; };
  }, [request]);

  const open = useCallback(() => { void request("peek"); }, [request]);
  const close = useCallback(() => { void request("idle"); }, [request]);
  return { phase, surfaceRef, open, close };
}
