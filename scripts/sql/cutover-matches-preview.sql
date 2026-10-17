-- Read-only historical match overview on the disposable validation branch.
SELECT m.id, m.kickoff_at, m.deadline_at, m.status,
       h.name AS home_team, a.name AS away_team,
       m.home_score, m.away_score,
       (SELECT count(*) FROM footy_cutover.predictions p WHERE p.match_id=m.id) AS prediction_count
FROM footy_cutover.matches m
LEFT JOIN footy_cutover.teams h ON h.id = m.home_team_id
LEFT JOIN footy_cutover.teams a ON a.id = m.away_team_id
ORDER BY m.kickoff_at DESC, m.id DESC
LIMIT 20;
