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
