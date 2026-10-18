-- Isolated Neon cutover branch only.
-- The ledger has no duplicate user/match pairs in the imported snapshot.
BEGIN;
SELECT setval(pg_get_serial_sequence('footy_cutover.points_ledger','id'),
 GREATEST(COALESCE((SELECT max(id) FROM footy_cutover.points_ledger),0),1),true);
CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_match_user_unique
 ON footy_cutover.points_ledger(match_id,user_id);
COMMIT;
