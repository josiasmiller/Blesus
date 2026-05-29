-- Named contact groups (distribution lists).
-- Selecting a group in the composer expands all its members into the To/Cc field.

CREATE TABLE IF NOT EXISTS contact_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Many-to-many: one contact can be in many groups.
CREATE TABLE IF NOT EXISTS contact_group_members (
  group_id   INTEGER NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id)       ON DELETE CASCADE,
  PRIMARY KEY (group_id, contact_id)
);
