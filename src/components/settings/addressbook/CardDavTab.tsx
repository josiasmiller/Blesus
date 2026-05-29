import { useEffect, useState } from "react";
import {
  Plus, Trash2, Pencil, RefreshCw, X, Check, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { toast } from "@/stores/toasts";
import { ipc } from "@/lib/ipc";
import {
  upsertContactFromVCard,
  listCardDavAccounts,
  insertCardDavAccount,
  updateCardDavAccount,
  deleteCardDavAccount,
  type CardDavAccountRow,
} from "@/lib/db";
import {
  cardDavListCollection,
  cardDavGetCard,
  resolveHref,
} from "@/lib/carddav";
import { parseVCards } from "@/lib/vcard";
import { secretKeyCardDav } from "./shared";

export function CardDavTab() {
  const [accounts, setAccounts] = useState<CardDavAccountRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState<CardDavAccountRow | null>(null);
  const [syncing, setSyncing] = useState<Record<number, boolean>>({});

  const load = async () => {
    const rows = await listCardDavAccounts().catch(() => []);
    setAccounts(rows);
  };

  useEffect(() => { void load(); }, []);

  const handleDelete = async (a: CardDavAccountRow) => {
    if (!window.confirm(`Remove "${a.display_name}"? Local contacts will be kept.`)) return;
    await ipc.secretsDelete(secretKeyCardDav(a.id)).catch(() => {});
    await deleteCardDavAccount(a.id).catch((e) => toast.error(`${e}`));
    void load();
  };

  const handleSync = async (a: CardDavAccountRow) => {
    setSyncing((s) => ({ ...s, [a.id]: true }));
    try {
      const password = await ipc.secretsLoad(secretKeyCardDav(a.id)).catch(() => null) ?? "";
      let imported = 0;
      let errors = 0;

      const entries = await cardDavListCollection(a.server_url, a.username, password);

      for (const entry of entries) {
        const fullUrl = resolveHref(a.server_url, entry.href);
        try {
          const { vcard, etag } = await cardDavGetCard(fullUrl, a.username, password);
          const cards = parseVCards(vcard);
          for (const card of cards) {
            const email = card.emails[0];
            if (!email) continue;
            await upsertContactFromVCard({
              email,
              displayName: card.fullName || null,
              phone: card.phones[0] ?? null,
              notes: card.notes,
              vcardUid: card.uid,
              cardavEtag: etag || entry.etag,
              cardavUrl: fullUrl,
              cardavAccountId: a.id,
            });
            imported++;
          }
        } catch {
          errors++;
        }
      }

      await updateCardDavAccount(a.id, { lastSyncedAt: Math.floor(Date.now() / 1000) });
      void load();

      const msg = errors > 0
        ? `Synced ${imported} contacts (${errors} errors).`
        : `Synced ${imported} contacts.`;
      toast.success(msg);
    } catch (e) {
      toast.error(`Sync failed: ${e}`);
    } finally {
      setSyncing((s) => ({ ...s, [a.id]: false }));
    }
  };

  return (
    <div className="px-10 py-6 flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-primary">CardDAV Servers</h3>
          <p className="text-[12px] text-muted mt-0.5">
            Connect to Nextcloud, Apple iCloud Contacts, Fastmail, or any CardDAV server.
          </p>
        </div>
        <Button variant="secondary" onClick={() => { setShowForm(true); setEditAccount(null); }}
          leading={<Plus size={13} />}>
          Add Server
        </Button>
      </div>

      {accounts.length === 0 && !showForm && (
        <div className="rounded-xl border border-soft bg-sunken px-6 py-10 text-center text-[13px] text-muted">
          No CardDAV servers connected yet.
        </div>
      )}

      {accounts.map((a) => (
        <div key={a.id} className="rounded-xl border border-soft bg-raised p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-primary">{a.display_name}</p>
              <p className="text-[11.5px] text-muted truncate mt-0.5">{a.server_url}</p>
              <p className="text-[11px] text-disabled mt-0.5">
                {a.username}
                {a.last_synced_at
                  ? ` · Last sync: ${new Date(a.last_synced_at * 1000).toLocaleString()}`
                  : " · Never synced"}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" title="Sync now"
                disabled={syncing[a.id]}
                onClick={() => void handleSync(a)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-primary disabled:opacity-40">
                {syncing[a.id] ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              </button>
              <button type="button" title="Edit"
                onClick={() => { setEditAccount(a); setShowForm(true); }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-primary">
                <Pencil size={13} />
              </button>
              <button type="button" title="Remove"
                onClick={() => void handleDelete(a)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-[color:var(--color-danger)]">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      ))}

      {showForm && (
        <CardDavAccountForm
          account={editAccount}
          onSave={async (data, password) => {
            if (editAccount) {
              await updateCardDavAccount(editAccount.id, {
                displayName: data.displayName,
                serverUrl: data.serverUrl,
                username: data.username,
              });
              if (password) await ipc.secretsSave(secretKeyCardDav(editAccount.id), password);
            } else {
              const id = await insertCardDavAccount(data);
              if (password) await ipc.secretsSave(secretKeyCardDav(id), password);
            }
            toast.success(editAccount ? "Updated." : "Server added.");
            setShowForm(false);
            setEditAccount(null);
            void load();
          }}
          onCancel={() => { setShowForm(false); setEditAccount(null); }}
        />
      )}

      {/* Usage hint */}
      <div className="rounded-lg border border-soft bg-sunken px-4 py-3 text-[12px] text-muted space-y-1">
        <p className="font-medium text-secondary">Server URL examples</p>
        <p>Nextcloud: <code className="text-[11.5px]">https://cloud.example.com/remote.php/dav/addressbooks/users/USERNAME/contacts/</code></p>
        <p>Fastmail: <code className="text-[11.5px]">https://carddav.fastmail.com/dav/addressbooks/user/USERNAME@fastmail.com/Default/</code></p>
        <p>iCloud: <code className="text-[11.5px]">https://contacts.icloud.com/123456789/carddavhome/card/</code></p>
      </div>
    </div>
  );
}

// ── CardDAV Account Form ──────────────────────────────────────────────────

function CardDavAccountForm({
  account,
  onSave,
  onCancel,
}: {
  account: CardDavAccountRow | null;
  onSave: (data: { displayName: string; serverUrl: string; username: string }, password: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(account?.display_name ?? "");
  const [serverUrl, setServerUrl] = useState(account?.server_url ?? "");
  const [username, setUsername] = useState(account?.username ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!serverUrl.trim() || !username.trim()) {
      setError("Server URL and username are required to test.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      await cardDavListCollection(serverUrl.trim(), username.trim(), password);
      setTestResult("ok");
    } catch (e) {
      setTestResult("fail");
      setError(`Connection failed: ${e}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { setError("Display name is required."); return; }
    if (!serverUrl.trim()) { setError("Server URL is required."); return; }
    if (!username.trim()) { setError("Username is required."); return; }
    if (!account && !password) { setError("Password is required for new servers."); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(
        { displayName: displayName.trim(), serverUrl: serverUrl.trim(), username: username.trim() },
        password,
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl border border-[color:var(--accent)] bg-raised p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-primary">
          {account ? "Edit CardDAV Server" : "Add CardDAV Server"}
        </h4>
        <button type="button" onClick={onCancel}
          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:text-primary">
          <X size={13} />
        </button>
      </div>

      <Field label="Name">
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
          placeholder="My Contacts" />
      </Field>
      <Field label="Server URL">
        <Input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)}
          placeholder="https://cloud.example.com/…/contacts/" />
      </Field>
      <Field label="Username">
        <Input value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="username or email" autoComplete="username" />
      </Field>
      <Field label={account ? "Password (leave blank to keep)" : "Password"}>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={account ? "unchanged" : "required"} autoComplete="current-password" />
      </Field>

      {error && <p className="text-[12px] text-[color:var(--color-danger)]">{error}</p>}
      {testResult === "ok" && (
        <p className="text-[12px] text-[color:var(--color-success,#4ade80)]">
          ✓ Connection successful.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={saving}
          leading={saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}>
          {saving ? "Saving…" : account ? "Update" : "Add Server"}
        </Button>
        <Button type="button" variant="secondary" disabled={testing} onClick={() => void handleTest()}
          leading={testing ? <Loader2 size={13} className="animate-spin" /> : undefined}>
          {testing ? "Testing…" : "Test Connection"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
