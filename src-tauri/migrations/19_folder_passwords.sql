-- Password-protected folders: stores a PBKDF2-derived hash so users can lock
-- individual folders behind a local password. The hash is never sent anywhere.
CREATE TABLE IF NOT EXISTS folder_passwords (
    folder_id INTEGER PRIMARY KEY REFERENCES folders(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL
);
