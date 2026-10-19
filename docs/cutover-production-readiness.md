# Golden Whistle: production cutover readiness (not a deployment approval)

Status: BLOCKED. This branch is preparation-only; do not deploy it or point production DNS at any cutover preview.

## Confirmed
- Isolated preview Dockerfile uses non-routable Supabase build placeholders and DEPLOY_TARGET=yandex-neon-cutover-preview.
- middleware.ts denies normal production pages and APIs; the preview container cannot replace the live site.
- Test matches are tracked in cutover_auth.test_matches and excluded from preview leaderboard.
- Historical data parity was previously checked (461 matches, 1519 predictions, 1513 ledger rows).
- Deadline and result-scoring live tests were explicitly **assumed** passed by the owner; they have not been verified.

## Blocking work before production
1. Design production routes and auth independent of legacy Supabase; audit every user and admin action for Neon-only reads/writes.
2. Define separate production environment target, database role, secrets, cookies, origin checks, and least-privilege permissions. No production credentials in images.
3. Prepare a clean production Neon branch or database without test matches 562–565, their predictions, ledger, and preview-only tours. Do not delete or alter preview data. Verify migration parity and preserve a restore point.
4. Validate scoring transaction, deadline enforcement, and double-submit behavior with an isolated integration test, or document acceptance of the risk.
5. Build and smoke-test a production candidate on a separate non-public deployment, with no production DNS or writes until explicit approval.
6. Create a documented rollback (previous deployment, DNS/traffic reversal, database consistency strategy) and freeze writes during final sync.
7. Obtain explicit go/no-go before changing production traffic or data.

## Strict boundaries
- Never write to legacy production Supabase, Vercel, GitHub main, or live DNS as part of preparation.
- Never deploy this preparation branch as the live site.
- Keep ENABLE_CUTOVER_RESULT_WRITES=false in preview unless a separate controlled test is approved.
