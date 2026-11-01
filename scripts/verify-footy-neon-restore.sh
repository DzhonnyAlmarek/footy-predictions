#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${FOOTY_RESTORE_TEST_DATABASE_URL:?Missing isolated restore database secret}"
: "${FOOTY_BACKUP_S3_BUCKET:?Missing bucket}"
: "${FOOTY_RESTORE_OBJECT_KEY:?Missing object key}"
: "${AWS_ACCESS_KEY_ID:?Missing S3 key}"
: "${AWS_SECRET_ACCESS_KEY:?Missing S3 secret}"
[[ "$FOOTY_RESTORE_OBJECT_KEY" =~ ^footy-neon/[0-9]{4}/[0-9]{2}/[0-9]{2}/[0-9TZ-]+\\.dump$ ]] || { echo "Invalid dump object key"; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
aws --endpoint-url https://storage.yandexcloud.net s3api get-object --bucket "$FOOTY_BACKUP_S3_BUCKET" --key "$FOOTY_RESTORE_OBJECT_KEY" "$tmp/source.dump" >/dev/null
checksum_key="${FOOTY_RESTORE_OBJECT_KEY%.dump}.SHA256SUMS.txt"
aws --endpoint-url https://storage.yandexcloud.net s3api get-object --bucket "$FOOTY_BACKUP_S3_BUCKET" --key "$checksum_key" "$tmp/SHA256SUMS.txt" >/dev/null
expected="$(awk 'NR==1 {print $1}' "$tmp/SHA256SUMS.txt")"
actual="$(sha256sum "$tmp/source.dump" | awk '{print $1}')"
test "$expected" = "$actual" || { echo "Backup digest mismatch"; exit 1; }
docker run --rm -v "$tmp:/backup:ro" postgres:18-alpine pg_restore --list /backup/source.dump > "$tmp/manifest.txt"
for table in predictions matches points_ledger profiles grand_prix_manual_scores; do
  grep -q "TABLE DATA footy_cutover $table" "$tmp/manifest.txt" || { echo "Missing $table"; exit 1; }
done
# An explicit empty, isolated target is mandatory. Never restore over existing schemas.
check="SELECT CASE WHEN to_regclass('footy_cutover.predictions') IS NULL AND to_regclass('public.predictions') IS NULL THEN 'empty' ELSE 'occupied' END"
state="$(docker run --rm -e PGURL="$FOOTY_RESTORE_TEST_DATABASE_URL" -e CHECK_SQL="$check" postgres:18-alpine sh -c 'psql "$PGURL" -AtX -v ON_ERROR_STOP=1 -c "$CHECK_SQL"')"
test "$state" = empty || { echo "Restore target not empty; refusing"; exit 1; }
if [[ "${FOOTY_RESTORE_APPLY:-false}" != true ]]; then
  echo "Validation passed: checksum, inventory, empty target. Dry run only."
  exit 0
fi
docker run --rm -e PGURL="$FOOTY_RESTORE_TEST_DATABASE_URL" -v "$tmp:/backup:ro" postgres:18-alpine sh -c 'pg_restore --dbname="$PGURL" --no-owner --no-privileges --exit-on-error --single-transaction /backup/source.dump'
docker run --rm -e PGURL="$FOOTY_RESTORE_TEST_DATABASE_URL" postgres:18-alpine sh -c 'psql "$PGURL" -XAt -v ON_ERROR_STOP=1 -c "SELECT (SELECT count(*) FROM footy_cutover.predictions), (SELECT count(*) FROM footy_cutover.matches), (SELECT count(*) FROM footy_cutover.points_ledger)"'
echo "Isolated restore completed; compare counts against source snapshot before acceptance."
