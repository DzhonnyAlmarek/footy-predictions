# Footy: isolated participant authorization (work in progress)

Scope: GitHub `feature/neon-participant-auth` and Neon `supabase-full-migration-work-2026-10-09` only.
Do not edit Supabase production, Vercel, GitHub main or the running Yandex test deployment.

## Starting point
- 7 historical profiles, 1472 predictions, and 1438 point ledger rows have been imported into `migration_source`.
- Historic UUIDs must remain unchanged.
- Supabase Auth, login_accounts.temp_password, and secret/session data are not migrated.
- Running Yandex test login uses a synthetic user and is intentionally left unchanged.

## Stage 1
- `neon-participant-auth.sql` creates a restricted, isolated `test_auth.participant_credentials` table.
- Seven credentials are provisioned **disabled**, with no password, so there is no accidental access.
- Password storage utilities use random salts and scrypt; do not put passwords or hashes in Git.
- This SQL file is **not executed automatically** and must be applied only after verifying the Neon branch.

## Next steps before allowing participant logins
1. Design an administrator-controlled, one-time password enrollment flow with expiring, single-use tokens stored as hashes, without emailing or logging raw tokens.
2. Add database-backed login with rate limiting, generic errors and session revocation.
3. Implement per-request session lookup in Neon (not just HMAC validity).
4. Use a separate test hostname/environment before exposing real user data; protect public routes with middleware.
5. Review authorization by user UUID, logging, logout, CSRF and account recovery; test all seven records.
6. Keep rollout feature-disabled until authorized after end-to-end tests.

Never connect the current public Yandex container to migration data until the authorization boundary is fully tested.
