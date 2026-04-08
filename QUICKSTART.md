# QUICKSTART — Déploiement CEI en moins de 15 minutes

Ce guide permet à n'importe quel développeur de déployer la plateforme CEI sur un serveur Ubuntu propre.

---

## Sommaire

1. [Prérequis serveur](#1-prérequis-serveur)
2. [Cloner le projet](#2-cloner-le-projet)
3. [Configurer l'environnement](#3-configurer-lenvironnement)
4. [Déploiement automatique (recommandé)](#4-déploiement-automatique-recommandé)
5. [Déploiement manuel (étape par étape)](#5-déploiement-manuel-étape-par-étape)
6. [Configuration Nginx + SSL](#6-configuration-nginx--ssl)
7. [Créer le premier admin](#7-créer-le-premier-admin)
8. [Vérification](#8-vérification)
9. [Opérations courantes](#9-opérations-courantes)
10. [Dépannage](#10-dépannage)

---

## 1. Prérequis serveur

### Matériel recommandé
- VPS avec au moins **2 Go RAM** et **20 Go disque**
- Ubuntu 22.04 LTS ou 24.04 LTS
- Accès root SSH

### Nom de domaine
- Un domaine pointant vers l'IP du serveur (ex: `cei.mondomaine.com`)
- Le DNS doit être propagé avant d'obtenir un certificat SSL

### Services externes à configurer avant de commencer
1. **Clé API Anthropic** — https://console.anthropic.com/ (obligatoire)
2. **Serveur LiveKit** — https://cloud.livekit.io/ (si examens en ligne)
3. **Gmail App Password** — https://myaccount.google.com/apppasswords (pour les emails)
4. **MinIO ou S3** — pour stocker les enregistrements vidéo (si proctoring)

---

## 2. Cloner le projet

```bash
# Se connecter en root
ssh root@IP_DU_SERVEUR

# Cloner le dépôt
git clone https://github.com/Sergio-Oracle/cei-exam-platform.git /root/exam-grading-system_online
cd /root/exam-grading-system_online
```

---

## 3. Configurer l'environnement

```bash
# Copier le template
cp .env.example .env

# Éditer avec vos vraies valeurs
nano .env
```

### Variables obligatoires à remplir

```bash
# 1. Clé Anthropic (https://console.anthropic.com/)
ANTHROPIC_API_KEY=sk-ant-api03-VOTRE_CLE

# 2. Base de données (choisir un mot de passe fort)
DATABASE_URL=postgresql://exam_user:MOT_DE_PASSE_FORT@localhost:5432/exam_grader_db

# 3. Clés secrètes Flask (générer des valeurs aléatoires)
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
JWT_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")

# 4. Email Gmail
SMTP_USERNAME=votre.email@gmail.com
SMTP_PASSWORD=votre_app_password_16_caracteres

# 5. LiveKit (si proctoring)
LIVEKIT_URL=wss://livekit.votre-domaine.com
LIVEKIT_API_KEY=votre_cle
LIVEKIT_API_SECRET=votre_secret
```

> **Astuce :** Pour générer SECRET_KEY et JWT_SECRET_KEY directement dans .env :
> ```bash
> sed -i "s/votre_secret_key_aleatoire_ici/$(python3 -c 'import secrets; print(secrets.token_hex(32))')/" .env
> sed -i "s/votre_jwt_secret_key_aleatoire_ici/$(python3 -c 'import secrets; print(secrets.token_hex(32))')/" .env
> ```

---

## 4. Déploiement automatique (recommandé)

Le script `deploy.sh` fait tout en une seule commande :

```bash
# Rendre le script exécutable
chmod +x scripts/*.sh

# Lancer le déploiement (prend ~5 minutes)
sudo CEI_DOMAIN=cei.votre-domaine.com APP_PORT=7000 bash scripts/deploy.sh
```

Ce script :
- Installe Python, PostgreSQL, Nginx, Node.js, PM2
- Crée la base de données et l'utilisateur PostgreSQL
- Configure l'environnement virtuel Python
- Installe toutes les dépendances
- Initialise les tables de la base de données
- Configure Nginx
- Obtient un certificat SSL Let's Encrypt
- Démarre l'application avec PM2

**Ensuite, créer l'administrateur :**
```bash
source .venv/bin/activate
python create_admin.py
```

---

## 5. Déploiement manuel (étape par étape)

Si vous préférez contrôler chaque étape :

### 5.1 Installer les dépendances système

```bash
apt-get update
apt-get install -y \
    python3 python3-pip python3-venv \
    postgresql postgresql-contrib \
    nginx certbot python3-certbot-nginx \
    nodejs npm \
    git curl build-essential libpq-dev
```

### 5.2 Installer PM2

```bash
npm install -g pm2
pm2 startup systemd -u root --hp /root
```

### 5.3 Configurer PostgreSQL

```bash
# Démarrer PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Créer l'utilisateur et la base de données
# Remplacer MOT_DE_PASSE par le mot de passe du .env
sudo -u postgres psql <<SQL
CREATE USER exam_user WITH PASSWORD 'MOT_DE_PASSE';
CREATE DATABASE exam_grader_db OWNER exam_user;
GRANT ALL PRIVILEGES ON DATABASE exam_grader_db TO exam_user;
SQL
```

### 5.4 Environnement Python

```bash
cd /root/exam-grading-system_online

# Créer et activer l'environnement virtuel
python3 -m venv .venv
source .venv/bin/activate

# Installer les dépendances
pip install --upgrade pip
pip install -r requirements.txt
```

### 5.5 Initialiser la base de données

```bash
# Depuis le répertoire du projet, avec le .venv activé
python3 -c "
from app import app, db
with app.app_context():
    db.create_all()
    print('Tables créées avec succès')
"
```

### 5.6 Créer les répertoires nécessaires

```bash
mkdir -p static/uploads exports exams logs
chmod 755 static/uploads exports exams
```

### 5.7 Démarrer avec PM2

```bash
cd /root/exam-grading-system_online
pm2 start ecosystem.config.js
pm2 save
```

Vérifier que l'application répond :
```bash
curl -s http://localhost:7000/ | head -5
```

---

## 6. Configuration Nginx + SSL

### Créer la configuration Nginx

```bash
cat > /etc/nginx/sites-available/cei <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name cei.votre-domaine.com;

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name cei.votre-domaine.com;

    ssl_certificate /etc/letsencrypt/live/cei.votre-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cei.votre-domaine.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    access_log /var/log/nginx/cei_access.log;
    error_log  /var/log/nginx/cei_error.log;

    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:7000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 3000s;
        proxy_send_timeout    3000s;
        proxy_read_timeout    3000s;
        proxy_buffering off;
    }

    location /static {
        proxy_pass http://localhost:7000/static;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

# Activer le site
ln -sf /etc/nginx/sites-available/cei /etc/nginx/sites-enabled/cei
nginx -t
```

### Obtenir le certificat SSL

```bash
# IMPORTANT : le domaine doit déjà pointer vers ce serveur
certbot --nginx -d cei.votre-domaine.com --email admin@votre-domaine.com --agree-tos --redirect

# Recharger Nginx
systemctl reload nginx
```

---

## 7. Créer le premier admin

```bash
cd /root/exam-grading-system_online
source .venv/bin/activate
python create_admin.py
```

Suivre les instructions (entrer email, nom, mot de passe).

### (Optionnel) Importer une maquette pédagogique de démo

```bash
python populate_maquette.py
```

---

## 8. Vérification

```bash
# Statut PM2
pm2 status

# L'application répond localement
curl -s http://localhost:7000/ | grep -o '<title>[^<]*</title>'

# Logs en temps réel (pas d'erreurs)
pm2 logs exam-api-v3 --lines 20

# Test complet via HTTPS
curl -I https://cei.votre-domaine.com/
# → HTTP/2 200
```

---

## 9. Opérations courantes

### Redémarrer l'application

```bash
pm2 restart exam-api-v3
```

### Voir les logs

```bash
pm2 logs exam-api-v3 --lines 50
# ou
pm2 logs exam-api-v3 -f   # en temps réel
```

### Mettre à jour l'application

```bash
bash scripts/update.sh
```

### Sauvegarder

```bash
bash scripts/backup.sh
```

### Configurer les sauvegardes automatiques

```bash
crontab -e
# Ajouter :
0 2 * * * /root/exam-grading-system_online/scripts/backup.sh >> /var/log/cei_backup.log 2>&1
```

### Renouveler le certificat SSL (automatique via cron, mais vérifier)

```bash
certbot renew --dry-run
```

---

## 10. Dépannage

### L'application ne démarre pas

```bash
# Voir les logs PM2
pm2 logs exam-api-v3 --err --lines 50

# Tester manuellement
cd /root/exam-grading-system_online
source .venv/bin/activate
python app.py
# → L'erreur s'affiche directement
```

### Erreur de connexion PostgreSQL

```bash
# Vérifier que PostgreSQL tourne
systemctl status postgresql

# Tester la connexion
psql "postgresql://exam_user:MOT_DE_PASSE@localhost:5432/exam_grader_db" -c "\dt"
```

### Port 7000 non disponible

```bash
# Vérifier quel processus utilise le port
ss -tlnp | grep 7000
# Ou changer le port dans ecosystem.config.js et .env
```

### Nginx 502 Bad Gateway

```bash
# L'application Flask ne tourne pas
pm2 status
pm2 restart exam-api-v3

# Vérifier que le port correspond
grep proxy_pass /etc/nginx/sites-available/cei
```

### Erreur Anthropic API

```bash
# Vérifier la clé API
grep ANTHROPIC_API_KEY .env
# Tester l'accès internet depuis le serveur
curl -s https://api.anthropic.com/ | head -3
```

### Face.js ne détecte pas les visages

- Vérifier que les modèles sont bien présents dans `static/models/faceapi/`
- Le navigateur doit avoir accès à la caméra (HTTPS obligatoire)
- Vérifier la console navigateur (F12 → Console)

---

## Récapitulatif des ports

| Service | Port | Exposition |
|---------|------|-----------|
| Flask / PM2 | 7000 | Interne uniquement |
| Nginx HTTP | 80 | Public (redirige HTTPS) |
| Nginx HTTPS | 443 | Public |
| PostgreSQL | 5432 | Localhost uniquement |
| LiveKit | 7880 (ws) | Externe via sous-domaine |
| MinIO | 9000 | Externe (configurable) |

---

*Pour toute question, ouvrir une issue sur le dépôt GitHub.*
