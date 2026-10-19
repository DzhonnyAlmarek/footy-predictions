# Candidate-only smoke test configuration (NOT a production deployment)

Image build: Dockerfile.cutover-production-candidate
Git branch: feature/yandex-neon-production-prep-20261019
Neon branch: br-solitary-unit-b17pkf8k
Expected Neon host: ep-divine-rain-b1d1r892.c-5.eu-central-1.aws.neon.tech

Required runtime settings for an **isolated**, access-controlled candidate:
- DEPLOY_TARGET=yandex-neon-production-candidate
- ENABLE_CUTOVER_PRODUCTION_CANDIDATE=true
- ENABLE_CUTOVER_PREVIEW=true
- ENABLE_CUTOVER_AUTH=true
- ENABLE_CUTOVER_LOGIN=true
- CUTOVER_AUTH_ALLOWED_HOST=ep-divine-rain-b1d1r892.c-5.eu-central-1.aws.neon.tech
- CUTOVER_AUTH_DATABASE_URL=<candidate-only secret, sslmode=require>
- CUTOVER_AUTH_ORIGIN=<exact HTTPS origin of the isolated candidate>
- CUTOVER_RATE_PEPPER=<unique candidate-only secret of at least 32 chars>
- CUTOVER_SHOW_TEST_MATCHES=false
- ENABLE_CUTOVER_RESULT_WRITES=false
- ENABLE_CUTOVER_ADMIN_WRITES=false
- ENABLE_CUTOVER_PREDICTION_WRITES=false

Never copy preview credentials or origin. The candidate must NOT use live DNS.
The candidate's / route is still disabled by middleware; initial UI is /cutover-participant.
This is not production ready: routing, isolation, data refresh, and rollback remain blockers.

Smoke tests after an isolated image build/deployment (not performed yet):
1. GET / returns disabled response (expected).
2. GET /api/cutover/session without cookie returns 401.
3. GET /api/cutover/participants lists enabled users.
4. Login with candidate-only credentials, inspect session and logout.
5. Check schedule=461 matches; historical ledger=1513 rows, total=3030.75 points.
6. Confirm all write endpoints remain disabled.
7. Confirm no test matches 562-565 and no live domain changes.
