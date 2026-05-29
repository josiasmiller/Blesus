import { useEffect, useState } from "react";
import {
  Plus, Trash2, Pencil, Search, Download, Upload,
  User, ChevronRight, Check, Loader2,
} from "lucide-react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { toast } from "@/stores/toasts";
import {
  listContactsFull,
  insertContactFull,
  updateContactFull,
  deleteContactById,
  type ContactRowFull,
} from "@/lib/db";
import { parseVCards, generateVCardFile } from "@/lib/vcard";
import { initials } from "./shared";

const SEARCH_DEBOUNCE_MS = 150;
const LIST_LIMIT = 500;
const EXPORT_LIMIT = Number.MAX_SAFE_INTEGER;

export function ContactsTab() {
  const [contacts, setContacts] = useState<ContactRowFull[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ContactRowFull | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async (q = search) => {
    setLoading(true);
    try {
      const rows = await listContactsFull({ search: q, limit: LIST_LIMIT });
      setContacts(rows);
    } catch (e) {
      toast.error(`Failed to load contacts: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search: refetch when `search` settles.
  useEffect(() => {
    const t = setTimeout(() => { void load(search); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (c: ContactRowFull) => {
    if (!window.confirm(`Delete ${c.display_name || c.email}?`)) return;
    await deleteContactById(c.id).catch((e) => toast.error(`${e}`));
    if (selected?.id === c.id) setSelected(null);
    void load();
  };

  const handleImportVcf = async () => {
    try {
      const path = await openDialog({
        filters: [{ name: "vCard", extensions: ["vcf", "vcard"] }],
      });
      if (!path || Array.isArray(path)) return;
      const content = await readTextFile(path);
      const cards = parseVCards(content);
      if (cards.length === 0) { toast.error("No valid vCards found in file."); return; }
      let imported = 0;
      for (const card of cards) {
        const email = card.emails[0];
        if (!email) continue;
        await insertContactFull({
          email,
          displayName: card.fullName || null,
          phone: card.phones[0] ?? null,
          notes: card.notes,
          vcardUid: card.uid,
        }).catch(() => {});
        imported++;
      }
      toast.success(`Imported ${imported} contact${imported !== 1 ? "s" : ""}.`);
      void load();
    } catch (e) {
      toast.error(`Import failed: ${e}`);
    }
  };

  const handleExportVcf = async () => {
    try {
      const all = await listContactsFull({ limit: EXPORT_LIMIT });
      if (all.length === 0) { toast.error("No contacts to export."); return; }
      const path = await saveDialog({
        defaultPath: "contacts.vcf",
        filters: [{ name: "vCard", extensions: ["vcf"] }],
      });
      if (!path) return;
      const vcf = generateVCardFile(
        all.map((c) => ({
          uid: c.vcard_uid ?? crypto.randomUUID(),
          fullName: c.display_name || c.email,
          firstName: null,
          lastName: c.display_name?.split(" ").slice(1).join(" ") ?? null,
          email: c.email,
          phone: c.phone,
          notes: c.notes,
        })),
      );
      await writeTextFile(path, vcf);
      toast.success(`Exported ${all.length} contacts.`);
    } catch (e) {
      toast.error(`Export failed: ${e}`);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
      {/* List panel */}
      <div className="w-[404px] shrink-0 flex flex-col border-r border-soft overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2.5 border-b border-soft shrink-0">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-6 pr-2 py-1.5 text-[12px] rounded-md bg-sunken border border-soft outline-none focus:border-[color:var(--accent)] text-primary placeholder:text-disabled"
            />
          </div>
          <button
            type="button"
            title="Add contact"
            onClick={() => { setAdding(true); setEditing(false); setSelected(null); }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-primary shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>
        {/* Import / Export */}
        <div className="flex gap-1 px-3 py-1.5 border-b border-soft shrink-0">
          <button type="button" onClick={handleImportVcf}
            className="flex items-center gap-1 text-[11px] text-muted hover:text-primary px-1.5 py-1 rounded">
            <Upload size={11} /> Import
          </button>
          <button type="button" onClick={handleExportVcf}
            className="flex items-center gap-1 text-[11px] text-muted hover:text-primary px-1.5 py-1 rounded">
            <Download size={11} /> Export
          </button>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-[12px] text-muted px-4 py-3">Loading…</p>}
          {!loading && contacts.length === 0 && (
            <p className="text-[12px] text-muted px-4 py-3">
              {search ? "No results." : "No contacts yet."}
            </p>
          )}
          {contacts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setSelected(c); setEditing(false); setAdding(false); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-hover",
                selected?.id === c.id && "bg-hover",
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)] text-[10.5px] font-semibold">
                {initials(c)}
              </span>
              <span className="flex-1 min-w-0">
                <div className="text-[12.5px] text-primary truncate">{c.display_name || c.email}</div>
                {c.display_name && (
                  <div className="text-[11px] text-muted truncate">{c.email}</div>
                )}
              </span>
              {selected?.id === c.id && <ChevronRight size={12} className="text-muted shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Detail / form panel */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {adding && (
          <ContactForm
            contact={null}
            onSave={async (data) => {
              await insertContactFull(data);
              toast.success("Contact added.");
              setAdding(false);
              void load();
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {!adding && selected && editing && (
          <ContactForm
            contact={selected}
            onSave={async (data) => {
              await updateContactFull(selected.id, data);
              toast.success("Saved.");
              setEditing(false);
              void load().then(() => {
                setSelected((prev) => ({ ...prev!, ...data, display_name: data.displayName ?? prev!.display_name }));
              });
            }}
            onCancel={() => setEditing(false)}
          />
        )}
        {!adding && selected && !editing && (
          <ContactDetail
            contact={selected}
            onEdit={() => setEditing(true)}
            onDelete={() => void handleDelete(selected)}
          />
        )}
        {!adding && !selected && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-40">
            <User size={32} />
            <p className="text-[13px]">Select a contact or add a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Contact Detail (read-only) ─────────────────────────────────────────────

function ContactDetail({
  contact,
  onEdit,
  onDelete,
}: {
  contact: ContactRowFull;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 max-w-md">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)] text-[18px] font-semibold shrink-0">
          {initials(contact)}
        </span>
        <div>
          <h3 className="text-[15px] font-semibold text-primary">
            {contact.display_name || contact.email}
          </h3>
          {contact.display_name && (
            <p className="text-[12.5px] text-muted">{contact.email}</p>
          )}
        </div>
      </div>

      {contact.phone && (
        <DetailRow label="Phone">{contact.phone}</DetailRow>
      )}
      {contact.notes && (
        <DetailRow label="Notes">
          <span className="whitespace-pre-wrap">{contact.notes}</span>
        </DetailRow>
      )}
      {contact.carddav_account_id != null && (
        <DetailRow label="Source">CardDAV</DetailRow>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="secondary" onClick={onEdit} leading={<Pencil size={13} />}>
          Edit
        </Button>
        <Button variant="ghost" onClick={onDelete} leading={<Trash2 size={13} />}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-[72px] shrink-0 text-[11px] font-medium uppercase tracking-[0.06em] text-muted pt-0.5">
        {label}
      </span>
      <span className="text-[13px] text-primary flex-1 min-w-0">{children}</span>
    </div>
  );
}

// ── Contact Form (add / edit) ─────────────────────────────────────────────

interface ContactFormValues {
  email: string;
  displayName: string | null;
  phone: string | null;
  notes: string | null;
}

function ContactForm({
  contact,
  onSave,
  onCancel,
}: {
  contact: ContactRowFull | null;
  onSave: (data: ContactFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState(contact?.email ?? "");
  const [name, setName] = useState(contact?.display_name ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Email is required."); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        email: email.trim(),
        displayName: name.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4 max-w-md">
      <h3 className="text-[14px] font-semibold text-primary">
        {contact ? "Edit Contact" : "New Contact"}
      </h3>

      <Field label="Email">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          autoFocus={!contact}
        />
      </Field>
      <Field label="Display Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
        />
      </Field>
      <Field label="Phone">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 123 4567"
        />
      </Field>
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Notes…"
          className="w-full rounded-lg border border-soft bg-raised px-3 py-2 text-[13px] text-primary outline-none focus:border-[color:var(--accent)] resize-none"
        />
      </Field>

      {error && <p className="text-[12px] text-[color:var(--color-danger)]">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={saving}
          leading={saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
