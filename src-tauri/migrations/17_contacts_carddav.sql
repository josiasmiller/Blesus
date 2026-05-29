-- Extend contacts table with address-book fields and add CardDAV server accounts.

ALTER TABLE contacts ADD COLUMN phone TEXT;
ALTER TABLE contacts ADD COLUMN notes TEXT;
-- UID from the vCard record (used as the CardDAV resource identifier).
ALTER TABLE contacts ADD COLUMN vcard_uid TEXT;
-- ETag returned by the CardDAV server; used to skip unchanged cards on re-sync.
ALTER TABLE contacts ADD COLUMN carddav_etag TEXT;
-- Full URL of this vCard resource on the server (e.g. .../contacts/uid.vcf).
ALTER TABLE contacts ADD COLUMN carddav_url TEXT;
-- Which CardDAV account this contact was imported from (NULL = local).
ALTER TABLE contacts ADD COLUMN carddav_account_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_vcard_uid
    ON contacts(vcard_uid) WHERE vcard_uid IS NOT NULL;

-- One row per configured CardDAV address-book endpoint.
CREATE TABLE IF NOT EXISTS carddav_accounts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name   TEXT NOT NULL,
    -- Full URL of the addressbook collection, e.g.
    -- https://cloud.example.com/remote.php/dav/addressbooks/users/john/contacts/
    server_url     TEXT NOT NULL,
    username       TEXT NOT NULL,
    -- Password is kept in the OS keyring under key "carddav:<id>".
    last_synced_at INTEGER,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
