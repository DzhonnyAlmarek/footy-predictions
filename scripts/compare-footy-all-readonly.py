#!/usr/bin/env python3
"""Read-only, 18-table Footy source-of-truth drift scan. Python stdlib + psql.

The production Supabase endpoint is read with the dedicated read-only user.
Only the isolated Neon MIGRATION branch is accepted as target.
No database writes, no prediction contents, no credentials printed.
This is a *report*, not a sync/apply script.

Run:
  SUPABASE_READONLY_URL=... NEON_URL=... python3 scripts/compare-footy-all-readonly.py
"""
import csv
import io
import os
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import urlsplit

EXPECTED_NEON = {
  "ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech",
  "ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech",
}
SUPABASE_DIRECT = "db.dfcfixmvplkhkaayfbbd.supabase.co"
ROLE = "footy_migration_reader"

# Explicit key definitions — never guess from id; some tables have compound keys.
KEYS = {
  "analytics_stage_baseline": ("stage_id",),
  "analytics_stage_user": ("stage_id", "user_id"),
  "analytics_stage_user_archetype": ("stage_id", "user_id"),
  "analytics_stage_user_momentum": ("stage_id", "user_id"),
  "grand_prix_manual_scores": ("id",),
  "grand_prix_rounds": ("id",),
  "grand_prix_seasons": ("id",),
  "import_rpl_matches": ("competition", "season", "tour", "kickoff_at_utc", "home_team", "away_team"),
  "match_scores": ("match_id", "user_id"),
  "matches": ("id",),
  "points_ledger": ("id",),
  "prediction_scores": ("prediction_id",),
  "predictions": ("id",),
  "profiles": ("id",),
  "stages": ("id",),
  "teams": ("id",),
  "tournaments": ("id",),
  "tours": ("id",),
}


def stop(message):
    raise SystemExit("STOP: " + message)


def parse_url(env_name):
    raw = os.environ.get(env_name)
    if not raw:
        stop(env_name + " is missing. Do not post any URL or password in chat.")
    try:
        url = urlsplit(raw)
        if url.scheme not in ("postgres", "postgresql") or not url.hostname:
            raise ValueError()
    except ValueError:
        stop(env_name + " is not a PostgreSQL URL")
    return raw, url


def permitted_source(url):
    if url.username != ROLE:
        stop("Supabase connection must use dedicated read-only role")
    if url.hostname != SUPABASE_DIRECT:
        # Do not trust arbitrary pooler host with another project; require
        # known project reference as part of pooler role naming if pooling.
        if not (url.hostname.endswith(".pooler.supabase.com") and
                "dfcfixmvplkhkaayfbbd" in (url.username or "")):
            stop("source host not verified; use direct project hostname and read-only role")


def esc_ident(identifier):
    if not identifier.replace("_", "").isalnum():
        stop("invalid identifier")
    return '"' + identifier + '"'


def snapshot_sql(schema):
    parts = []
    for table, key_fields in KEYS.items():
        keys = ", ".join("t." + esc_ident(k) for k in key_fields)
        # jsonb of entire row: matching column names/types get matching fingerprints;
        # fingerprint does not expose raw sensitive values. Key is encoded as JSON.
        parts.append(
            "SELECT '" + table + "' AS table_name, "
            "jsonb_build_array(" + keys + ")::text AS row_key, "
            "md5(to_jsonb(t)::text) AS digest "
            "FROM " + esc_ident(schema) + "." + esc_ident(table) + " AS t"
        )
    return (
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
        "SET LOCAL statement_timeout='45000ms';\n"
        "COPY (" + " UNION ALL ".join(parts) +
        ") TO STDOUT WITH (FORMAT csv);\n"
        "COMMIT;\n"
    )


def run_snapshot(dburl, schema):
    # libpq consumes PGDATABASE as a conninfo URL. URL never appears as an argv
    # argument, in logs, in SQL, or on stdout. stdin is fixed read-only SQL.
    env = dict(os.environ)
    env["PGDATABASE"] = dburl
    env["PGCONNECT_TIMEOUT"] = "12"
    env["PGOPTIONS"] = "-c default_transaction_read_only=on"
    try:
        p = subprocess.run(
            ["psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"],
            input=snapshot_sql(schema), env=env, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=95,
            check=False,
        )
    except FileNotFoundError:
        stop("psql not installed")
    except subprocess.TimeoutExpired:
        stop("snapshot timed out")
    if p.returncode != 0:
        # Never print stderr: it can contain secrets or operational details.
        stop("read-only snapshot failed; check database grants and schema")
    rows = {}
    for table, key, digest in csv.reader(io.StringIO(p.stdout)):
        if table not in KEYS or len(digest) != 32:
            stop("unexpected snapshot output")
        index = (table, key)
        if index in rows:
            stop("duplicate composite key found in " + table)
        rows[index] = digest
    return rows


def main():
    source, source_parts = parse_url("SUPABASE_READONLY_URL")
    target, target_parts = parse_url("NEON_URL")
    permitted_source(source_parts)
    if target_parts.hostname not in EXPECTED_NEON:
        stop("target is not the isolated Neon migration branch")
    print("Footy read-only 18-table drift report")
    print("Supabase=source; isolated Neon=target; no writes permitted")
    print("Source snapshot start (UTC):", datetime.now(timezone.utc).isoformat())
    src = run_snapshot(source, "public")
    print("Target snapshot start (UTC):", datetime.now(timezone.utc).isoformat())
    dst = run_snapshot(target, "migration_source")
    print("Comparison complete (UTC):", datetime.now(timezone.utc).isoformat())
    print("NOTE: databases are sampled sequentially. Concurrent Footy writes")
    print("      may cause temporary drift; re-check before any apply.")
    total = 0
    for table in KEYS:
        a = {key: value for (t, key), value in src.items() if t == table}
        b = {key: value for (t, key), value in dst.items() if t == table}
        added = a.keys() - b.keys()
        extra = b.keys() - a.keys()
        changed = sum(a[key] != b[key] for key in a.keys() & b.keys())
        total += len(added) + len(extra) + changed
        print(f"{table}: source={len(a)} target={len(b)} "
              f"new={len(added)} changed={changed} only_in_target={len(extra)}")
    print("Total differing records:", total)
    print("NO CHANGES APPLIED")
    # A difference is a valid comparison outcome, not a command failure.
    return 0


if __name__ == "__main__":
    sys.exit(main())
