# Enrollment is not live

- Only on `feature/neon-participant-auth`; main, deploy/yandex-cloud, Vercel and Yandex are unchanged.
- `docs/neon-enrollment-schema.sql` is a migration to run only on the **work Neon branch**.
- Store only SHA-256 of 32-byte random invitation tokens in the DB. Raw invitation tokens must be delivered through a secure out-of-band channel and never logged or checked into Git.
- The API is blocked by the existing middleware, `ENABLE_NEON_PARTICIPANT_ENROLLMENT`, and `ENROLLMENT_RATE_LIMIT_READY` until shared database-backed rate limiting, CSRF/host policy, user identification and staging tests are complete.
- The redemption function uses a database row lock to ensure single redemption and never resets a previously activated user.
- Still required: privileged invite issuer procedure, atomic global/IP rate limits, separate session-version/revocation table, integration tests, auth middleware route whitelist after review.
- Do not give participants access to this migration sandbox yet.
