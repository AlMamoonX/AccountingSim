#!/bin/sh
# Runs inside the "backup" container: one compressed database dump per day, kept for 14 days.
while true; do
  pg_dump -h db -U accsim accsim | gzip > "/backups/accsim-$(date +%F).sql.gz"
  find /backups -name 'accsim-*.sql.gz' -mtime +14 -exec rm -f {} \;
  sleep 86400
done
