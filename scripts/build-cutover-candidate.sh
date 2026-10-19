#!/usr/bin/env bash
# Build-only helper for an isolated Yandex Cloud production candidate.
# No deploy, DNS, Neon writes or registry push is performed.
set -euo pipefail

if [[ ! -f Dockerfile.cutover-production-candidate || ! -f package-lock.json ]]; then
  echo "Run from the footy-predictions repository root." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the image build." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is unavailable." >&2
  exit 1
fi
if [[ -n "${CUTOVER_AUTH_DATABASE_URL:-}" || -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Unset runtime database/service secrets before running this build-only script." >&2
  exit 1
fi

commit="$(git rev-parse --short=12 HEAD)"
branch="$(git branch --show-current)"
if [[ "$branch" != "feature/yandex-neon-production-prep-20261019" ]]; then
  echo "Refusing to build from unexpected branch: $branch" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean; commit or discard changes before building." >&2
  exit 1
fi
image="footy-cutover-candidate:$commit"
echo "Building $image from $branch"
docker build --pull -f Dockerfile.cutover-production-candidate -t "$image" .
echo "Built $image. No image was pushed or deployed."
