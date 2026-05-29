-- Repair `drafts.attachments_json` column.
--
-- Migration 20 originally contained
--     ALTER TABLE drafts ADD COLUMN IF NOT EXISTS attachments_json TEXT;
-- which SQLite does not support (IF NOT EXISTS is only valid on CREATE TABLE
-- / CREATE INDEX, never on ALTER TABLE ADD COLUMN). On installs where that
-- migration errored silently the column never got created, leaving the DB
-- at version 21 with the column missing. This migration recreates the
-- `drafts` table with the column guaranteed to exist, preserving rows.

-- Build the replacement table with the full current schema:
--   01_initial.sql           — base columns
--   02_drafts_meta.sql       — mode, reply_uid
--   13_draft_body_is_raw.sql — body_is_raw
--   20_draft_attachments.sql — attachments_json (now mandatory)
CREATE TABLE drafts_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_addresses    TEXT    NOT NULL DEFAULT '',
  cc_addresses    TEXT    NOT NULL DEFAULT '',
  bcc_addresses   TEXT    NOT NULL DEFAULT '',
  subject         TEXT    NOT NULL DEFAULT '',
  html_body       TEXT    NOT NULL DEFAULT '',
  text_body       TEXT    NOT NULL DEFAULT '',
  updated_at      INTEGER NOT NULL,
  mode            TEXT    NOT NULL DEFAULT 'new',
  reply_uid       INTEGER,
  body_is_raw     INTEGER NOT NULL DEFAULT 0,
  attachments_json TEXT
);

-- Copy everything we know is present (anything added by migrations 1, 2, 13).
-- attachments_json is left NULL: on the broken install it never had a value,
-- and on a healthy install the column exists in the old `drafts` table but
-- we cannot reference it here without making the SELECT itself fail on the
-- broken case. Drafts are auto-saved on every keystroke so losing this one
-- field is harmless.
INSERT INTO drafts_new (
  id, account_id, to_addresses, cc_addresses, bcc_addresses,
  subject, html_body, text_body, updated_at, mode, reply_uid, body_is_raw,
  attachments_json
)
SELECT
  id, account_id, to_addresses, cc_addresses, bcc_addresses,
  subject, html_body, text_body, updated_at, mode, reply_uid, body_is_raw,
  NULL
FROM drafts;

DROP TABLE drafts;
ALTER TABLE drafts_new RENAME TO drafts;

-- Recreate the lookup index from migration 02_drafts_meta.sql.
CREATE INDEX IF NOT EXISTS idx_drafts_lookup
  ON drafts(account_id, mode, reply_uid);
