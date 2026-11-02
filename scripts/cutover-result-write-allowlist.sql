-- REVIEW ONLY. Do not apply to Production without separate authorization.
-- Explicit approval must be inserted per match after checking the fixture.
BEGIN;
CREATE TABLE IF NOT EXISTS cutover_auth.result_write_allowlist (
  match_id bigint PRIMARY KEY REFERENCES footy_cutover.matches(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 300)
);
REVOKE ALL ON cutover_auth.result_write_allowlist FROM PUBLIC;
COMMIT;
-- Approval is a separate, manually reviewed INSERT for a single match_id.
-- Never bulk-populate from matches, tours or stages.
