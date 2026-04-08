#!/usr/bin/env bash
# ============================================================
# CEI — Mise à jour de l'application (zero-downtime)
# Usage : bash scripts/update.sh
# ============================================================

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="exam-api-v3"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }

cd "$APP_DIR"

# 1. Sauvegarder avant mise à jour
warn "Sauvegarde préalable..."
bash scripts/backup.sh

# 2. Récupérer les nouvelles sources
log "Récupération des mises à jour Git..."
git pull origin main

# 3. Mettre à jour les dépendances Python
log "Mise à jour des dépendances Python..."
source .venv/bin/activate
pip install --quiet --upgrade -r requirements.txt

# 4. Migrations éventuelles
if ls migrate_*.py 1>/dev/null 2>&1; then
    warn "Scripts de migration détectés — vérifier s'ils doivent être exécutés"
fi

# 5. Redémarrer l'application
log "Redémarrage de l'application..."
pm2 reload "$APP_NAME" --update-env

# 6. Vérifier le statut
sleep 2
pm2 status "$APP_NAME"
log "Mise à jour terminée"
