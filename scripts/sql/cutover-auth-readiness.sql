-- Read-only readiness checks for the isolated cutover authentication store.
SELECT 'profiles_without_credentials' AS check_name, count(*) AS total
FROM footy_cutover.profiles p
LEFT JOIN cutover_auth.participant_credentials c ON c.user_id=p.id
WHERE c.user_id IS NULL
UNION ALL
SELECT 'enabled_credentials', count(*)
FROM cutover_auth.participant_credentials WHERE enabled
UNION ALL
SELECT 'active_sessions', count(*)
FROM cutover_auth.participant_sessions
WHERE revoked_at IS NULL AND expires_at > now()
UNION ALL
SELECT 'sessions_without_profiles', count(*)
FROM cutover_auth.participant_sessions s
LEFT JOIN footy_cutover.profiles p ON p.id=s.user_id
WHERE p.id IS NULL;
