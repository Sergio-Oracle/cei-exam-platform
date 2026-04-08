#!/usr/bin/env bash
# ============================================================
# CEI — Script de sauvegarde automatique
# Usage : bash scripts/backup.sh
# Cron  : 0 2 * * * /root/exam-grading-system_online/scripts/backup.sh
# ============================================================

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cei}"
DATE=$(date +%Y%m%d_%H%M%S)

GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${GREEN}[✔]${NC} $1"; }

mkdir -p "$BACKUP_DIR"

# Lire DATABASE_URL
DB_URL=$(grep ^DATABASE_URL "$ENV_FILE" | cut -d= -f2-)
DB_USER=$(echo "$DB_URL" | sed 's/.*:\/\/\([^:]*\):.*/\1/')
DB_PASS=$(echo "$DB_URL" | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
DB_NAME=$(echo "$DB_URL" | sed 's/.*\/\([^?]*\).*/\1/')

# Sauvegarde PostgreSQL
echo "Sauvegarde de la base de données..."
PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" "$DB_NAME" \
    | gzip > "$BACKUP_DIR/db_${DB_NAME}_${DATE}.sql.gz"
log "DB → $BACKUP_DIR/db_${DB_NAME}_${DATE}.sql.gz"

# Sauvegarde des fichiers uploadés
echo "Sauvegarde des fichiers uploadés..."
tar -czf "$BACKUP_DIR/uploads_${DATE}.tar.gz" \
    -C "$APP_DIR" static/uploads/ exports/ exams/ 2>/dev/null || true
log "Fichiers → $BACKUP_DIR/uploads_${DATE}.tar.gz"

# Rotation : garder les 7 dernières sauvegardes
echo "Nettoyage des anciennes sauvegardes..."
find "$BACKUP_DIR" -name "db_*.sql.gz"     -mtime +7 -delete
find "$BACKUP_DIR" -name "uploads_*.tar.gz" -mtime +7 -delete
log "Anciennes sauvegardes supprimées (>7 jours)"

echo ""
echo "Sauvegarde terminée : $BACKUP_DIR"
ls -lh "$BACKUP_DIR" | tail -5
