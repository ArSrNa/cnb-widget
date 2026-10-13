import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IssueBadge } from "@/components/issue-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { listenDesktop } from "@/lib/desktop";
import { MOCK_ISSUES, MOCK_ORGS, type IssueState } from "@/lib/mock";
import { creditSummary, usagePercent } from "@/lib/usage";
import { cn } from "@/lib/utils";

const SIZE = {
  idle: { width: 360, height: 32 },
  peek: { width: 520, height: 180 },
} as const;
type Phase = keyof typeof SIZE;

export default function NotchApp() {
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const resize = useCallback((next: Phase) => {
    void invoke("surface_resize", SIZE[next]).catch(() => {});
  }, []);
  const enter = useCallback((next: Phase) => {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    setPhase(next);
    resize(next);
  }, [resize]);

  useEffect(() => {
    resize("idle");
    return listenDesktop("settings-changed", () => {
      phaseRef.current = "idle";
      setPhase("idle");
      resize("idle");
    });
  }, [resize]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") enter("idle"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enter]);

  const summary = creditSummary(MOCK_ORGS);
  const states: IssueState[] = ["NPC_WORKING", "NPC_REPLIED", "NPC_FAILED"];

  return (
    <Button variant="surface" size={phase === "peek" ? "notch" : "sm"} className={cn(phase === "idle" && "h-full w-full justify-between rounded-t-none rounded-b-xl px-4")}
      onMouseEnter={() => enter("peek")} onMouseLeave={() => enter("idle")}
      onFocus={() => enter("peek")} onBlur={() => enter("idle")}
      onClick={() => void invoke("panel_show").catch(() => {})}
      aria-label="CNB 用量概览，点击打开工作台">
      {phase === "idle" ? (
        <>
          <span className="flex items-center gap-2"><span>CNB</span><Badge variant="secondary">{summary === null ? "—" : `${summary}%`}</Badge></span>
          <span className="flex items-center gap-2">
            {states.map((state) => <Badge key={state} variant={state === "NPC_FAILED" ? "destructive" : "secondary"} aria-label={state}>{MOCK_ISSUES.filter((issue) => issue.state === state).length}</Badge>)}
          </span>
        </>
      ) : (
        <>
          <span className="flex flex-col gap-3">
            {MOCK_ORGS.map((org) => {
              const percent = org.chargeForbidden ? null : usagePercent(org.credit);
              return (
                <span key={org.slug} className="grid grid-cols-[7rem_minmax(0,1fr)_4rem] items-center gap-3">
                  <span className="truncate text-xs">{org.name}</span>
                  <Progress value={percent === null ? 0 : Math.min(100, percent)} aria-label={`${org.name} credit 用量`} />
                  <span className="text-right text-xs tabular-nums">{org.chargeForbidden ? "无权限" : percent === null ? "—" : `${percent}%`}</span>
                </span>
              );
            })}
          </span>
          <Separator />
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">{states.map((state) => <IssueBadge key={state} state={state} count={MOCK_ISSUES.filter((issue) => issue.state === state).length} />)}</span>
            <span className="text-xs">打开工作台</span>
          </span>
        </>
      )}
    </Button>
  );
}
