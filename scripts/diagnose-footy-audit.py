#!/usr/bin/env python3
"""Connection and schema diagnostics; no participant data or secrets printed."""
import os, subprocess, re
from urllib.parse import urlsplit
targets = (("Supabase read-only", "SUPABASE_READONLY_URL", "public"),
           ("Legacy migration Neon", "NEON_URL", "migration_source"))
for label, secret, schema in targets:
    url = os.environ.get(secret, "")
    if not url:
        print(f"{label}: MISSING_SECRET")
        continue
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
            print(f"{label}: BAD_CONNECTION_URL")
            continue
        env = os.environ.copy()
        env.pop("PGOPTIONS", None)
        env["PGCONNECT_TIMEOUT"] = "10"
        sql = ("BEGIN READ ONLY; SELECT EXISTS (SELECT 1 FROM information_schema.tables "
               f"WHERE table_schema='{schema}' AND table_name='predictions') "
               "AND EXISTS (SELECT 1 FROM information_schema.tables "
               f"WHERE table_schema='{schema}' AND table_name='points_ledger'); COMMIT;")
        result = subprocess.run(["psql", "--dbname", url, "-X", "-A", "-t", "-q",
                                 "-v", "ON_ERROR_STOP=1", "-c", sql],
                                capture_output=True, text=True, env=env, timeout=30)
        if result.returncode == 0:
            print(f"{label}: CONNECTED; essential schema present={('t' in result.stdout.split())}")
        else:
            err = result.stderr.lower()
            if "password authentication failed" in err: category = "AUTH_FAILED"
            elif "could not translate host name" in err: category = "DNS_FAILED"
            elif "timeout" in err or "timed out" in err: category = "TIMEOUT"
            elif "no pg_hba.conf entry" in err: category = "ACCESS_REJECTED"
            elif "does not exist" in err: category = "MISSING_DB_OR_ROLE"
            elif "certificate" in err or "ssl" in err: category = "TLS_ERROR"
            elif "permission denied" in err: category = "PERMISSION_DENIED"
            else: category = "DATABASE_ERROR_OTHER"
            print(f"{label}: {category} (details intentionally hidden)")
    except subprocess.TimeoutExpired:
        print(f"{label}: TIMEOUT")
    except Exception:
        print(f"{label}: DIAGNOSTIC_ERROR")
print("Read-only diagnostics complete. No records or connection URLs displayed.")
