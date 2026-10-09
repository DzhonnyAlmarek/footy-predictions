#!/usr/bin/env python3
"""Compare production Supabase public vs isolated Neon migration_source; READ ONLY.

Requires psql, SUPABASE_READONLY_URL and NEON_URL in environment.
Never prints credentials, usernames, prediction contents, or connection URLs.
No writes are issued on either database.
"""
import os
import subprocess
import sys
from collections import Counter
from urllib.parse import urlsplit

TARGET_HOSTS = {
    "ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech",
    "ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech",
}
SUPABASE_DIRECT_HOST = "db.dfcfixmvplkhkaayfbbd.supabase.co"
SUPABASE_POOL_HOST_SUFFIX = ".pooler.supabase.com"
SOURCE_ROLE = "footy_migration_reader"
COLUMNS = {
    "matches": [
        "id", "tournament_id", "home_team_id", "away_team_id",
        "kickoff_at", "deadline_at", "status", "home_score", "away_score",
        "created_at", "stage_id", "tour_id", "stage_match_no",
        "home_penalty_goals", "away_penalty_goals",
    ],
    "predictions": ["id", "match_id", "user_id", "home_pred", "away_pred", "created_at", "updated_at"],
    "points_ledger": [
        "id", "user_id", "match_id", "points", "reason", "created_at",
        "points_outcome", "points_diff", "points_h1", "points_h2", "points_bonus",
        "points_outcome_base", "points_outcome_bonus", "points_diff_base", "points_diff_bonus",
    ],
}


def stop(message):
    sys.exit("STOP: " + message)


def parse_host(key):
    try:
        value = os.environ[key]
        parsed = urlsplit(value)
        if parsed.scheme not in ("postgresql", "postgres") or not parsed.hostname:
            raise ValueError()
        return parsed.hostname
    except (KeyError, ValueError):
        stop(key + " is missing or invalid. Do NOT paste credentials into chat.")


def run_psql(url, query):
    env = dict(os.environ)
    env["PGOPTIONS"] = "-c default_transaction_read_only=on -c statement_timeout=30000"
    env["PGCONNECT_TIMEOUT"] = "10"
    # Keep the URL in environment only, not command-line arguments.
    env["PGCONNECT_URL_PRIVATE"] = url
    try:
        result = subprocess.run(
            ["psql", "--no-psqlrc", "-X", "-q", "-A", "-t", "-F", "|",
             "-v", "ON_ERROR_STOP=1", "-c", query],
            env={**env, "PGDATABASE": url},
            text=True, capture_output=True, timeout=45,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        stop("psql unavailable or query timed out")
    if result.returncode != 0:
        # Never show stderr (it may contain connection details).
        stop("database query failed; verify credentials and permissions")
    return [line for line in result.stdout.splitlines() if line]


def fingerprint_query(schema, table, columns):
    # jsonb_build_array preserves values and NULLs. MD5 is for change detection,
    # not authentication; comparisons report only ID and changed/unchanged.
    values = ",".join(columns)
    return (
        "SELECT id::text,md5(jsonb_build_array(" + values + ")::text) "
        "FROM " + schema + "." + table + " ORDER BY id"
    )


def load_records(url, schema, table, columns):
    rows = run_psql(url, fingerprint_query(schema, table, columns))
    result = {}
    duplicates = 0
    for row in rows:
        parts = row.split("|", 1)
        if len(parts) != 2 or len(parts[1]) != 32:
            stop("unexpected comparison output for " + table)
        key, fingerprint = parts
        if key in result:
            duplicates += 1
        result[key] = fingerprint
    if duplicates:
        stop(f"{schema}.{table} contains {duplicates} duplicate IDs")
    return result


def main():
    source_host = parse_host("SUPABASE_READONLY_URL")
    target_host = parse_host("NEON_URL")
    if target_host not in TARGET_HOSTS:
        stop("Neon connection is not the isolated migration-work branch")
    if source_host != SUPABASE_DIRECT_HOST and not source_host.endswith(SUPABASE_POOL_HOST_SUFFIX):
        stop("Supabase URL host is not the expected Supabase project/pooler")
    source = os.environ["SUPABASE_READONLY_URL"]
    target = os.environ["NEON_URL"]
    source_user = run_psql(source, "SELECT current_user")
    if source_user != [SOURCE_ROLE]:
        stop("source user must be the dedicated read-only migration role")
    target_schema = run_psql(target, "SELECT to_regnamespace('migration_source') IS NOT NULL")
    if target_schema != ["t"]:
        stop("migration_source schema unavailable in target")
    print("SOURCE: production Supabase (dedicated read-only role)")
    print("TARGET: isolated Neon migration-work branch")
    print("MODE: READ-ONLY comparison; no changes applied")
    differences = 0
    for table, columns in COLUMNS.items():
        left = load_records(source, "public", table, columns)
        right = load_records(target, "migration_source", table, columns)
        newer = sorted(left.keys() - right.keys(), key=lambda x: int(x))
        changed = sorted((k for k in left.keys() & right.keys() if left[k] != right[k]),
                         key=lambda x: int(x))
        source_missing = sorted(right.keys() - left.keys(), key=lambda x: int(x))
        differences += len(newer) + len(changed) + len(source_missing)
        print(f"\n{table}: Supabase={len(left)}, Neon={len(right)}")
        print(f"  New in Supabase: {len(newer)} | changed: {len(changed)} | only in Neon: {len(source_missing)}")
        if newer: print("  New IDs (first 30):", ", ".join(newer[:30]))
        if changed: print("  Changed IDs (first 30):", ", ".join(changed[:30]))
        if source_missing: print("  Only in Neon IDs (first 30):", ", ".join(source_missing[:30]))
    print(f"\nTOTAL differing record IDs: {differences}")
    print("No changes were made.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
