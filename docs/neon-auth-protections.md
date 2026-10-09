# Rate limiting and revocable sessions (disabled sandbox foundation)

Branch: `feature/neon-participant-auth`; Neon branch: `supabase-full-migration-work-2026-10-09`.

The DDL provides:
- Database-atomic fixed-window counters per HMAC-hashed IP and username/token; use both scopes on **every attempt**, with conservative defaults such as 5 per 15 minutes, and fail closed on database errors.
- Opaque, random session tokens stored as SHA-256 hashes only.
- Session database checks that require an enabled account and non-expired, non-revoked session.
- No active invitations, sessions, passwords or enrollment currently exist.

**Not yet ready for external traffic:**
- Rate limit by client identity at a trusted reverse proxy; do not trust arbitrary forwarded-for headers.
- Add audited secret handling, safe invite issuance and delivery, abuse/DoS caps, session creation and logout handlers.
- Integrate session checks with middleware and every sensitive API, enforce CSRF and origin policy.
- Add database-backed integration tests including concurrency, rate limits, token replay, reset and revocation.
- Ensure future roles have least privileges (current Neon owner is privileged).
- Do not set `ENABLE_NEON_PARTICIPANT_ENROLLMENT` or `ENROLLMENT_RATE_LIMIT_READY`. Existing middleware denies the endpoint.
- Do not deploy this branch or change production or the public test Yandex container until reviewed.
