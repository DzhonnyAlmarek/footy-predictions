-- Read-only production cutover audit. Run against the intended candidate DB.
-- IMPORTANT: a zero count of test matches is necessary, not sufficient for go-live.
-- All statements are SELECT only; never run this against a different branch by accident.

SELECT 'historical_matches' AS metric, count(*)::bigint AS value
FROM footy_cutover.matches m
WHERE NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches t WHERE t.match_id=m.id)
UNION ALL
SELECT 'historical_predictions', count(*)::bigint
FROM footy_cutover.predictions p
WHERE NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches t WHERE t.match_id=p.match_id)
UNION ALL
SELECT 'historical_ledger', count(*)::bigint
FROM footy_cutover.points_ledger l
WHERE NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches t WHERE t.match_id=l.match_id)
UNION ALL
SELECT 'test_matches_present', count(*)::bigint FROM cutover_auth.test_matches
UNION ALL
SELECT 'preview_created_matches_present', count(*)::bigint FROM cutover_auth.created_matches;

-- Expected historical baseline from verified cutover:
-- historical_matches=461; historical_predictions=1519; historical_ledger=1513.
-- Production candidate must have test_matches_present=0 and
-- preview_created_matches_present=0 after a controlled clean migration.
-- Also verify scores, user totals, hashes and new activity since baseline.
