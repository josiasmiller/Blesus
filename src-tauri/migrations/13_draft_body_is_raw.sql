-- Marks drafts whose html_body was captured verbatim from a raw email (e.g.
-- via "Send New"), so the composer can render them in an iframe rather than
-- through Tiptap (which would strip complex HTML).
ALTER TABLE drafts ADD COLUMN body_is_raw INTEGER NOT NULL DEFAULT 0;
