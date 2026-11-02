-- REVIEW ONLY. Do NOT execute against production without separate authorization.
-- Required before enabling ENABLE_CUTOVER_RESULT_WRITES.
-- The imported footy_cutover.points_ledger.id is NOT NULL, has no DEFAULT,
-- and finish_new_match() inserts ledger rows without specifying id.
-- Create a dedicated sequence and initialize it above all existing IDs.
-- All operations below run in a single transaction; no existing rows change.
BEGIN;
LOCK TABLE footy_cutover.points_ledger IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE IF NOT EXISTS footy_cutover.points_ledger_id_seq AS bigint;
ALTER SEQUENCE footy_cutover.points_ledger_id_seq
  OWNED BY footy_cutover.points_ledger.id;
SELECT setval(
  'footy_cutover.points_ledger_id_seq'::regclass,
  GREATEST(COALESCE((SELECT MAX(id) FROM footy_cutover.points_ledger), 0), 1),
  (SELECT count(*) > 0 FROM footy_cutover.points_ledger)
);
ALTER TABLE footy_cutover.points_ledger
  ALTER COLUMN id SET DEFAULT nextval('footy_cutover.points_ledger_id_seq'::regclass);
-- Rollback procedure (requires separate approval):
-- BEGIN; ALTER TABLE footy_cutover.points_ledger ALTER COLUMN id DROP DEFAULT;
-- ALTER SEQUENCE footy_cutover.points_ledger_id_seq OWNED BY NONE;
-- DROP SEQUENCE footy_cutover.points_ledger_id_seq; COMMIT;
COMMIT;
