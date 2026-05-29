import { cn } from "@/lib/cn";
import type { ContactRowFull } from "@/lib/db";

export type Tab = "contacts" | "groups" | "carddav";

export function initials(c: ContactRowFull): string {
  const name = c.display_name || c.email;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]?.[0]}${parts[parts.length - 1]?.[0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function secretKeyCardDav(id: number): string {
  return `carddav.${id}`;
}

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-0.5 px-3 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors",
        active
          ? "border-[color:var(--accent)] text-[color:var(--accent)]"
          : "border-transparent text-muted hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
