-- Run ONCE for an existing v1 mailbox whose cards table has trip_id.
-- Back up D1 first. Do not run on a new database or one that already has student_id.
ALTER TABLE cards RENAME COLUMN trip_id TO student_id;
CREATE TABLE IF NOT EXISTS revoked_links (token_hash TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS cards_student ON cards (student_id);
-- Existing card contents and permanent revocations are preserved. Old driver tables can stay unused.
