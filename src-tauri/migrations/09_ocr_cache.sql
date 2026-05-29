-- Per-page OCR word cache for PDF attachments.
-- Populated during indexing and on first open; read by the PDF viewer
-- so subsequent opens show the text overlay instantly without re-running OCR.
CREATE TABLE IF NOT EXISTS attachment_ocr_cache (
  account_id    INTEGER NOT NULL,
  folder_path   TEXT    NOT NULL,
  imap_uid      INTEGER NOT NULL,
  att_index     INTEGER NOT NULL,
  page_num      INTEGER NOT NULL,
  words_json    TEXT    NOT NULL,  -- JSON: [{text,x,y,w,h}, …]
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (account_id, folder_path, imap_uid, att_index, page_num)
);
