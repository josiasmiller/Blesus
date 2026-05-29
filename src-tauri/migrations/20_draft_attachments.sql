-- NOTE: This file originally used `ADD COLUMN IF NOT EXISTS`, which SQLite
-- does not support (IF NOT EXISTS is only valid on CREATE TABLE / CREATE
-- INDEX). The migration silently errored and version 20 was marked applied
-- without adding the column. The repair lives in
-- `22_drafts_attachments_repair.sql`. This file is kept as a no-op so fresh
-- installs go through the same migration chain as upgrades.
SELECT 1;
