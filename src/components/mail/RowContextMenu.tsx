import { useEffect, useRef } from "react";
import {
  Archive,
  Trash2,
  Star,
  MailOpen,
  Mail,
  CornerUpLeft,
  Forward,
  FolderInput,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useThreadsStore } from "@/stores/threads";
import { useComposerStore } from "@/stores/composer";
import { useBodiesStore } from "@/stores/bodies";
import { useAccountsStore } from "@/stores/accounts";
import { useUiStore } from "@/stores/ui";
import type { Thread } from "@/types";

export interface ContextMenuState {
  thread: Thread;
  x: number;
  y: number;
}

export function RowContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const toggleStar = useThreadsStore((s) => s.toggleStar);
  const archiveThread = useThreadsStore((s) => s.archiveThread);
  const trashThread = useThreadsStore((s) => s.trashThread);
  const permanentDeleteThread = useThreadsStore((s) => s.permanentDeleteThread);
  const activeFolderId = useAccountsStore((s) => s.activeFolderId);
  const folders = useAccountsStore((s) => s.folders);
  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const markRead = useThreadsStore((s) => s.markRead);
  const markUnread = useThreadsStore((s) => s.markUnread);
  const openReply = useComposerStore((s) => s.openReply);
  const openForward = useComposerStore((s) => s.openForward);

  const { thread } = state;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Clamp to viewport so the menu doesn't overflow off-screen.
  const menuWidth = 200;
  const menuHeight = 320;
  const x = Math.min(state.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(state.y, window.innerHeight - menuHeight - 8);

  function run<T>(fn: () => T): void {
    onClose();
    try {
      const r = fn();
      if (r instanceof Promise) void r;
    } catch (err) {
      console.error("context-menu action failed:", err);
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        left: x,
        top: y,
        background: "var(--bg-raised)",
        borderColor: "var(--border-strong)",
        boxShadow: "var(--shadow-md)",
      }}
      className={cn(
        "fixed z-[70] w-[200px] rounded-lg border p-1",
        "fade-in",
      )}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem
        icon={<CornerUpLeft size={14} />}
        label="Reply"
        onClick={() => {
          const folder = useAccountsStore.getState().folders.find((f) => f.id === thread.folderId);
          const body = useBodiesStore.getState().bodies[`${folder?.path ?? ""}:${thread.id}`];
          const activeAccountEmail = useAccountsStore.getState().accounts.find((a) => a.id === useAccountsStore.getState().activeAccountId)?.email ?? null;
          run(() => openReply(thread, body?.html ?? null, body?.text ?? null, null, null, activeAccountEmail));
        }}
      />
      <MenuItem
        icon={<Forward size={14} />}
        label="Forward"
        onClick={() => {
          const folder = useAccountsStore.getState().folders.find((f) => f.id === thread.folderId);
          const body = useBodiesStore.getState().bodies[`${folder?.path ?? ""}:${thread.id}`];
          run(() => openForward(thread, body?.html ?? null, body?.text ?? null, null));
        }}
      />
      <Divider />
      <MenuItem
        icon={<Archive size={14} />}
        label="Archive"
        onClick={() => run(() => archiveThread(thread.id))}
      />
      <MenuItem
        icon={<Trash2 size={14} />}
        label={activeFolder?.specialUse === "trash" || /^(trash|deleted(\s*items?)?)$/i.test(activeFolder?.name ?? "") || /^(trash|deleted(\s*items?)?)$/i.test((activeFolder?.path ?? "").split(/[\/. \\]/).filter(Boolean).pop() ?? "") ? "Delete permanently" : "Move to Trash"}
        danger
        onClick={() => {
          const leaf = (activeFolder?.path ?? "").split(/[\/. \\]/).filter(Boolean).pop() ?? "";
          const inTrash = activeFolder?.specialUse === "trash" || /^(trash|deleted(\s*items?)?)$/i.test(activeFolder?.name ?? "") || /^(trash|deleted(\s*items?)?)$/i.test(leaf);
          run(() => inTrash ? permanentDeleteThread(thread.id) : trashThread(thread.id));
        }}
      />
      <MenuItem
        icon={<FolderInput size={14} />}
        label="Move to folder…"
        onClick={() => run(() => useUiStore.getState().openMove(thread.id))}
      />
      <Divider />
      <MenuItem
        icon={<Star size={14} />}
        label={thread.isPinned ? "Unstar" : "Star"}
        onClick={() => run(() => toggleStar(thread.id))}
      />
      <Divider />
      <MenuItem
        icon={thread.hasUnread ? <MailOpen size={14} /> : <Mail size={14} />}
        label={thread.hasUnread ? "Mark as read" : "Mark as unread"}
        onClick={() => {
          if (thread.hasUnread) run(() => markRead(thread.id, { force: true }));
          else run(() => markUnread(thread.id));
        }}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2.5 w-full h-8 rounded-md px-2 text-[12.5px] text-left",
        "transition-colors",
        disabled
          ? "text-disabled cursor-not-allowed"
          : "text-secondary hover:bg-hover hover:text-primary",
        danger && !disabled && "hover:text-[color:var(--color-danger)]",
      )}
    >
      <span className={cn("flex items-center justify-center", disabled ? "" : "text-muted")}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="h-px my-1" style={{ background: "var(--border-soft)" }} />;
}
