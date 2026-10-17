# Cutover preview: isolated browser test

Do not change `main`, Vercel, production Supabase, DNS, or the primary Neon branch.

## Preconditions

- Deploy the isolated `feature/yandex-neon-cutover-prep` build to a separate Yandex Serverless Container revision or separate test container; never overwrite a live revision.
- `DEPLOY_TARGET=yandex-neon-cutover-preview`
- `ENABLE_CUTOVER_AUTH=true`, `ENABLE_CUTOVER_LOGIN=true`
- `CUTOVER_AUTH_DATABASE_URL` must point to the **disposable** Neon branch `br-late-grass-b14rxtc7` and contain `sslmode=require`.
- `CUTOVER_AUTH_ALLOWED_HOST` must equal the exact hostname in that URL.
- `CUTOVER_AUTH_ORIGIN` must equal the HTTPS browser origin (no trailing slash).
- `CUTOVER_RATE_PEPPER` must be a unique random secret at least 32 characters long, stored in Yandex secrets, not Git.
- Do not reuse working participant passwords or copy test sessions.
- A trusted operator must enroll temporary credentials for two test participants into `cutover_auth.participant_credentials` on the disposable branch. Do not write raw passwords into Git, logs or screenshots.

## Read-only smoke test

Run from Windows PowerShell after deployment:

```powershell
$env:CUTOVER_BASE_URL = "https://YOUR-ISOLATED-PREVIEW.containers.yandexcloud.net"
node scripts/check-cutover-preview.mjs
```

Expected: page and participant list return 200; unauthenticated session and predictions return 401. All API responses must disable caching.

## Manual scenarios

1. Verify that ADMIN and the five named participants appear, but the unnamed admin profile does not.
2. Sign in as КЕН and verify only КЕН's historical predictions are visible.
3. Sign out; verify that the same browser cannot access the predictions.
4. Sign in as СВС and verify that the set of predictions differs and belongs to СВС.
5. Submit an incorrect password repeatedly; verify throttling after five attempts per 15 minutes.
6. Verify that no UI can submit new predictions, edit scores, or modify the original Supabase site.

If any check fails, keep the original Footy active and do not switch DNS.
