-- "Send only" accounts appear as From options in the Composer but have no IMAP inbox.
ALTER TABLE accounts ADD COLUMN is_send_only INTEGER NOT NULL DEFAULT 0;
