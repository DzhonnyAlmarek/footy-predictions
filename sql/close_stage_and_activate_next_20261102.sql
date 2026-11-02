-- Apply after review on an isolated Neon branch; do not run on production automatically.
-- Transactional stage rollover. The caller must be authenticated as ADMIN at API level.
CREATE OR REPLACE FUNCTION footy_cutover.close_stage_and_activate_next(p_current_id bigint, p_next_id bigint)
RETURNS TABLE(closed_stage_id bigint, activated_stage_id bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current footy_cutover.stages%ROWTYPE;
  v_next footy_cutover.stages%ROWTYPE;
  v_total integer;
  v_finished integer;
BEGIN
  -- Serialize competing rollover requests and force all preconditions to be rechecked.
  PERFORM pg_advisory_xact_lock(518260056);
  IF p_current_id = p_next_id THEN RAISE EXCEPTION 'same_stage'; END IF;
  SELECT * INTO v_current FROM footy_cutover.stages WHERE id=p_current_id FOR UPDATE;
  SELECT * INTO v_next FROM footy_cutover.stages WHERE id=p_next_id FOR UPDATE;
  IF NOT FOUND OR v_current.id IS NULL OR v_next.id IS NULL
    OR NOT v_current.is_current OR v_current.status <> 'published'
    OR v_next.is_current OR v_next.status <> 'draft'
    OR (SELECT COUNT(*) FROM footy_cutover.stages WHERE is_current) <> 1
  THEN RAISE EXCEPTION 'invalid_stage_transition'; END IF;
  -- Never skip ahead to an unrelated draft stage.
  IF p_next_id IS DISTINCT FROM (
    SELECT MIN(s.id) FROM footy_cutover.stages s
    WHERE s.id > p_current_id AND s.status='draft'
  ) THEN RAISE EXCEPTION 'next_stage_out_of_order'; END IF;
  IF v_current.matches_required <> 56 OR v_next.matches_required <> 56
  THEN RAISE EXCEPTION 'invalid_stage_match_requirement'; END IF;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE m.status='finished'
    AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL)
    INTO v_total,v_finished
  FROM footy_cutover.matches m WHERE m.stage_id=p_current_id
    AND NOT EXISTS(SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id);
  IF v_total <> 56 OR v_finished <> 56 THEN RAISE EXCEPTION 'stage_matches_not_complete'; END IF;
  IF (SELECT COUNT(*) FROM footy_cutover.matches m WHERE m.stage_id=p_next_id
    AND NOT EXISTS(SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)) <> 56
  THEN RAISE EXCEPTION 'next_stage_not_ready'; END IF;
  IF EXISTS (
    SELECT 1 FROM footy_cutover.predictions p
    JOIN footy_cutover.matches m ON m.id=p.match_id
    WHERE m.stage_id=p_current_id
      AND NOT EXISTS(SELECT 1 FROM footy_cutover.points_ledger l
        WHERE l.match_id=p.match_id AND l.user_id=p.user_id)
  ) OR EXISTS (
    SELECT 1 FROM footy_cutover.points_ledger l
    JOIN footy_cutover.matches m ON m.id=l.match_id
    WHERE m.stage_id=p_current_id
      AND NOT EXISTS(SELECT 1 FROM footy_cutover.predictions p
        WHERE p.match_id=l.match_id AND p.user_id=l.user_id)
      AND NOT EXISTS(SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)
  ) THEN RAISE EXCEPTION 'stage_scoring_incomplete'; END IF;
  -- If either UPDATE fails, PostgreSQL rolls back both updates.
  UPDATE footy_cutover.stages SET is_current=false,status='locked' WHERE id=p_current_id;
  UPDATE footy_cutover.stages SET is_current=true,status='published' WHERE id=p_next_id;
  RETURN QUERY SELECT p_current_id,p_next_id;
END;
$$;

-- Prevent direct calls from public/low-privilege roles; only the DB owner
-- used by the authenticated server-side admin endpoint may execute it.
REVOKE ALL ON FUNCTION footy_cutover.close_stage_and_activate_next(bigint,bigint) FROM PUBLIC;
