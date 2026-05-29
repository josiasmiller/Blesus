-- Migration 12 backfilled subject_normalized with LOWER(TRIM(...)) which did
-- NOT strip Re:/Fwd: prefixes.  Any sent_log row whose subject_normalized
-- still starts with a reply/forward prefix is fixed here by iterative
-- single-level stripping (SQLite has no regex replace).
-- Four passes handle up to four nested prefixes ("Re: Re: Re: Re: …").

-- sent_log ----------------------------------------------------------------
-- Pass 1
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 're: %';
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 6)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'fwd: %';
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'fw: %';
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'aw: %';
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'sv: %';
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'vs: %';
-- Pass 2
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 're: %';
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 6)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'fwd: %';
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'fw: %';
-- Pass 3
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 're: %';
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 6)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'fwd: %';
-- Pass 4
UPDATE sent_log SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 're: %';

-- messages ----------------------------------------------------------------
-- (upsertMessageSummary re-normalizes on every sync, but fix old rows now.)
-- Pass 1
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 're: %';
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 6)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'fwd: %';
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'fw: %';
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'aw: %';
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'sv: %';
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'vs: %';
-- Pass 2
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 're: %';
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 6)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'fwd: %';
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 'fw: %';
-- Pass 3
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 're: %';
-- Pass 4
UPDATE messages SET subject_normalized = LOWER(TRIM(SUBSTR(subject_normalized, 5)))
  WHERE LOWER(TRIM(subject_normalized)) LIKE 're: %';
