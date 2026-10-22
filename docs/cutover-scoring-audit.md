# Isolated cutover scoring audit

Date: 2026-10-22. Scope: feature branch and isolated Neon candidate only. **Do not modify production or the default Neon branch.**

## Verified
- The cutover leaderboard uses `SUM(points)` as total and `SUM(points_bonus)` as a separate informational column. It does not add bonus twice.
- Read-only candidate query returned 1,513 ledger rows, 1,513 distinct (match_id, user_id) pairs, zero NULL and zero negative `points_bonus` values.
- Candidate admin endpoint permits `finish_new_match` only for isolated admin-created, non-test matches, with result writes separately gated.
- The server's scoring function implementation and arithmetic have **not** been verified. Read-only inspection attempts were blocked by tool safety checks.

## Required before cutover
1. Compare the candidate ledger totals with the source ledger for each user and match; explicitly identify historical corrections.
2. Inspect `footy_cutover.finish_new_match` on the **candidate branch only**, including exact-score, outcome, goal-difference and bonus calculations.
3. Verify that `points` includes `points_bonus` exactly once, and that `points_outcome_bonus` and `points_diff_bonus` have the intended semantics; do not assume these fields are additive.
4. On a disposable test match only, validate exact score, outcome, draw, wrong outcome, penalty rules and repeated completion; check that a second finish does not add ledger rows.
5. Reconcile per-user leaderboard totals and bonus display, excluding test matches, before DNS cutover.
6. Keep `ENABLE_CUTOVER_RESULT_WRITES=false` and `ENABLE_CUTOVER_ADMIN_WRITES=false` until verification and explicit approval.

## Known limitation
The presence of a unique ledger pair and nonnegative bonus does not establish scoring correctness. Do not treat this audit as permission to deploy or switch DNS.

## Candidate reconciliation snapshot (2026-10-22)
- Profiles: **7**; matches: **461**; predictions: **1,519**; points ledger: **1,513**.
- All **6** predictions lacking a ledger row belong to unfinished matches; **0** unscored predictions belong to finished matches.
- Both predictions and points ledger have unique indexes on (match_id, user_id).
- Source Supabase football project is not available among connected Supabase projects (only `club-murashev` and `Emias Docs` were listed). **Source-to-candidate comparison is still pending**; do not mistake internal consistency for source parity.

## Arithmetic validation (read-only candidate Neon)
- Across all **1,513** ledger entries, **0** rows violate `points = points_outcome + points_diff + points_h1 + points_h2 + points_bonus`.
- Across all **1,513** entries, **0** rows violate `points_outcome = points_outcome_base + points_outcome_bonus` or `points_diff = points_diff_base + points_diff_bonus`.
- **810** rows differ if comparing `points_bonus` with `points_outcome_bonus + points_diff_bonus`: these are **distinct components**, not interchangeable bonus fields. The correct expanded total is `points_outcome_base + points_outcome_bonus + points_diff_base + points_diff_bonus + points_h1 + points_h2 + points_bonus` (0 mismatches).
- **474** rows have nonzero `points_bonus`; their total is **237.00**. The database includes **18** matches with nonzero penalty-goal fields. The exact penalty scoring rules and source parity remain unverified.
