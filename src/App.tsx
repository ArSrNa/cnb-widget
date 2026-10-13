import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MOCK_ISSUES, MOCK_ORGS, ISSUE_STATE_META, type IssueState } from "./lib/mock";
import SetupView from "./SetupView";
import "./App.css";

// 形态尺寸（逻辑像素），与 docs/spec/notch-ui.md §2 一致
const SIZE = {
  idle: { width: 200, height: 32 },
  peek: { width: 480, height: 140 },
  panel: { width: 600, height: 440 },
} as const;

type Phase = keyof typeof SIZE;

function pct(used: number, quota: number) {
  return Math.min(100, Math.round((used / quota) * 100));
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600_000);
  if (h >= 24) return `${Math.floor(h / 24)} 天前`;
  if (h >= 1) return `${h} 小时前`;
  return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [orgIdx, setOrgIdx] = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const enter = useCallback((next: Phase) => {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    setPhase(next);
    invoke("surface_resize", { width: SIZE[next].width, height: SIZE[next].height }).catch(
      () => {},
    );
  }, []);

  // 挂载时将窗口定位到屏幕顶部居中（idle 尺寸）
  useEffect(() => {
    invoke("surface_resize", { width: SIZE.idle.width, height: SIZE.idle.height }).catch(() => {});
  }, []);

  // Esc 收回面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phaseRef.current !== "idle") enter("idle");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enter]);

  const org = MOCK_ORGS[orgIdx];
  const summary = Math.round(
    MOCK_ORGS.reduce((acc, o) => acc + o.used, 0) / MOCK_ORGS.reduce((acc, o) => acc + o.quota, 0) * 100,
  );
  const counts = MOCK_ISSUES.reduce<Record<IssueState, number>>(
    (acc, i) => ({ ...acc, [i.state]: acc[i.state] + 1 }),
    {
      NPC_WORKING: 0,
      NPC_REPLIED: 0,
      NPC_FAILED: 0,
      NPC_QUEUED: 0,
      WAITING_REPLY: 0,
    },
  );

  return (
    <div
      ref={rootRef}
      className={`surface ${phase}`}
      onMouseLeave={() => enter("idle")}
    >
      {/* ---------- idle：刘海左右两枚胶囊 ---------- */}
      <div className="idle-wrap" onMouseEnter={() => enter("peek")} onClick={() => enter("panel")}>
        <div className="pill pill-left">
          <span className="ring" style={{ background: `conic-gradient(#818cf8 ${summary * 3.6}deg, rgba(255,255,255,.12) 0)` }}>
            <i>{summary}%</i>
          </span>
        </div>
        <div className="notch-gap" />
        <div className="pill pill-right">
          {MOCK_ISSUES.filter((i) => i.state !== "WAITING_REPLY")
            .slice(0, 5)
            .map((i) => (
              <span key={`${i.repo}#${i.number}`} className="dot" style={{ background: ISSUE_STATE_META[i.state].color }} />
            ))}
        </div>
      </div>

      {/* ---------- peek：横条，逐组织 credit 用量 ---------- */}
      <div className="peek-wrap">
        <div className="peek-orgs">
          {MOCK_ORGS.map((o) => {
            const p = pct(o.used, o.quota);
            return (
              <div key={o.slug} className="peek-row">
                <span className="peek-name">{o.name}</span>
                <div className="peek-bar">
                  <div className="peek-bar-fill" style={{ width: `${p}%`, background: p > 80 ? "#f87171" : "#818cf8" }} />
                </div>
                <span className="peek-num">{p}%</span>
              </div>
            );
          })}
        </div>
        <div className="peek-counts">
          {(["NPC_WORKING", "NPC_REPLIED", "NPC_FAILED"] as IssueState[]).map((s) => (
            <span key={s} className="peek-count">
              <i style={{ color: ISSUE_STATE_META[s].color }}>{ISSUE_STATE_META[s].dot}</i>
              {counts[s]}
            </span>
          ))}
          <span className="peek-hint">点击展开</span>
        </div>
      </div>
      <button className="peek-click" aria-label="展开面板" onClick={() => enter("panel")} />

      {/* ---------- panel：完整面板，组织切换 + issue 列表 ---------- */}
      <div className="panel-wrap">
        <div className="panel-head">
          <div className="tabs">
            {MOCK_ORGS.map((o, i) => (
              <button
                key={o.slug}
                className={`tab ${i === orgIdx ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOrgIdx(i);
                }}
              >
                {o.name}
              </button>
            ))}
          </div>
          <button className="close" onClick={() => enter("idle")}>
            ✕
          </button>
        </div>

        {showSetup ? (
          <>
            <button className="ghost back" onClick={() => setShowSetup(false)}>
              ← 返回
            </button>
            <SetupView />
          </>
        ) : (
          <>
            <button
              className="ghost gear"
              title="设置"
              onClick={(e) => {
                e.stopPropagation();
                setShowSetup(true);
              }}
            >
              ⚙ 设置
            </button>
            <div className="usage">
          <div className="usage-title">
            credit 用量 <span className="usage-val">{org.used} / {org.quota}</span>
          </div>
          <div className="usage-bar">
            <div
              className="usage-fill"
              style={{ width: `${pct(org.used, org.quota)}%`, background: pct(org.used, org.quota) > 80 ? "#f87171" : "linear-gradient(90deg,#38bdf8,#818cf8)" }}
            />
          </div>
        </div>

        <div className="issues">
          {MOCK_ISSUES.map((it) => {
            const meta = ISSUE_STATE_META[it.state];
            return (
              <a key={`${it.repo}#${it.number}`} className="issue" href={`https://cnb.cool/${it.repo}/-/issues/${it.number}`} onClick={(e) => e.preventDefault()}>
                <span className="issue-state" style={{ color: meta.color }}>{meta.dot}</span>
                <span className="issue-repo mono">{it.repo}</span>
                <span className="issue-title">{it.title}</span>
                <span className="issue-time">{timeAgo(it.lastActedAt)}</span>
              </a>
            );
          })}
        </div>
            </>
        )}
      </div>
    </div>
  );
}
