# Participant authentication cutover contract

The historical `footy_cutover` schema contains participant profiles and predictions, but it does **not** constitute an authenticated participant application.

## Preconditions before enabling login

1. Provision a dedicated authentication store on a separate nonproduction validation database. Never use the existing `test_auth` credentials or sessions as production credentials.
2. Preserve profile UUIDs when importing participants. Map each login to exactly one profile UUID; do not accept a profile UUID supplied by a browser as proof of identity.
3. Provision credentials through a separate verified enrollment or password-reset process. Password hashes and session-token hashes only; no plaintext passwords in GitHub or logs.
4. Issue random session tokens using secure, HTTP-only, SameSite cookies with an expiry and server-side revocation. Rotate the cookie name from the existing test cookie.
5. Authenticate every participant endpoint on the server and scope all prediction queries by the verified session UUID. Use the same rule for score and history endpoints.
6. Enforce rate limits on login and enrollment, verify request origin for writes, and block all write endpoints during parallel historical preview.
7. Use a database account with SELECT-only grants for the preview, not the schema owner.
8. Run end-to-end tests with two distinct accounts proving one cannot see the other's predictions, plus expired-session and unauthenticated checks.
9. Keep the existing site as the sole writer until a final sync, explicit approval and controlled switchover. Never run two independent writable sites.

Current status: migration snapshot and aggregate APIs exist. Login and authenticated predictions API are **not implemented**. Do not advertise this branch as ready for user testing.
