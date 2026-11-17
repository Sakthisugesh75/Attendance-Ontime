#!/usr/bin/env bash
# Nightly backup on the server: the database and the uploads folder, kept for 30 days in ./backups.
# Run by cron (see install-cron.sh); run it by hand any time:  ./deploy/aws/backup.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env
set +a
mkdir -p backups
stamp=$(date -u +%Y%m%d-%H%M)
docker compose -f docker-compose.aws.yml exec -T db \
  sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines attendance_next' \
  | gzip > "backups/db-$stamp.sql.gz"
tar -czf "backups/storage-$stamp.tgz" storage
find backups -type f -mtime +30 -delete
echo "Backup done: backups/db-$stamp.sql.gz, backups/storage-$stamp.tgz"
