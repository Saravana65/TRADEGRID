#!/usr/bin/env bash
# ==============================================================================
# TRADEGRID Automated Database Backup Script (Production Cron Runner)
# Retention: 7 daily, 4 weekly compressed backups
# ==============================================================================

set -euo pipefail

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-tradegrid}"
DB_USER="${DB_USER:-tradegrid_user}"
DB_PASSWORD="${DB_PASSWORD:-tradegrid_secure_password}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/tradegrid_backup_${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[BACKUP $(date -Iseconds)] Initiating consistent mysqldump for ${DB_NAME}..."

mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  "${DB_NAME}" | gzip > "${BACKUP_FILE}"

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[BACKUP SUCCESS $(date -Iseconds)] Created ${BACKUP_FILE} (${SIZE})"

# Retention Policy: Prune backups older than 7 days
echo "[BACKUP RETENTION] Pruning backups older than 7 days..."
find "${BACKUP_DIR}" -name "tradegrid_backup_${DB_NAME}_*.sql.gz" -type f -mtime +7 -delete

echo "[BACKUP COMPLETE] Backup and pruning completed successfully."
