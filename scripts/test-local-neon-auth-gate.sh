#!/usr/bin/env bash
set -euo pipefail
# No database connection or credentials; only localhost. Never publish port 3100.
cd "$(dirname "$0")/.."
PORT=3100
if ss -ltn "( sport = :$PORT )" | grep -q 'LISTEN'; then
  echo "FAIL: port $PORT already occupied; do not terminate unknown processes" >&2
  exit 2
fi
export LOCAL_NEON_AUTH_E2E=true
unset ENABLE_NEON_PARTICIPANT_AUTH ENABLE_NEON_PARTICIPANT_ENROLLMENT
LOG="$(mktemp /tmp/footy-auth-gate-XXXXXX.log)"
# Run the Next binary directly so the captured PID is the actual server.
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port "$PORT" > "$LOG" 2>&1 &
PID=$!
cleanup() {
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  rm -f "$LOG"
}
trap cleanup EXIT

ready=false
for i in $(seq 1 30); do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "FAIL: Next.js server exited early" >&2
    tail -30 "$LOG"
    exit 1
  fi
  # The sandbox health handler may legitimately return 404 without DEPLOY_TARGET.
  code="$(curl --connect-timeout 1 --max-time 2 -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
  if [[ "$code" != "000" ]]; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "FAIL: local Next.js did not become ready" >&2
  tail -30 "$LOG"
  exit 1
fi
for route in enroll participant-login participant-session participant-logout; do
  method=POST
  [[ "$route" == participant-session ]] && method=GET
  code="$(curl --connect-timeout 2 --max-time 15 --silent --output /dev/null --write-out '%{http_code}' \
    -X "$method" -H 'Origin: http://127.0.0.1:3100' \
    -H 'Content-Type: application/json' \
    -d '{}' \
    "http://127.0.0.1:3100/api/test/$route")"
  if [[ "$code" != "404" ]]; then
    echo "FAIL: $route ($method): HTTP $code (expected fail-closed HTTP 404)"
    tail -30 "$LOG"
    exit 1
  fi
  echo "PASS: $route ($method) feature disabled (HTTP 404)"
done
echo 'PASS: loopback-only middleware gate verified; database untouched.'
