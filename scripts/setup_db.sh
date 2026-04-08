#!/usr/bin/env bash
# ============================================================
# CEI — Configuration de la base de données PostgreSQL
# Usage : bash scripts/setup_db.sh
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
err()  { echo -e "${RED}[✘]${NC} $1"; exit 1; }

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

[[ ! -f "$ENV_FILE" ]] && err ".env introuvable — copier .env.example en .env"

# Lire les variables du .env
DB_URL=$(grep ^DATABASE_URL "$ENV_FILE" | cut -d= -f2-)
DB_USER=$(echo "$DB_URL" | sed 's/.*:\/\/\([^:]*\):.*/\1/')
DB_PASS=$(echo "$DB_URL" | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
DB_HOST=$(echo "$DB_URL" | sed 's/.*@\([^:\/]*\).*/\1/')
DB_PORT=$(echo "$DB_URL" | sed 's/.*:\([0-9]*\)\/.*/\1/')
DB_NAME=$(echo "$DB_URL" | sed 's/.*\/\([^?]*\).*/\1/')

echo "Configuration de la base de données :"
echo "  Hôte     : $DB_HOST:$DB_PORT"
echo "  Base     : $DB_NAME"
echo "  Utilisateur : $DB_USER"
echo ""

# Créer l'utilisateur
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
    && warn "Utilisateur $DB_USER existe déjà" \
    || (sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" && log "Utilisateur créé")

# Créer la base de données
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
    && warn "Base de données $DB_NAME existe déjà" \
    || (sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" && log "Base créée")

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
log "Droits accordés"

# Créer les tables via SQLAlchemy
cd "$APP_DIR"
source .venv/bin/activate
python3 - <<'PYEOF'
import sys
sys.path.insert(0, '.')
from app import app, db
with app.app_context():
    db.create_all()
    print("Tables créées avec succès")
PYEOF
log "Tables initialisées"

echo ""
echo "Base de données prête. Créer un admin avec :"
echo "  source .venv/bin/activate && python create_admin.py"
