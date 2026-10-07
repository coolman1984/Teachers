-- Run ONCE for a gateway made before version 1.3 (its cards table has no centre column).
-- Back up D1 first. Then run schema.sql again: it adds the new tables and leaves the old ones as they are.
ALTER TABLE cards ADD COLUMN centre TEXT NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN centre TEXT NOT NULL DEFAULT '';
-- Existing cards and pages stay with the centre that made them (the one-centre setup, centre '').
