-- Additive 5-argument overload. Existing 3-argument scorer remains untouched.
-- Run on isolated branch first. Rollback: DROP FUNCTION footy_cutover.finish_new_match(bigint,integer,integer,integer,integer);
CREATE OR REPLACE FUNCTION footy_cutover.finish_new_match(p_match_id bigint, p_home integer, p_away integer, p_home_penalty integer, p_away_penalty integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_match footy_cutover.matches%ROWTYPE;
  v_outcome_count integer;
  v_diff_count integer;
  v_outcome_mult numeric;
  v_diff_mult numeric;
BEGIN
  IF p_home IS NULL OR p_away IS NULL OR p_home NOT BETWEEN 0 AND 99 OR p_away NOT BETWEEN 0 AND 99 THEN
    RAISE EXCEPTION 'invalid score';
  END IF;
  IF p_home_penalty IS NULL OR p_away_penalty IS NULL OR p_home_penalty < 0 OR p_away_penalty < 0 OR p_home_penalty > p_home OR p_away_penalty > p_away THEN
    RAISE EXCEPTION 'invalid penalty goals';
  END IF;
  -- Defense in depth: only admin-created or individually approved imported matches.\n  -- Finished matches and pre-existing ledger entries remain immutable.
  IF NOT (
    EXISTS (SELECT 1 FROM cutover_auth.created_matches WHERE match_id = p_match_id)
    OR EXISTS (SELECT 1 FROM cutover_auth.result_write_allowlist WHERE match_id = p_match_id)
  ) THEN
    RETURN false;
  END IF;
  SELECT * INTO v_match FROM footy_cutover.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR v_match.status <> 'scheduled'
     OR v_match.kickoff_at > now()
     OR COALESCE(v_match.deadline_at, v_match.kickoff_at) > now()
     OR EXISTS (SELECT 1 FROM footy_cutover.points_ledger WHERE match_id = p_match_id) THEN
    RETURN false;
  END IF;
  SELECT
    COUNT(*) FILTER (WHERE sign(home_pred-away_pred) = sign(p_home-p_away)),
    COUNT(*) FILTER (WHERE home_pred-away_pred = p_home-p_away)
  INTO v_outcome_count, v_diff_count
  FROM footy_cutover.predictions WHERE match_id = p_match_id;
  v_outcome_mult := CASE v_outcome_count WHEN 1 THEN 1.75 WHEN 2 THEN 1.50 WHEN 3 THEN 1.25 ELSE 1.00 END;
  v_diff_mult := CASE v_diff_count WHEN 1 THEN 1.75 WHEN 2 THEN 1.50 WHEN 3 THEN 1.25 ELSE 1.00 END;
  INSERT INTO footy_cutover.points_ledger
    (user_id, match_id, points, points_outcome, points_diff,
     points_h1, points_h2, points_bonus,
     points_outcome_base, points_outcome_bonus, points_diff_base, points_diff_bonus)
  SELECT user_id, p_match_id, po+pd+ph1+ph2+pb, po, pd, ph1, ph2, pb,
         po_base, po-po_base, pd_base, pd-pd_base
  FROM (
    SELECT user_id,
      (CASE WHEN sign(home_pred-away_pred)=sign(p_home-p_away) THEN 2 ELSE 0 END)::numeric AS po_base,
      (CASE WHEN sign(home_pred-away_pred)=sign(p_home-p_away) THEN 2*v_outcome_mult ELSE 0 END)::numeric AS po,
      (CASE WHEN home_pred-away_pred=p_home-p_away THEN 1 ELSE 0 END)::numeric AS pd_base,
      (CASE WHEN home_pred-away_pred=p_home-p_away THEN v_diff_mult ELSE 0 END)::numeric AS pd,
      (CASE WHEN home_pred=p_home THEN 0.5 ELSE 0 END)::numeric AS ph1,
      (CASE WHEN away_pred=p_away THEN 0.5 ELSE 0 END)::numeric AS ph2,
      (CASE WHEN abs(home_pred-p_home)+abs(away_pred-p_away)=1 THEN 0.5 ELSE 0 END)::numeric AS pb
    FROM footy_cutover.predictions WHERE match_id=p_match_id
  ) scored;
  UPDATE footy_cutover.matches
  SET home_score=p_home, away_score=p_away, home_penalty_goals=p_home_penalty, away_penalty_goals=p_away_penalty, status='finished'
  WHERE id=p_match_id;
  RETURN true;
END;
$function$
;
