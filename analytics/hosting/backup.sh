#!/usr/bin/env bash
# Daily backup of the analytics database. Installed by setup.sh as /usr/local/bin/tmi-backup
# and run by cron at 02:30 IST. Run it by hand any time: sudo tmi-backup
#
# Uses sqlite3's .backup, which takes a consistent copy WHILE the server is writing (WAL mode) -
# a plain `cp` of a live SQLite file can produce a corrupt copy, so don't do that.
#
# Off-box copy (strongly recommended - a backup on the same disk dies with the disk):
#   set BACKUP_S3_URI in /etc/tmi-analytics.env, e.g.
#     BACKUP_S3_URI=s3://our-bucket/tmi-analytics-backups
#   and give the instance an IAM role (EC2) or `aws configure` an IAM user with PutObject on that
#   prefix only (Lightsail). Without it, backups stay local and you should download one weekly.
set -euo pipefail

ENV_FILE=/etc/tmi-analytics.env
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

DB="${DB_PATH:-/var/lib/tmi/analytics.sqlite}"
OUT="${BACKUP_DIR:-/var/backups/tmi}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d)"
FILE="$OUT/analytics-$STAMP.sqlite"

[ -f "$DB" ] || { echo "$(date -Is) no database at $DB yet - nothing to back up"; exit 0; }
mkdir -p "$OUT"

sqlite3 "$DB" ".backup '$FILE'"
gzip -f "$FILE"
FILE="$FILE.gz"
chmod 600 "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
ROWS="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM events' 2>/dev/null || echo '?')"
STUDENTS="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM students' 2>/dev/null || echo '?')"
echo "$(date -Is) backup $FILE ($SIZE) - $STUDENTS students, $ROWS events"

if [ -n "${BACKUP_S3_URI:-}" ] && command -v aws >/dev/null 2>&1; then
  aws s3 cp "$FILE" "$BACKUP_S3_URI/$(basename "$FILE")" --only-show-errors \
    && echo "$(date -Is) copied to $BACKUP_S3_URI" \
    || echo "$(date -Is) WARNING: off-box copy to S3 failed - the local copy is fine"
fi

# keep the last KEEP_DAYS days
find "$OUT" -name 'analytics-*.sqlite.gz' -mtime "+$KEEP_DAYS" -delete

# To restore: stop the service, gunzip the file over the database, start again.
#   sudo systemctl stop tmi-analytics
#   sudo gunzip -c /var/backups/tmi/analytics-2026-11-20.sqlite.gz > /var/lib/tmi/analytics.sqlite
#   sudo chown tmi:tmi /var/lib/tmi/analytics.sqlite && sudo systemctl start tmi-analytics
