-- Apply to the isolated database first. This migration does not change fixture data.
BEGIN;

ALTER TABLE footy_cutover.matches
  ADD COLUMN pending_kickoff_date date,
  ALTER COLUMN kickoff_at DROP NOT NULL,
  ALTER COLUMN deadline_at DROP NOT NULL,
  ADD CONSTRAINT matches_pending_kickoff_consistency CHECK (
    (pending_kickoff_date IS NULL AND kickoff_at IS NOT NULL AND deadline_at IS NOT NULL)
    OR
    (pending_kickoff_date IS NOT NULL AND kickoff_at IS NULL AND deadline_at IS NULL
     AND status = 'scheduled' AND home_score IS NULL AND away_score IS NULL)
  );

COMMIT;
