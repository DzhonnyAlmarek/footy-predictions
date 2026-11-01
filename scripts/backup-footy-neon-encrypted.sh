#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${FOOTY_BACKUP_NEON_DATABASE_URL:?Missing Neon connection secret}"
: "${FOOTY_BACKUP_S3_BUCKET:?Missing backup bucket}"
: "${AWS_ACCESS_KEY_ID:?Missing storage key}"
: "${AWS_SECRET_ACCESS_KEY:?Missing storage secret}"
: "${FOOTY_BACKUP_AGE_RECIPIENT:?Missing public age recipient}"
[[ "$FOOTY_BACKUP_AGE_RECIPIENT" =~ ^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$ ]] || { echo "Invalid age recipient"; exit 1; }
command -v age >/dev/null || { echo "age CLI unavailable"; exit 1; }
export PGCONNECT_TIMEOUT=15
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# Fail closed if the configured connection does not contain the intended site schema.
check_sql="SELECT CASE WHEN to_regclass('footy_cutover.predictions') IS NOT NULL AND to_regclass('footy_cutover.points_ledger') IS NOT NULL AND to_regclass('footy_cutover.matches') IS NOT NULL THEN 'yes' ELSE 'no' END"
exists="$(docker run --rm -e PGURL="$FOOTY_BACKUP_NEON_DATABASE_URL" -e PG_CHECK_SQL="$check_sql" postgres:18-alpine sh -c 'psql "$PGURL" -AtX -v ON_ERROR_STOP=1 -c "$PG_CHECK_SQL"')"
test "$exists" = yes || { echo "Wrong database or missing critical tables"; exit 1; }
# Include all schemas, definitions, data, sequences, and privileges.
docker run --rm -e PGURL="$FOOTY_BACKUP_NEON_DATABASE_URL" -v "$tmp:/backup" postgres:18-alpine sh -c 'pg_dump --dbname="$PGURL" --format=custom --no-password --file=/backup/backup.dump'
docker run --rm -v "$tmp:/backup" postgres:18-alpine pg_restore --list /backup/backup.dump > "$tmp/manifest.txt"
grep -q 'TABLE DATA footy_cutover predictions' "$tmp/manifest.txt"
grep -q 'TABLE DATA footy_cutover points_ledger' "$tmp/manifest.txt"
grep -q 'TABLE DATA footy_cutover matches' "$tmp/manifest.txt"
age --encrypt --recipient "$FOOTY_BACKUP_AGE_RECIPIENT" --output "$tmp/backup.dump.age" "$tmp/backup.dump"
rm -f "$tmp/backup.dump"
sha256sum "$tmp/backup.dump.age" > "$tmp/SHA256SUMS.txt"
key="footy-neon/$(date -u +%Y/%m/%d)/$(date -u +%Y%m%dT%H%M%SZ)-${GITHUB_RUN_ID:-manual}"
# Yandex Object Storage S3 API. Bucket versioning/retention should be configured separately.
aws --endpoint-url https://storage.yandexcloud.net s3api put-object --bucket "$FOOTY_BACKUP_S3_BUCKET" --key "$key.dump.age" --body "$tmp/backup.dump.age" >/dev/null
aws --endpoint-url https://storage.yandexcloud.net s3api put-object --bucket "$FOOTY_BACKUP_S3_BUCKET" --key "$key.SHA256SUMS.txt" --body "$tmp/SHA256SUMS.txt" >/dev/null
aws --endpoint-url https://storage.yandexcloud.net s3api head-object --bucket "$FOOTY_BACKUP_S3_BUCKET" --key "$key.dump.age" >/dev/null
# Independently read back the uploaded object and verify exact bytes, not just existence.
aws --endpoint-url https://storage.yandexcloud.net s3api get-object --bucket "$FOOTY_BACKUP_S3_BUCKET" --key "$key.dump.age" "$tmp/readback.dump" >/dev/null
cmp "$tmp/backup.dump.age" "$tmp/readback.dump" || { echo "Uploaded backup differs from local dump"; exit 1; }
echo "Backup uploaded and verified by full read-back comparison; key: $key"
echo "Encrypted archive verified byte-for-byte; run isolated decrypt-and-restore drill before replacing scheduled backup."
