#!/usr/bin/env python3
"""Read-only cutover comparison: production Supabase vs isolated Neon footy_cutover.

Uses dedicated read-only Supabase credentials. No SQL writes.
Prints counts and per-record hash mismatch counts, never participant data.
"""
import os
import sys
from urllib.parse import urlsplit

try:
    import psycopg
except ImportError:
    sys.exit("Install psycopg[binary] before running.")

COLUMNS = {
    "matches": ("id", "tournament_id", "stage_id", "tour_id", "home_team_id",
                "away_team_id", "kickoff_at", "deadline_at", "status", "home_score", "away_score"),
    "predictions": ("id", "match_id", "user_id", "home_pred", "away_pred", "created_at", "updated_at"),
    "points_ledger": ("id", "user_id", "match_id", "points", "points_outcome",
                      "points_diff", "points_h1", "points_h2", "points_bonus"),
}
TABLES = tuple(COLUMNS)
EXPECTED_SOURCE = "dfcfixmvplkhkaayfbbd"
EXPECTED_NEON_HOST = "ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech"

def fail(reason):
    raise SystemExit("STOP: " + reason)

def validate(key, source=False):
    url = os.getenv(key)
    if not url:
        fail(key + " missing")
    p = urlsplit(url)
    if p.scheme not in ("postgres", "postgresql"):
        fail("invalid scheme")
    if source:
        direct = p.hostname == "db." + EXPECTED_SOURCE + ".supabase.co" and p.username == "footy_migration_reader"
        pool = p.hostname is not None and p.hostname.endswith(".pooler.supabase.com") and p.username == "footy_migration_reader." + EXPECTED_SOURCE
        if not (direct or pool):
            fail("source must be dedicated Supabase read-only account")
    elif p.hostname not in (EXPECTED_NEON_HOST, EXPECTED_NEON_HOST.replace(".c-5.", "-pooler.c-5.")):
        fail("unexpected Neon host")
    return url

def snapshot(url, schema, table):
    # One transaction, read only, stable snapshot for all three tables.
    with psycopg.connect(url, connect_timeout=12, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            cur.execute("SET LOCAL statement_timeout='30000ms'")
            result = {}
            for name in TABLES:
                cols = ", ".join("t." + col for col in COLUMNS[name])
                cur.execute(
                    "SELECT id::text, md5(jsonb_build_array(" + cols +
                    ")::text) FROM " + schema + "." + name + " t ORDER BY id"
                )
                result[name] = dict(cur.fetchall())
            conn.rollback()
            return result

def main():
    source = validate("SUPABASE_READONLY_URL", source=True)
    target = validate("NEON_URL")
    src = snapshot(source, "public", TABLES)
    dst = snapshot(target, "footy_cutover", TABLES)
    different = False
    for name in TABLES:
        a, b = src[name], dst[name]
        new = a.keys() - b.keys()
        changed = {k for k in a.keys() & b.keys() if a[k] != b[k]}
        extra = b.keys() - a.keys()
        print(f"{name}: source={len(a)} neon={len(b)} missing={len(new)} changed={len(changed)} neon_only={len(extra)}")
        different |= bool(new or changed or extra)
    print("READ_ONLY=true; DIFFERENCES_FOUND=" + str(different).lower())
    if different:
        print("Note: Neon-only test matches are expected. Review source changes separately.")

if __name__ == "__main__":
    main()
