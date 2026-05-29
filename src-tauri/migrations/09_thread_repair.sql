-- T14 Thread Repair workspace: a local-only basket for collecting and
-- manually merging mis-threaded conversations.
--
-- thread_id : imap_uid of the thread's representative message (Thread.id)
-- group_id  : NULL = standalone item; shared TEXT value = merged group
--
-- The UNIQUE constraint prevents adding the same thread twice.

CREATE TABLE thread_repair_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    folder_id  INTEGER NOT NULL,
    thread_id  INTEGER NOT NULL,
    subject    TEXT,
    group_id   TEXT,
    added_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(account_id, folder_id, thread_id)
);
