-- Hessa gateway: a read-only mailbox between the centre PCs and the parents' phones.
-- Nothing here is a source of truth: the centre database is. A card is replaced on every change, deleted when the link is
-- replaced or the student removed, and by a daily cleanup a week after it expires.
CREATE TABLE IF NOT EXISTS cards (
  token_hash   TEXT PRIMARY KEY,          -- sha256 of the link token; the token itself is never stored
  student_id   TEXT NOT NULL,
  body         TEXT NOT NULL,             -- what the parent sees (JSON): one child, no phone numbers
  cancelled    INTEGER NOT NULL DEFAULT 0,
  expires_at   INTEGER,                   -- unix seconds
  updated_at   INTEGER NOT NULL,
  centre       TEXT NOT NULL DEFAULT ''   -- '' = the one centre of an older self-hosted gateway
);
CREATE TABLE IF NOT EXISTS pages (         -- a teacher's public page: subjects, groups and free seats, never a student
  slug       TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  centre     TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate (key TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (key, window));
-- Revocations outlive disposable cards; an offline PC must never revive a replaced link.
CREATE TABLE IF NOT EXISTS revoked_links (token_hash TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS cards_student ON cards (student_id);
-- The seller's service: one row per centre that joined with its subscription code. secret signs the centre's office requests.
CREATE TABLE IF NOT EXISTS centres (
  id         TEXT PRIMARY KEY,
  secret     TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  machines   TEXT NOT NULL,              -- the PCs named in its subscription codes (8-byte hashes, never a Windows id)
  until      INTEGER NOT NULL,           -- last paid day, days since 2026-01-01 (three grace days follow)
  created_at INTEGER NOT NULL,
  seen_at    INTEGER
);
CREATE TABLE IF NOT EXISTS licences (serial INTEGER PRIMARY KEY, centre TEXT NOT NULL, at INTEGER NOT NULL);  -- one code, one centre
-- The owner's phone: the live picture of the centre (replaced on every change) and the phones allowed to read it.
CREATE TABLE IF NOT EXISTS owner_state (centre TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS owner_devices (token_hash TEXT PRIMARY KEY, centre TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS cards_centre ON cards (centre, student_id);
