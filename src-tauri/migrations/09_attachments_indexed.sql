-- Track whether attachment text has been extracted and appended to search_index.
-- Once set, re-index passes will skip this message instead of re-running OCR.
ALTER TABLE search_index ADD COLUMN attachments_indexed_at INTEGER DEFAULT NULL;
