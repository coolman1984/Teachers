-- Hessa gateway: a read-only mailbox between the centre PCs and the parents' phones.
-- Nothing here is a source of truth: the centre database is. A card is replaced on every change, deleted when the link is
-- replaced or the student removed, and by a daily cleanup a week after it expires.
CREATE TABLE IF NOT EXISTS cards (
  token_hash   TEXT PRIMARY KEY,          -- sha256 of the link token; the token itself is never stored
  student_id   TEXT NOT NULL,
  body         TEXT NOT NULL,             -- what the parent sees (JSON): one child, no phone numbers
  cancelled    INTEGER NOT NULL DEFAULT 0,
  expires_at   INTEGER,                   -- unix seconds
  updated_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate (key TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (key, window));
