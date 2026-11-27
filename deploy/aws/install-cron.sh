#!/usr/bin/env bash
# Installs the app's scheduled jobs on the server (the server clock is UTC; times below are IST).
# Run once after the app is up:  ./deploy/aws/install-cron.sh
set -euo pipefail
dir="$(cd "$(dirname "$0")/../.." && pwd)"
set -a
. "$dir/.env"
set +a
: "${DOMAIN:?Set DOMAIN in .env}" "${CRON_SECRET:?Set CRON_SECRET in .env}"
call="curl -fsS -m 120 -H 'Authorization: Bearer $CRON_SECRET' https://$DOMAIN/api/cron"
tmp=$(mktemp)
# Keep any other cron lines, replace ours.
crontab -l 2>/dev/null | grep -v '# attendance' > "$tmp" || true
cat >> "$tmp" <<EOF
30 3 * * *  $call/celebrations    >/dev/null  # attendance: birthdays, 9:00 AM IST
0 21 * * *  $call/backup          >/dev/null  # attendance: in-app backup (Settings > Backup), 2:30 AM IST
0 5 * * *   $call/daily-summary   >/dev/null  # attendance: not punched in, 10:30 AM IST
0 13 * * *  $call/report-reminder >/dev/null  # attendance: report reminder, 6:30 PM IST
29 18 * * * $call/close-day       >/dev/null  # attendance: close the day, 11:59 PM IST
30 21 * * * $dir/deploy/aws/backup.sh >> $dir/backups/backup.log 2>&1  # attendance: backup, 3:00 AM IST
EOF
mkdir -p "$dir/backups"
crontab "$tmp"
rm -f "$tmp"
echo "Scheduled jobs installed:"
crontab -l | grep '# attendance' | sed 's/Bearer [^ ]*/Bearer ***/'
