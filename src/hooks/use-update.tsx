import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  available: boolean;
  link: string | null;
  notes: string | null;
  publishedAt: number | null;
  checkedAt: number | null;
  error: string | null;
}

interface UpdateContextValue {
  update: UpdateInfo | null;
  checking: boolean;
  error: string | null;
  check: () => Promise<void>;
}
const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(isTauri());
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const check = useCallback((): Promise<void> => {
    if (!isTauri()) return Promise.resolve();
    if (pending.current) return pending.current;
    const task = invoke<UpdateInfo>("update_check").then((next) => {
      setUpdate(next);
      setError(null);
    }).catch((commandError: unknown) => {
      setError(String(commandError));
    }).finally(() => {
      setChecking(false);
      if (pending.current === task) pending.current = null;
    });
    pending.current = task;
    return task;
  }, []);
  useEffect(() => { void check(); }, [check]);
  return <UpdateContext.Provider value={{ update, checking, error, check }}>{children}</UpdateContext.Provider>;
}

export function useUpdate() {
  const context = useContext(UpdateContext);
  if (!context) throw new Error("useUpdate requires UpdateProvider");
  return context;
}
