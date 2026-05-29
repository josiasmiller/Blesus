import { ipc } from "@/lib/ipc";
import { useAccountsStore } from "@/stores/accounts";
import { useUiStore } from "@/stores/ui";

// Mirrors the unread count shown on Inbox folders across all accounts onto
// the Windows taskbar as an overlay icon. Subscribes once; fires the IPC
// only when the effective total actually changes.
export function attachTaskbarBadge(): void {
  let last = -1;

  // Serialize IPC calls so a slow windowSetUnreadBadge(0) can never
  // resolve *after* a subsequent windowSetUnreadBadge(1) and accidentally
  // clear the badge.  We keep only one in-flight call at a time; if a new
  // value arrives while one is pending we record it and re-fire as soon as
  // the current call settles.
  let inFlight: Promise<void> | null = null;
  let wantedTotal = -1;

  const fireIpc = (total: number): void => {
    wantedTotal = total;
    if (inFlight) return; // will be picked up on completion
    const fire = () => {
      const t = wantedTotal;
      inFlight = ipc
        .windowSetUnreadBadge(t)
        .then(() => {
          console.log("[badge] ok", t);
          inFlight = null;
          if (wantedTotal !== t) fire(); // a newer value arrived while we were in flight
        })
        .catch((e) => {
          console.warn("[badge] failed", t, e);
          inFlight = null;
        });
    };
    fire();
  };

  const publish = (total: number) => {
    if (total === last) return;
    last = total;
    console.log("[badge] publish total=", total);
    fireIpc(total);
  };

  // Exclude system folders that should never count towards "new mail":
  // sent, drafts, trash, and anything spam-like. Every other folder
  // (inbox AND custom rule-destination folders) contributes to the badge.
  const EXCLUDED_USE = new Set(["sent", "drafts", "trash", "junk"]);
  const SPAMMY_NAME = /\b(spam|junk)\b/i;
  const computeUnread = (
    folders: ReturnType<typeof useAccountsStore.getState>["folders"],
  ) =>
    folders
      .filter(
        (f) =>
          !EXCLUDED_USE.has(f.specialUse ?? "") &&
          !SPAMMY_NAME.test(f.name) &&
          !SPAMMY_NAME.test(f.path),
      )
      .reduce((sum, f) => sum + (f.unreadCount || 0), 0);

  const recompute = () => {
    const enabled = useUiStore.getState().taskbarBadgeEnabled;
    if (!enabled) {
      publish(0);
      return;
    }
    const folders = useAccountsStore.getState().folders;
    const total = computeUnread(folders);
    if (total !== last) {
      // Log which folders are contributing (or not) so we can diagnose badge flips
      const breakdown = folders
        .filter(
          (f) =>
            !EXCLUDED_USE.has(f.specialUse ?? "") &&
            !SPAMMY_NAME.test(f.name) &&
            !SPAMMY_NAME.test(f.path),
        )
        .map((f) => `${f.name}(${f.unreadCount ?? 0})`)
        .join(" ");
      console.log("[badge] recompute total=", total, "folders:", breakdown, new Error().stack?.split("\n")[2]?.trim());
    }
    publish(total);
  };

  recompute();
  useAccountsStore.subscribe(recompute);
  useUiStore.subscribe(recompute);
}
