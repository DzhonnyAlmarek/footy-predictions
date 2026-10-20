# Golden Whistle — candidate admin: stage and imported-fixture editing

Status: design only. No database changes, deployments or production approval.

## Verified current state (2026-10-20)
- `/api/cutover/admin` reads `footy_cutover` and exposes `create_tour`, `rename_tour`, `create_match`, `edit_match_teams`, `reschedule_match`, and `result`.
- Editing teams/time requires `cutover_auth.created_matches`; imported fixtures are intentionally protected.
- `result` is restricted to newly created matches, guarded by `ENABLE_CUTOVER_RESULT_WRITES`.
- `create_tour` requires an existing stage. There is no stage creation/edit action in candidate API.
- `/api/cutover/leaderboard` currently aggregates `footy_cutover.points_ledger`; whether bonus points are included needs a separate schema and product-rule audit.

## Required functionality and guardrails
1. Admin can create or rename a **draft** stage, with explicit tournament association and validation. Do not assume the current schema has all needed columns: inspect read-only schema before writing migrations.
2. Admin can edit an imported future fixture's teams/kickoff/deadline **only when scheduled, deadline is in the future, and there are no predictions or ledger rows**. A stricter, non-destructive override layer is preferred to editing imported source rows. Review how `footy_sandbox.calendar_match_edits` implements overlays; do not copy its schema/permissions blindly.
3. No change to finished fixtures, historical scores, existing predictions or ledger. Reject duplicate teams within a tour and invalid deadlines. Audit actor, timestamp, old and new values.
4. New candidate APIs must require admin session, exact Origin, dedicated candidate Neon host, and explicit write flags. Keep default write flags false.
5. Front-end must distinguish imported vs admin-created matches and explain why an edit is unavailable.
6. Cover conflicts, double submit, deadline boundary and failed writes in tests without writing to production or the candidate DB.

## Execution order
- Read-only inspect Neon candidate schema and existing sandbox overlay implementation.
- Implement stage CRUD and imported-fixture overrides in this feature branch only.
- Static checks and isolated automated tests; no deployment.
- Request explicit authorization before any candidate schema migration, database write or enabling write flags.

## Deployment boundary
Never modify GitHub main, the current live site, live DNS, production Supabase, Neon default branch, or the working preview container. Do not assume Serverless Containers is recovered.
