-- T16 Thread Repair v2: store original location + RFC-5322 Message-ID so
-- a message that has been physically moved to the "Thread Repair" IMAP folder
-- can be identified and moved back to any desired folder.
--
-- original_folder_path : IMAP path the message was in before the move (empty
--                        string for legacy "reference-only" entries).
-- message_id           : RFC 5322 Message-ID header value (survives IMAP moves
--                        because UIDs change but Message-ID does not).

ALTER TABLE thread_repair_items ADD COLUMN original_folder_path TEXT NOT NULL DEFAULT '';
ALTER TABLE thread_repair_items ADD COLUMN message_id TEXT;
