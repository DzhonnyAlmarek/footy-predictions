#!/usr/bin/env python3
"""Read-only retention report for encrypted Neon backups. Never deletes objects."""
import datetime as dt
import json
import os
import re
import subprocess
from collections import defaultdict

bucket = os.environ["FOOTY_BACKUP_S3_BUCKET"]
now = dt.datetime.now(dt.timezone.utc)
prefix = "footy-neon/"
objects = []
token = None
while True:
    cmd = ["aws", "--endpoint-url", "https://storage.yandexcloud.net", "s3api",
           "list-objects-v2", "--bucket", bucket, "--prefix", prefix, "--output", "json"]
    if token:
        cmd += ["--continuation-token", token]
    page = json.loads(subprocess.check_output(cmd, text=True))
    objects += page.get("Contents", [])
    if not page.get("IsTruncated"):
        break
    token = page["NextContinuationToken"]

pattern = re.compile(r"^footy-neon/(\d{4})/(\d{2})/(\d{2})/(\d{8}T\d{6}Z)-([0-9]+)\.dump\.age$")
backups = []
for obj in objects:
    match = pattern.fullmatch(obj["Key"])
    if not match:
        continue
    year, month, day, timestamp, run_id = match.groups()
    try:
        stamp = dt.datetime.strptime(timestamp, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        continue
    if stamp.strftime("%Y/%m/%d") != f"{year}/{month}/{day}":
        continue
    backups.append((stamp, obj["Key"], obj["Size"], run_id))

backups.sort(reverse=True)
recent_cutoff = now - dt.timedelta(days=30)
week_cutoff = now - dt.timedelta(weeks=12)
weekly = {}
for stamp, key, _, _ in backups:
    if week_cutoff <= stamp < recent_cutoff:
        weekly.setdefault(stamp.isocalendar()[:2], key)

print(f"Bucket: {bucket}; encrypted archives: {len(backups)}")
print("Policy preview: keep all backups younger than 30 days; keep newest per ISO week for the preceding 12-week window.")
print("No deletion or lifecycle changes are performed.")
summary = defaultdict(int)
for stamp, key, size, _ in backups:
    if stamp > now:
        reason = "KEEP_FUTURE_TIMESTAMP_REVIEW"
    elif stamp >= recent_cutoff:
        reason = "KEEP_DAILY_WINDOW"
    elif key in weekly.values():
        reason = "KEEP_WEEKLY"
    else:
        reason = "CANDIDATE_REVIEW_ONLY"
    summary[reason] += 1
    print(f"{reason}\t{stamp.isoformat()}\t{size}\t{key}")
print("Summary:", json.dumps(summary, sort_keys=True))
print("Excluded from any deletion: plaintext .dump, checksum files, unrecognized keys, and objects outside the encrypted naming convention.")
