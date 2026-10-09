#!/usr/bin/env bash
set -euo pipefail
# Use an existing NEON_URL environment variable; never print or store it.
: "${NEON_URL:?NEON_URL missing; enter it privately in Codespaces}"
EXPECTED_POOLER='ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech'
EXPECTED_DIRECT='ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech'
ACTUAL_HOST="$(python3 - <<'PY'
from urllib.parse import urlsplit
import os
print(urlsplit(os.environ['NEON_URL']).hostname or '')
PY
)"
if [[ "$ACTUAL_HOST" != "$EXPECTED_POOLER" && "$ACTUAL_HOST" != "$EXPECTED_DIRECT" ]]; then
  echo "STOP: wrong Neon branch endpoint" >&2
  exit 2
fi
echo "Verified isolated Neon migration branch endpoint."
psql "$NEON_URL" -X -v ON_ERROR_STOP=1 -f "$(dirname "$0")/neon-auth-integration.sql"
