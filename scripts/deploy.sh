#!/usr/bin/env bash
# ============================================================
# CEI — Centre d'Examen Intelligent
# Script de déploiement automatisé complet
# Usage : sudo bash scripts/deploy.sh
# ============================================================

set -euo pipefail

# --- Couleurs ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
err()  { echo -e "${RED}[✘]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[→]${NC} $1"; }

# --- Configuration ---
APP_DIR="/root/exam-grading-system_online"
APP_NAME="exam-api-v3"
PYTHON_VERSION="3.10"
DB_NAME="exam_grader_db"
DB_USER="exam_user"
NGINX_CONF="/etc/nginx/sites-available/cei"
DOMAIN="${CEI_DOMAIN:-cei.votre-domaine.com}"
APP_PORT="${APP_PORT:-7000}"

echo ""
echo "============================================================"
echo "   CEI — Centre d'Examen Intelligent | Déploiement"
echo "============================================================"
echo ""

# ---------- 1. Vérifications préalables ----------
info "Vérification des prérequis..."

[[ $EUID -ne 0 ]] && err "Ce script doit être exécuté en tant que root (sudo bash deploy.sh)"
[[ ! -f "$APP_DIR/.env" ]] && err "Fichier .env manquant ! Copier .env.example en .env et remplir les valeurs."
[[ ! -f "$APP_DIR/app.py" ]] && err "Répertoire d'application introuvable : $APP_DIR"

log "Prérequis validés"

# ---------- 2. Mise à jour système ----------
info "Mise à jour des paquets système..."
apt-get update -qq
apt-get install -y -qq \
    python3 python3-pip python3-venv \
    postgresql postgresql-contrib \
    nginx certbot python3-certbot-nginx \
    nodejs npm \
    git curl wget build-essential \
    libpq-dev libssl-dev
log "Paquets installés"

# ---------- 3. PM2 (gestionnaire de processus) ----------
info "Installation/mise à jour de PM2..."
npm install -g pm2 --silent
pm2 startup systemd -u root --hp /root 2>/dev/null || true
log "PM2 configuré"

# ---------- 4. PostgreSQL ----------
info "Configuration de PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

DB_PASSWORD=""
if [[ -f "$APP_DIR/.env" ]]; then
    DB_PASSWORD=$(grep ^DATABASE_URL "$APP_DIR/.env" | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
fi

[[ -z "$DB_PASSWORD" ]] && err "Impossible de lire DATABASE_URL dans .env"

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
log "Base de données PostgreSQL configurée"

# ---------- 5. Environnement Python ----------
info "Configuration de l'environnement Python..."
cd "$APP_DIR"

if [[ ! -d ".venv" ]]; then
    python3 -m venv .venv
    log "Environnement virtuel créé"
fi

source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
log "Dépendances Python installées"

# ---------- 6. Répertoires nécessaires ----------
info "Création des répertoires..."
mkdir -p static/uploads exports exams logs
chmod 755 static/uploads exports exams
log "Répertoires créés"

# ---------- 7. Initialisation de la base de données ----------
info "Initialisation de la base de données..."
python3 - <<'PYEOF'
import sys
sys.path.insert(0, '.')
from app import app, db
with app.app_context():
    db.create_all()
    print("[✔] Tables créées avec succès")
PYEOF

# ---------- 8. Nginx ----------
info "Configuration de Nginx..."
cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    access_log /var/log/nginx/cei_access.log;
    error_log  /var/log/nginx/cei_error.log;

    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 3000s;
        proxy_send_timeout    3000s;
        proxy_read_timeout    3000s;
        proxy_buffering off;
    }

    location /static {
        proxy_pass http://localhost:$APP_PORT/static;
        proxy_cache_valid 200 1d;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/cei 2>/dev/null || true
nginx -t && systemctl reload nginx
log "Nginx configuré"

# ---------- 9. Certificat SSL ----------
if [[ "$DOMAIN" != "cei.votre-domaine.com" ]]; then
    info "Obtention du certificat SSL Let's Encrypt pour $DOMAIN..."
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
        --email "admin@$DOMAIN" --redirect 2>/dev/null && log "SSL configuré" || \
        warn "SSL échoué — vérifier DNS et réessayer : certbot --nginx -d $DOMAIN"
else
    warn "DOMAIN non configuré — SSL ignoré"
fi

# ---------- 10. Démarrage avec PM2 ----------
info "Démarrage de l'application avec PM2..."
cd "$APP_DIR"
pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
log "Application démarrée avec PM2"

# ---------- 11. Résumé ----------
echo ""
echo "============================================================"
echo -e "   ${GREEN}DÉPLOIEMENT TERMINÉ AVEC SUCCÈS${NC}"
echo "============================================================"
echo ""
echo "  Application  : https://$DOMAIN"
echo "  Port local   : http://localhost:$APP_PORT"
echo "  Logs         : pm2 logs $APP_NAME"
echo "  Statut       : pm2 status"
echo "  Redémarrer   : pm2 restart $APP_NAME"
echo ""
echo "  Prochaines étapes :"
echo "  1. Créer un administrateur : source .venv/bin/activate && python create_admin.py"
echo "  2. Importer la maquette    : python populate_maquette.py"
echo ""
