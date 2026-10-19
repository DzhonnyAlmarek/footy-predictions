# Yandex Cloud isolated candidate — operator handoff

This is a **manual, non-production** runbook. Do not change the live domain, main branch, Supabase, Neon default branch or existing running container. The commands below build only; deploying requires a separate reviewed container ID, image registry, IAM role and candidate-specific secrets.

## 1. Build from a clean feature branch (WSL Ubuntu / Cloud Shell with Docker)

```bash
git fetch origin feature/yandex-neon-production-prep-20261019
git switch feature/yandex-neon-production-prep-20261019
git pull --ff-only origin feature/yandex-neon-production-prep-20261019
bash scripts/build-cutover-candidate.sh
```

The build helper validates branch, clean working tree and Docker availability. It does not upload or deploy anything. Do not inject runtime database credentials at build time. The Dockerfile uses dummy Supabase build placeholders and targets `yandex-neon-production-candidate`.

## 2. Provision a NEW isolated candidate

Create a separate Serverless Container and a separate public HTTPS hostname in Yandex Cloud. Never reuse the existing live container or its domain. Limit access to testers (prefer authenticated access). Supply only candidate-scoped Lockbox secrets via runtime secret bindings. Do not print, commit, paste or export their values into shell history.

Candidate database: Neon branch `br-solitary-unit-b17pkf8k`, hostname `ep-divine-rain-b1d1r892.c-5.eu-central-1.aws.neon.tech`. Do not use the Neon default branch. The candidate branch is read-only for this handoff: do not run migrations or seed commands.

Set runtime variables:
```text
DEPLOY_TARGET=yandex-neon-production-candidate
ENABLE_CUTOVER_PRODUCTION_CANDIDATE=true
ENABLE_CUTOVER_PREVIEW=true
ENABLE_CUTOVER_AUTH=true
ENABLE_CUTOVER_LOGIN=true
CUTOVER_AUTH_ALLOWED_HOST=ep-divine-rain-b1d1r892.c-5.eu-central-1.aws.neon.tech
CUTOVER_AUTH_ORIGIN=https://<candidate-only-hostname>
CUTOVER_SHOW_TEST_MATCHES=false
ENABLE_CUTOVER_ADMIN_WRITES=false
ENABLE_CUTOVER_RESULT_WRITES=false
ENABLE_CUTOVER_PREDICTION_WRITES=false
```
Bind `CUTOVER_AUTH_DATABASE_URL` and `CUTOVER_RATE_PEPPER` as candidate-only runtime secrets, never build args. Confirm whether login rate-limit/session writes are permitted in the candidate before enabling login: even with all feature write flags off, login creates sessions and updates rate limits in `cutover_auth`.

## 3. Minimum acceptance

- `/` redirects to `/cutover-participant` only when candidate flags are enabled.
- Login, session and logout work with a candidate-only credential; historical and Grand Prix pages render.
- Verify schedule, leaderboard and Grand Prix totals against a fresh source snapshot; do not assume stale historical counts are current.
- API writes for predictions, match creation and results remain disabled.
- Verify that candidate secrets, domain, and container are isolated from the existing site.

## 4. Release decision

This runbook does NOT authorize deployment, production writes, DNS changes or retiring the current site. Before any real cutover: agree on final data sync, backup/rollback, production hostname, and obtain explicit authorization.
