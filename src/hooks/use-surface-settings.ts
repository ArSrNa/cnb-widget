import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listenDesktop } from "@/lib/desktop";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";

export function useSurfaceSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let changed = false;
    const stop = listenDesktop<AppSettings>("settings-changed", ({ payload }) => {
      changed = true;
      setSettings(payload);
    });
    void invoke<AppSettings>("settings_get").then((value) => {
      if (!disposed && !changed) setSettings(value);
    }).catch(() => {});
    return () => { disposed = true; stop(); };
  }, []);
  return settings;
}
