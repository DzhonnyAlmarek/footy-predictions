-- Run ONLY against the disposable Neon cutover branch after confirming the target.
-- This migration does not change historical prediction values.
BEGIN;
CREATE SEQUENCE IF NOT EXISTS footy_cutover.predictions_id_seq;
SELECT setval('footy_cutover.predictions_id_seq',
  GREATEST(COALESCE((SELECT max(id) FROM footy_cutover.predictions), 0), 1), true);
ALTER TABLE footy_cutover.predictions
  ALTER COLUMN id SET DEFAULT nextval('footy_cutover.predictions_id_seq');
ALTER SEQUENCE footy_cutover.predictions_id_seq OWNED BY footy_cutover.predictions.id;
CREATE UNIQUE INDEX IF NOT EXISTS predictions_match_user_unique
  ON footy_cutover.predictions (match_id, user_id);
COMMIT;
