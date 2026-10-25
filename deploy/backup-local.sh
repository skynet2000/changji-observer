#!/bin/bash
# 首尔单机部署的每日备份；文件仅在服务器内保存，不能代替异地备份。
set -euo pipefail
umask 077
cd /home/ubuntu/changji-observer/current
root=/home/ubuntu/changji-observer/backups/automatic
mkdir -p "$root"
exec 9>"$root/.lock"
flock -n 9 || exit 0
backup="$root/daily-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$backup"
complete=false
trap 'if [[ "$complete" != true ]]; then rm -rf -- "$backup"; fi' EXIT
sudo docker compose exec -T db pg_dump -U aihot -d aihot --format=custom --no-owner --no-acl > "$backup/database.dump"
sudo docker compose exec -T db pg_restore --list < "$backup/database.dump" > /dev/null
sudo docker compose exec -T api sh -c 'cd /data; for d in uploads feedback-screenshots; do if [ -d "$d" ]; then printf "%s\n" "$d"; fi; done | tar -czf - -T -' > "$backup/files.tar.gz"
tar -tzf "$backup/files.tar.gz" > /dev/null
sudo docker compose exec -T web sh -c 'if [ -d /traffic ]; then cd /traffic; find . -maxdepth 1 -type f -name "*.json" | tar -czf - -T -; else tar -czf - --files-from /dev/null; fi' > "$backup/traffic.tar.gz"
tar -tzf "$backup/traffic.tar.gz" > /dev/null
sudo docker compose exec -T api printenv AIHOT_RELEASE > "$backup/release.txt"
(cd "$backup" && sha256sum database.dump files.tar.gz traffic.tar.gz release.txt > SHA256SUMS)
complete=true
# 只清理这个脚本创建且校验完成的目录，最近七天的成功备份保留。
find "$root" -mindepth 1 -maxdepth 1 -type d -name 'daily-*' -mmin +10080 -exec test -f '{}/SHA256SUMS' \; -exec rm -rf -- '{}' \;
echo "Backup verified: $backup"
