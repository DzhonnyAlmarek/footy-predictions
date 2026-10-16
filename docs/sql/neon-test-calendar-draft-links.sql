-- Apply only after validation on isolated Neon test branch.
-- Supports imported OR sandbox draft stage/tour links for new sandbox matches.
-- Existing imported links are retained.
BEGIN;
ALTER TABLE footy_sandbox.calendar_new_matches
 ADD COLUMN IF NOT EXISTS draft_stage_id bigint REFERENCES footy_sandbox.stage_drafts(draft_id),
 ADD COLUMN IF NOT EXISTS draft_tour_id bigint REFERENCES footy_sandbox.tour_drafts(draft_id);
ALTER TABLE footy_sandbox.calendar_new_matches ALTER COLUMN stage_id DROP NOT NULL;
ALTER TABLE footy_sandbox.calendar_new_matches ALTER COLUMN tour_id DROP NOT NULL;
-- On the first application only. Do not re-run ADD CONSTRAINT without checking catalog.
ALTER TABLE footy_sandbox.calendar_new_matches
 ADD CONSTRAINT calendar_new_exactly_one_stage CHECK ((stage_id IS NOT NULL) <> (draft_stage_id IS NOT NULL)),
 ADD CONSTRAINT calendar_new_exactly_one_tour CHECK ((tour_id IS NOT NULL) <> (draft_tour_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS calendar_new_draft_stage_idx ON footy_sandbox.calendar_new_matches(draft_stage_id);
CREATE INDEX IF NOT EXISTS calendar_new_draft_tour_idx ON footy_sandbox.calendar_new_matches(draft_tour_id);
COMMIT;
