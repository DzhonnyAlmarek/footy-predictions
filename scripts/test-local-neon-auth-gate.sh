#!/usr/bin/env bash
set -euo pipefail
# No Neon connection, production environment variables or credentials required.
# Start Next dev bound only to loopback and verify all auth endpoints fail closed.
cd "$(dirname "$0")/.."
PORT=3100
export PORT
export LOCAL_NEON_AUTH_E2E=true
unset ENABLE_NEON_PARTICIPANT_AUTH ENABLE_NEON_PARTICIPANT_ENROLLMENT
LOG=$(mktemp /tmp/footy-auth-gate-XXXXXX.log)
npm run dev -- --hostname 127.0.0.1 --port "$PORT" > "$LOG" 2>&1 &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; rm -f "$LOG"; }
trap cleanup EXIT
for i in $(seq 1 30); do
  if curl -fsS 'http://127.0.0.1:3100/api/test/health' >/dev/null 2>&1; then break; fi
  sleep 1
done
for route in enroll participant-login participant-session participant-logout; do
  code=$(curl --silent --output /dev/null --write-out '%{http_code}'     -H 'Origin: http://127.0.0.1:3100'     "http://127.0.0.1:3100/api/test/$route")
  if [[ "$code" != "404" ]]; then
    echo "FAIL: $route: HTTP $code (expected 404 when feature disabled)"
    tail -25 "$LOG"
    exit 1
  fi
  echo "PASS: $route feature disabled (HTTP 404)"
done
echo 'PASS: local-only middleware gate; no database involved.'
