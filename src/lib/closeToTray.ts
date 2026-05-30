import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc } from "@/lib/ipc";
import { useUiStore } from "@/stores/ui";

// The X button always takes a deterministic action:
//   closeToTray = true  → hide the window, keep process + tray alive
//   closeToTray = false → exit the app fully (app.exit(0))
// Without intercepting, Tauri would just close the window while the tray
// keeps the process running — which visually looks like nothing happened.
//
// On Linux desktops without a working system tray (e.g. GNOME/Wayland without
// the AppIndicator extension) the tray icon may not exist. In that case we
// always quit so the user is never left with a hidden, unreachable window.
//
// Tray availability is stable for the lifetime of the process, so we cache
// the result of the first IPC call.
let trayAvailableCache: boolean | null = null;

async function isTrayAvailable(): Promise<boolean> {
  if (trayAvailableCache !== null) return trayAvailableCache;
  try {
    trayAvailableCache = await invoke<boolean>("is_tray_available");
  } catch {
    trayAvailableCache = false;
  }
  return trayAvailableCache;
}

export async function attachCloseToTray(): Promise<void> {
  const win = getCurrentWindow();
  try {
    await win.onCloseRequested(async (event) => {
      event.preventDefault();
      if (useUiStore.getState().closeToTray && (await isTrayAvailable())) {
        void win.hide();
      } else {
        void ipc.appQuit().catch(() => {});
      }
    });
  } catch (err) {
    console.warn("onCloseRequested failed:", err);
  }
}
