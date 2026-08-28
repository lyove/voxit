#!/usr/bin/env bash
# Voxit 数据库备份脚本
# 用法：
#   ./deploy/backup-db.sh                  # 备份到默认目录
#   DATA_DIR=/var/lib/voxit ./deploy/backup-db.sh   # 指定数据目录
# 配合 crontab 定时备份（每天凌晨 3 点）：
#   0 3 * * * /path/to/voxit/deploy/backup-db.sh >> /var/log/voxit-backup.log 2>&1
set -euo pipefail

# 数据目录（默认与 server 的 DATA_DIR 保持一致；部署时请显式传入）
DATA_DIR="${DATA_DIR:-/var/lib/voxit}"
DB_FILE="${DB_FILE:-$DATA_DIR/voxit.db}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

if [ ! -f "$DB_FILE" ]; then
  echo "[$(date '+%F %T')] 数据库文件不存在：$DB_FILE（忽略）" >&2
  exit 0
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date '+%Y%m%d-%H%M%S')"
BACKUP_FILE="$BACKUP_DIR/voxit-${STAMP}.db"

# 优先用 sqlite3 在线备份（WAL 模式下安全）；没有则用 cp（需要停止写入才可靠）
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
else
  cp "$DB_FILE" "$BACKUP_FILE"
  echo "警告：未安装 sqlite3，使用 cp 备份；若服务正在写入，备份可能不一致。" >&2
fi

# 清理超过 KEEP_DAYS 天的旧备份
find "$BACKUP_DIR" -name 'voxit-*.db' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "[$(date '+%F %T')] 备份完成：$BACKUP_FILE（保留 ${KEEP_DAYS} 天）"
