import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Pencil, Search, X, Users,
  ChevronRight, Check, UserMinus, UserPlus,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { toast } from "@/stores/toasts";
import {
  listContactsFull,
  listContactGroups,
  insertContactGroup,
  updateContactGroup,
  deleteContactGroup,
  listContactsInGroup,
  addContactToGroup,
  removeContactFromGroup,
  type ContactRowFull,
  type ContactGroupRow,
} from "@/lib/db";
import { initials } from "./shared";

const PICKER_DEBOUNCE_MS = 120;
const PICKER_LIMIT = 20;

export function GroupsTab() {
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);
  const [selected, setSelected] = useState<ContactGroupRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [members, setMembers] = useState<ContactRowFull[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  // Contact picker for adding a member
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<ContactRowFull[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  // O(1) membership lookup for picker filtering.
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const loadGroups = async () => {
    const rows = await listContactGroups().catch(() => []);
    setGroups(rows);
    if (selected) {
      const fresh = rows.find((g) => g.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  };

  const loadMembers = async (groupId: number) => {
    setLoadingMembers(true);
    try {
      const rows = await listContactsInGroup(groupId);
      setMembers(rows);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => { void loadGroups(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selected) void loadMembers(selected.id);
    else setMembers([]);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pickerSearch.trim()) { setPickerResults([]); return; }
    const t = setTimeout(() => {
      void listContactsFull({ search: pickerSearch.trim(), limit: PICKER_LIMIT }).then(setPickerResults);
    }, PICKER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [pickerSearch]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) { setGroupError("Name is required."); return; }
    setSavingGroup(true);
    setGroupError(null);
    try {
      await insertContactGroup(newGroupName.trim());
      setNewGroupName("");
      setAdding(false);
      await loadGroups();
    } catch (e) {
      setGroupError(String(e));
    } finally {
      setSavingGroup(false);
    }
  };

  const handleRename = async () => {
    if (!selected || !newGroupName.trim()) return;
    setSavingGroup(true);
    setGroupError(null);
    try {
      await updateContactGroup(selected.id, newGroupName.trim());
      setEditingName(false);
      await loadGroups();
    } catch (e) {
      setGroupError(String(e));
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDeleteGroup = async (g: ContactGroupRow) => {
    if (!window.confirm(`Delete group "${g.name}"? Members won't be deleted.`)) return;
    await deleteContactGroup(g.id).catch((e) => toast.error(`${e}`));
    if (selected?.id === g.id) setSelected(null);
    await loadGroups();
  };

  const handleAddMember = async (contact: ContactRowFull) => {
    if (!selected) return;
    await addContactToGroup(selected.id, contact.id).catch((e) => toast.error(`${e}`));
    setPickerSearch("");
    setPickerResults([]);
    setShowPicker(false);
    await Promise.all([loadMembers(selected.id), loadGroups()]);
  };

  const handleRemoveMember = async (contact: ContactRowFull) => {
    if (!selected) return;
    await removeContactFromGroup(selected.id, contact.id).catch((e) => toast.error(`${e}`));
    await Promise.all([loadMembers(selected.id), loadGroups()]);
  };

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
      {/* Left panel: group list */}
      <div className="w-[404px] shrink-0 flex flex-col border-r border-soft overflow-hidden">
        <div className="flex items-center gap-1 px-3 py-2.5 border-b border-soft shrink-0">
          <span className="flex-1 text-[12px] font-medium text-muted uppercase tracking-[0.06em]">
            Groups
          </span>
          <button
            type="button"
            title="New group"
            onClick={() => { setAdding(true); setEditingName(false); setNewGroupName(""); setGroupError(null); }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-primary shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* New group input */}
        {adding && (
          <div className="flex items-center gap-1 px-2 py-2 border-b border-soft shrink-0">
            <input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateGroup();
                if (e.key === "Escape") { setAdding(false); setGroupError(null); }
              }}
              placeholder="Group name…"
              className="flex-1 min-w-0 px-2 py-1 text-[12px] rounded-md bg-sunken border border-soft outline-none focus:border-[color:var(--accent)] text-primary"
            />
            <button type="button" disabled={savingGroup} onClick={() => void handleCreateGroup()}
              className="flex h-6 w-6 items-center justify-center rounded text-[color:var(--accent)] hover:bg-hover disabled:opacity-40">
              <Check size={13} />
            </button>
            <button type="button" onClick={() => { setAdding(false); setGroupError(null); }}
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:text-primary">
              <X size={13} />
            </button>
          </div>
        )}
        {groupError && adding && (
          <p className="px-3 py-1 text-[11px] text-[color:var(--color-danger)]">{groupError}</p>
        )}

        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 && (
            <p className="text-[12px] text-muted px-4 py-3">No groups yet.</p>
          )}
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => { setSelected(g); setEditingName(false); setShowPicker(false); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-hover",
                selected?.id === g.id && "bg-hover",
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                <Users size={13} />
              </span>
              <span className="flex-1 min-w-0">
                <div className="text-[12.5px] text-primary truncate">{g.name}</div>
                <div className="text-[11px] text-muted">
                  {g.member_count} member{g.member_count !== 1 ? "s" : ""}
                </div>
              </span>
              {selected?.id === g.id && <ChevronRight size={12} className="text-muted shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Right panel: group detail */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-40">
            <Users size={32} />
            <p className="text-[13px]">Select a group or create a new one.</p>
          </div>
        )}

        {selected && (
          <div className="flex flex-col gap-5 max-w-lg">
            {/* Group name header */}
            <div className="flex items-start justify-between gap-3">
              {editingName ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleRename();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    className="flex-1 px-2 py-1 text-[14px] font-semibold rounded-lg border border-soft bg-sunken outline-none focus:border-[color:var(--accent)] text-primary"
                  />
                  <button type="button" disabled={savingGroup} onClick={() => void handleRename()}
                    className="flex h-7 w-7 items-center justify-center rounded text-[color:var(--accent)] hover:bg-hover disabled:opacity-40">
                    <Check size={14} />
                  </button>
                  <button type="button" onClick={() => setEditingName(false)}
                    className="flex h-7 w-7 items-center justify-center rounded text-muted hover:text-primary">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <h3 className="text-[15px] font-semibold text-primary flex-1 min-w-0 truncate">
                  {selected.name}
                </h3>
              )}
              {!editingName && (
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" title="Rename group"
                    onClick={() => { setEditingName(true); setNewGroupName(selected.name); setGroupError(null); }}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-primary">
                    <Pencil size={13} />
                  </button>
                  <button type="button" title="Delete group"
                    onClick={() => void handleDeleteGroup(selected)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-[color:var(--color-danger)]">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            {groupError && editingName && (
              <p className="text-[12px] text-[color:var(--color-danger)] -mt-3">{groupError}</p>
            )}

            {/* Members list */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                  Members ({members.length})
                </span>
                <button
                  type="button"
                  onClick={() => { setShowPicker((v) => !v); setPickerSearch(""); setPickerResults([]); }}
                  className="flex items-center gap-1 text-[11.5px] text-[color:var(--accent)] hover:opacity-80"
                >
                  <UserPlus size={12} />
                  Add member
                </button>
              </div>

              {/* Inline contact picker */}
              {showPicker && (
                <div className="rounded-lg border border-soft bg-sunken p-2 mb-2 flex flex-col gap-1.5">
                  <div className="relative">
                    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      autoFocus
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Search contacts…"
                      className="w-full pl-6 pr-2 py-1.5 text-[12px] rounded-md bg-raised border border-soft outline-none focus:border-[color:var(--accent)] text-primary placeholder:text-disabled"
                    />
                  </div>
                  {pickerResults.length === 0 && pickerSearch.trim() && (
                    <p className="text-[11.5px] text-muted px-1">No contacts found.</p>
                  )}
                  {pickerResults.length === 0 && !pickerSearch.trim() && (
                    <p className="text-[11.5px] text-muted px-1">Type to search contacts.</p>
                  )}
                  <div className="flex flex-col max-h-[180px] overflow-y-auto">
                    {pickerResults
                      .filter((c) => !memberIds.has(c.id))
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => void handleAddMember(c)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover text-left"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)] text-[9px] font-semibold">
                            {initials(c)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="text-[12px] text-primary truncate block">{c.display_name || c.email}</span>
                            {c.display_name && <span className="text-[11px] text-muted truncate block">{c.email}</span>}
                          </span>
                          <UserPlus size={11} className="text-muted shrink-0" />
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {loadingMembers && <p className="text-[12px] text-muted py-2">Loading…</p>}
              {!loadingMembers && members.length === 0 && (
                <p className="text-[12px] text-muted py-2">No members yet. Add some above.</p>
              )}
              {!loadingMembers && members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-hover group"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)] text-[10.5px] font-semibold">
                    {initials(m)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <div className="text-[12.5px] text-primary truncate">{m.display_name || m.email}</div>
                    {m.display_name && <div className="text-[11px] text-muted truncate">{m.email}</div>}
                  </span>
                  <button
                    type="button"
                    title="Remove from group"
                    onClick={() => void handleRemoveMember(m)}
                    className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded text-muted hover:text-[color:var(--color-danger)] transition-opacity"
                  >
                    <UserMinus size={13} />
                  </button>
                </div>
              ))}
            </div>

            {/* Hint */}
            {members.length > 0 && (
              <p className="text-[11.5px] text-muted mt-1">
                Type the group name in the composer To/Cc field to expand all members at once.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
