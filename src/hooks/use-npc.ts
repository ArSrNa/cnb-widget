import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listenDesktop } from "@/lib/desktop";
import type { NpcSnapshot } from "@/lib/cnb";
const EMPTY: NpcSnapshot = { issues: [], updatedAt: null, error: null, warnings: [] };
export function useNpc() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(isTauri());
  const generation = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const refresh = useCallback((force = false): Promise<void> => {
    if (!isTauri()) return Promise.resolve();
    if (pending.current && !force) return pending.current;
    const current = generation.current;
    setLoading(true);
    const task = invoke<NpcSnapshot>("npc_get", { force }).then((value) => {
      if (current === generation.current) setData(value);
    }).catch((error: unknown) => {
      if (current === generation.current) setData((previous) => ({ ...previous, error: String(error) }));
    }).finally(() => {
      if (current === generation.current) setLoading(false);
      if (pending.current === task) pending.current = null;
    });
    pending.current = task;
    return task;
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    const stop = listenDesktop<NpcSnapshot>("npc-changed", ({ payload }) => setData(payload));
    const stopAuth = listenDesktop("auth-changed", () => {
      generation.current += 1; pending.current = null;
      setData(EMPTY); void refresh();
    });
    void refresh();
    const timer = setInterval(() => void refresh(), 90_000);
    return () => { generation.current += 1; pending.current = null; clearInterval(timer); stop(); stopAuth(); };
  }, [refresh]);
  return { data, loading, refresh };
}
