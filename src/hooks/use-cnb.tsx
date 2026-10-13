import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listenDesktop } from "@/lib/desktop";
import type { AuthInfo, UsageSnapshot } from "@/lib/cnb";

const EMPTY: UsageSnapshot = { username: null, orgs: [], updatedAt: null, error: null };
interface CnbContextValue {
  data: UsageSnapshot;
  auth: AuthInfo | null;
  loading: boolean;
  authError: string | null;
  refresh: (force?: boolean) => Promise<void>;
}
const CnbContext = createContext<CnbContextValue | null>(null);
export function CnbProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(EMPTY);
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [loading, setLoading] = useState(isTauri());
  const [authError, setAuthError] = useState<string | null>(null);
  const version = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const refresh = useCallback((force = false): Promise<void> => {
    if (!isTauri()) return Promise.resolve();
    if (pending.current && !force) return pending.current;
    const requestVersion = version.current;
    setLoading(true);
    const task = invoke<UsageSnapshot>("usage_get", { force }).then((next) => {
      if (version.current === requestVersion) setData(next);
    }).catch((error: unknown) => {
      if (version.current === requestVersion) setData((previous) => ({ ...previous, error: String(error) }));
    }).finally(() => {
      if (version.current === requestVersion) setLoading(false);
      if (pending.current === task) pending.current = null;
    });
    pending.current = task;
    return task;
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    void invoke<AuthInfo>("auth_status").then((next) => { if (!disposed) setAuth(next); })
      .catch((error: unknown) => { if (!disposed) setAuthError(String(error)); });
    const stopAuth = listenDesktop<AuthInfo>("auth-changed", ({ payload }) => {
      version.current += 1;
      pending.current = null;
      setAuth(payload);
      setAuthError(null);
      setData(EMPTY);
      void refresh(true);
    });
    const stopData = listenDesktop<UsageSnapshot>("usage-changed", ({ payload }) => setData(payload));
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => { disposed = true; version.current += 1; pending.current = null; clearInterval(timer); stopAuth(); stopData(); };
  }, [refresh]);
  return <CnbContext.Provider value={{ data, auth, loading, authError, refresh }}>{children}</CnbContext.Provider>;
}
export function useCnb() {
  const context = useContext(CnbContext);
  if (!context) throw new Error("useCnb requires CnbProvider");
  return context;
}
