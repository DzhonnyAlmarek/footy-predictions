-- Read-only checks against a prepared footy_cutover snapshot on a validation branch.
WITH checks AS (
SELECT 'predictions_missing_match' AS check_name,count(*) AS violations FROM footy_cutover.predictions p LEFT JOIN footy_cutover.matches m ON m.id=p.match_id WHERE m.id IS NULL
UNION ALL SELECT 'predictions_missing_user',count(*) FROM footy_cutover.predictions p LEFT JOIN footy_cutover.profiles u ON u.id=p.user_id WHERE u.id IS NULL
UNION ALL SELECT 'ledger_missing_match',count(*) FROM footy_cutover.points_ledger l LEFT JOIN footy_cutover.matches m ON m.id=l.match_id WHERE l.match_id IS NOT NULL AND m.id IS NULL
UNION ALL SELECT 'ledger_missing_user',count(*) FROM footy_cutover.points_ledger l LEFT JOIN footy_cutover.profiles u ON u.id=l.user_id WHERE u.id IS NULL
UNION ALL SELECT 'matches_missing_home_team',count(*) FROM footy_cutover.matches m LEFT JOIN footy_cutover.teams t ON t.id=m.home_team_id WHERE m.home_team_id IS NOT NULL AND t.id IS NULL
UNION ALL SELECT 'matches_missing_away_team',count(*) FROM footy_cutover.matches m LEFT JOIN footy_cutover.teams t ON t.id=m.away_team_id WHERE m.away_team_id IS NOT NULL AND t.id IS NULL
UNION ALL SELECT 'matches_missing_stage',count(*) FROM footy_cutover.matches m LEFT JOIN footy_cutover.stages s ON s.id=m.stage_id WHERE m.stage_id IS NOT NULL AND s.id IS NULL
UNION ALL SELECT 'matches_missing_tour',count(*) FROM footy_cutover.matches m LEFT JOIN footy_cutover.tours t ON t.id=m.tour_id WHERE m.tour_id IS NOT NULL AND t.id IS NULL
UNION ALL SELECT 'tours_missing_stage',count(*) FROM footy_cutover.tours t LEFT JOIN footy_cutover.stages s ON s.id=t.stage_id WHERE s.id IS NULL
) SELECT * FROM checks ORDER BY check_name;
