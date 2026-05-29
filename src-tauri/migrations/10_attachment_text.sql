-- Separate body text and attachment/OCR text into independent columns so
-- each can be updated without affecting the other.  FTS5 ranks both.
--
-- After this migration every row has attachment_text = NULL and
-- attachments_indexed_at is cleared so Phase 3 re-populates attachment_text
-- on the next reindex (one-time cost; subsequent reindexes skip already-done rows).

ALTER TABLE search_index ADD COLUMN attachment_text TEXT DEFAULT NULL;

UPDATE search_index SET attachments_indexed_at = NULL;

-- FTS5 virtual tables cannot be ALTERed; drop and recreate with the new column.
DROP TRIGGER IF EXISTS search_index_au;
DROP TRIGGER IF EXISTS search_index_ad;
DROP TRIGGER IF EXISTS search_index_ai;
DROP TABLE IF EXISTS search_fts;

CREATE VIRTUAL TABLE search_fts USING fts5(
    subject, from_address, to_addresses, snippet, text_body, attachment_text,
    content='search_index',
    content_rowid='id',
    tokenize='trigram'
);

CREATE TRIGGER search_index_ai AFTER INSERT ON search_index BEGIN
    INSERT INTO search_fts(rowid, subject, from_address, to_addresses, snippet, text_body, attachment_text)
    VALUES (new.id, new.subject, new.from_address, new.to_addresses, new.snippet, new.text_body, new.attachment_text);
END;

CREATE TRIGGER search_index_ad AFTER DELETE ON search_index BEGIN
    INSERT INTO search_fts(search_fts, rowid, subject, from_address, to_addresses, snippet, text_body, attachment_text)
    VALUES ('delete', old.id, old.subject, old.from_address, old.to_addresses, old.snippet, old.text_body, old.attachment_text);
END;

CREATE TRIGGER search_index_au AFTER UPDATE ON search_index BEGIN
    INSERT INTO search_fts(search_fts, rowid, subject, from_address, to_addresses, snippet, text_body, attachment_text)
    VALUES ('delete', old.id, old.subject, old.from_address, old.to_addresses, old.snippet, old.text_body, old.attachment_text);
    INSERT INTO search_fts(rowid, subject, from_address, to_addresses, snippet, text_body, attachment_text)
    VALUES (new.id, new.subject, new.from_address, new.to_addresses, new.snippet, new.text_body, new.attachment_text);
END;

-- Rebuild FTS from existing search_index data (text_body still has combined
-- content from before the split — keeps search working during transition).
INSERT INTO search_fts(search_fts) VALUES ('rebuild');
