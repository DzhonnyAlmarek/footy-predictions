# Footy: continuous source-of-truth and final cutover plan

Status: migration work plan; no production changes authorized here.

## Non-negotiable boundaries

- Production Vercel / Supabase remain fully operational and source of truth until cutover.
- This document does not authorize writes to Supabase, GitHub main, deployed Yandex Cloud test container, or the Neon branch connected to that container.
- All rehearsal writes, if separately approved, target only isolated Neon branch `br-snowy-dream-b1z9gj1l`, schema `migration_source`.
- Never enable public access to private Codespaces tunnel for migration.
- Credentials/auth secrets and excluded sensitive tables must not be replicated.
- Preserve participant UUIDs and match IDs. Never use synthetic participants to populate production-facing tables.
- Never overwrite Neon test-only public schema, `test_auth`, or intentionally isolated local data.

## Two-step synchronization

**Step A — dry-run (read-only)**

1. Record source observation time and source row counts for every synchronized table.
2. Read source and target by stable primary key. Fingerprint *all approved copied columns* using canonical representations.
3. Report inserted, changed, absent-in-source, and unchanged counts by table, plus expected before/after counts.
4. Distinguish true deletes from missing records due to partial visibility/RLS or replication lag. No automated deletion.
5. Log only primary keys and summarized differences; never print passwords, invite hashes, or private forecasts.
6. Confirm source query used read-only role and target connection is pinned to migration-work Neon endpoint.

**Step B — apply (explicit separate approval)**

1. Revalidate source snapshot and all preconditions to prevent stale apply; abort if any expected fingerprints have changed.
2. Write to a transaction on the isolated Neon branch only. Insert/update in dependency order; use primary-key-keyed upsert and avoid destructive table truncations.
3. Handle deletions via manual investigation and explicit approval, not automatic propagation.
4. Check row counts, foreign keys, uniqueness, ledger component arithmetic, prediction/ledger mappings and per-stage standings.
5. Re-run the read-only comparison. If new production writes occurred during execution, report newly observed drift rather than considering it a failure of migration.
6. Keep a high-water mark/checkpoint from the fully verified run only; support re-running from zero/checkpoints without duplicates.

## Consistency under ongoing production writes

- A live Supabase read is not a permanent snapshot. Every compare report must include the *time it observed* each database, and ideally read all source tables within a single repeatable-read snapshot if the connector supports it.
- Comparing separate snapshots may show temporary differences due solely to concurrent production writes. Re-check discrepancies before changing destination.
- `created_at` alone is insufficient for incremental updates, especially results and ledger adjustments. Use `updated_at` where trustworthy and/or compare full-row fingerprints by primary key.
- Reference tables (stages, tours, teams, tournaments) must be included before promoting the destination to production.
- Auth migration is a separate procedure: participants must enroll and set credentials through the new isolated auth flow; do not copy original credentials.

## Final cutover gate

1. New site feature parity, scoring regression, permissions, security, and end-to-end tests passed.
2. Test migration/catch-up repeatedly while live site continues normal writes.
3. Announce a brief maintenance window: disable **new competition writes in the old site** at the cutover point (not necessarily reading); verify no in-flight writes remain.
4. Perform last complete source-vs-target reconciliation and apply/verify remaining deltas.
5. Record row counts and checksums per table, and confirm same per-stage standings and participant history.
6. Switch traffic only after verification; keep Supabase read-only and available for rollback during initial observation.
7. If rollback is necessary **after new-site writes have started**, reconcile those new writes back into Supabase before reopening it to competition writes. Never roll back traffic blindly.
8. Retire temporary source read-only role/RLS SELECT policies and migration secrets after successful stabilization and explicit approval.

## Current snapshot discrepancy observed on 2026-10-09

- `matches`: 461 source and target, match ID 395 differs (finished 1:0 vs scheduled no score).
- `predictions`: 1472 source and target, 0 differing rows at comparison time.
- `points_ledger`: 1443 in source vs 1438 target; five new IDs 1549–1553, tied to match 395.
- These are observations from a point in time, not immutable synchronization instructions; re-check immediately before any write.

## Migration readiness

The existing file `scripts/compare-supabase-neon-readonly.py` is an **experimental** comparison helper, not an approved sync engine. It must be reviewed for connection handling, fingerprint normalization, consistency window, and permissions before use. It is not safe to use it as an apply script.
