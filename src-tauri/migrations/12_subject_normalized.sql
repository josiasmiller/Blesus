-- Add subject_normalized column to messages for exact-match threading.
-- The normalized value (lowercase, Re:/Fwd: prefixes stripped) is computed
-- in TypeScript and stored here so we can use = instead of LIKE '%...%'.
ALTER TABLE messages ADD COLUMN subject_normalized TEXT;

-- Back-fill with a best-effort lowercase of the existing subject.
-- Proper prefix stripping happens at next sync via upsertMessageSummary.
UPDATE messages SET subject_normalized = LOWER(TRIM(COALESCE(subject, '')));

-- Also add to sent_log so the conversation query can join it too.
ALTER TABLE sent_log ADD COLUMN subject_normalized TEXT;
UPDATE sent_log SET subject_normalized = LOWER(TRIM(COALESCE(subject, '')));
