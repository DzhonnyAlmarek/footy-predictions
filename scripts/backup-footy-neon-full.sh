#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${FOOTY_BACKUP_NEON_DATABASE_URL:?Missing Neon connection secret}"
: "${FOOTY_BACKUP_S3_BUCKET:?Missing backup bucket}"
: "${AWS_ACCESS_KEY_ID:?Missing storage key}"
: "${AWS_SECRET_ACCESS_KEY:?Missing storage secret}"
export PGCONNECT_TIMEOUT=15
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# Fail closed if the configured connection does not contain the intended site schema.
exists="$(psql "$FOOTY_BACKUP_NEON_DATABASE_URL" -AtX -v ON_ERROR_STOP=1 -c "SELECT CASE WHEN to_regclass('footy_cutover.predictions') IS NOT NULL AND to_regclass('footy_cutover.points_ledger') IS NOT NULL AND to_regclass('footy_cutover.matches') IS NOT NULL THEN 'yes' ELSE 'no' END")"
test "$exists" = yes || { echo "Wrong database or missing critical tables"; exit 1; }
# Include all schemas, definitions, data, sequences, and privileges.
pg_dump --dbname="$FOOTY_BACKUP_NEON_DATABASE_URL" --format=custom --no-password --file="$tmp/backup.dump"
pg_restore --list "$tmp/backup.dump" > "$tmp/manifest.txt"
grep -q 'TABLE DATA footy_cutover predictions' "$tmp/manifest.txt"
grep -q 'TABLE DATA footy_cutover points_ledger' "$tmp/manifest.txt"
grep -q 'TABLE DATA footy_cutover matches' "$tmp/manifest.txt"
sha256sum "$tmp/backup.dump" > "$tmp/SHA256SUMS.txt"
key="footy-neon/$(date -u +%Y/%m/%d)/$(date -u +%Y%m%dT%H%M%SZ)-${GITHUB_RUN_ID:-manual}"
# Yandex Object Storage S3 API. Bucket versioning/retention should be configured separately.
aws --endpoint-url https://storage.yandexcloud.net s3api put-object --bucket "$FOOTY_BACKUP_S3_BUCKET" --key "$key.dump" --body "$tmp/backup.dump" --server-side-encryption AES256 >/dev/null
aws --endpoint-url https://storage.yandexcloud.net s3api put-object --bucket "$FOOTY_BACKUP_S3_BUCKET" --key "$key.SHA256SUMS.txt" --body "$tmp/SHA256SUMS.txt" --server-side-encryption AES256 >/dev/null
aws --endpoint-url https://storage.yandexcloud.net s3api head-object --bucket "$FOOTY_BACKUP_S3_BUCKET" --key "$key.dump" >/dev/null
echo "Backup uploaded and verified (object existence); key: $key"
echo "Note: a restoration drill in isolated database is still required."
