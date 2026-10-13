import { isTauri } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";

// Unmount may happen before native listener registration resolves.
export function listenDesktop<T>(name: string, handler: (event: Event<T>) => void) {
  if (!isTauri()) return () => {};
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void listen<T>(name, handler).then((stop) => {
    if (disposed) stop();
    else unlisten = stop;
  }).catch(() => {});
  return () => {
    disposed = true;
    unlisten?.();
  };
}
