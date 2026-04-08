# 🚀 Guide de Déploiement - Système de Notation Avancé

## Prérequis

- Python 3.10+
- PostgreSQL 13+
- 2GB RAM minimum
- 10GB espace disque

## Installation Complète

### 1. Préparer le Système
```bash
# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Installer PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Installer Python et pip
sudo apt install python3.10 python3.10-venv python3-pip -y

# Installer uv (optionnel mais recommandé)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Configurer PostgreSQL
```bash
# Se connecter à PostgreSQL
sudo -u postgres psql

# Dans psql, exécuter:
CREATE DATABASE exam_grader_db;
CREATE USER exam_user WITH PASSWORD 'VotreMotDePasseSecurise123!';
GRANT ALL PRIVILEGES ON DATABASE exam_grader_db TO exam_user;
\q
```

### 3. Cloner et Configurer le Projet
```bash
# Créer le répertoire
mkdir -p /opt/exam_grader
cd /opt/exam_grader

# Créer l'environnement virtuel
python3 -m venv .venv
source .venv/bin/activate

# Installer les dépendances
pip install flask flask-cors flask-jwt-extended flask-bcrypt anthropic \
    python-dotenv PyPDF2 python-docx werkzeug psycopg2-binary \
    sqlalchemy reportlab matplotlib pillow

# Ou avec uv (plus rapide)
uv pip install flask flask-cors flask-jwt-extended flask-bcrypt anthropic \
    python-dotenv PyPDF2 python-docx werkzeug psycopg2-binary \
    sqlalchemy reportlab matplotlib pillow
```

### 4. Configuration .env
```bash
cat > .env << 'ENVEOF'
# API Keys
ANTHROPIC_API_KEY=votre_cle_api_anthropic_ici

# Flask Configuration
FLASK_ENV=production
FLASK_DEBUG=False
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
JWT_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')

# PostgreSQL Configuration
DATABASE_URL=postgresql://exam_user:VotreMotDePasseSecurise123!@localhost:5432/exam_grader_db

# Upload Configuration
MAX_FILE_SIZE=16777216
ALLOWED_EXTENSIONS=pdf,docx,doc,txt
UPLOAD_FOLDER=static/uploads

# Application Settings
ITEMS_PER_PAGE=10
ENVEOF
```

### 5. Initialiser la Base de Données
```bash
# Créer les tables
python models.py

# Créer le compte administrateur
python create_admin.py
```

### 6. Créer les Dossiers Nécessaires
```bash
mkdir -p static/{css,js,uploads}
mkdir -p templates
mkdir -p exports
mkdir -p test_files/{sujets,copies}

# Permissions
chmod 755 static/uploads
chmod 755 exports
```

### 7. Tester l'Application
```bash
# Activer l'environnement
source .venv/bin/activate

# Lancer l'application
python app.py
```

Accéder à: http://localhost:5000

## Déploiement en Production avec Gunicorn

### 1. Installer Gunicorn
```bash
pip install gunicorn
```

### 2. Créer le fichier de configuration Gunicorn
```bash
cat > gunicorn_config.py << 'GUNICORN'
bind = "0.0.0.0:5000"
workers = 4
worker_class = "sync"
worker_connections = 1000
timeout = 120
keepalive = 5
max_requests = 1000
max_requests_jitter = 50
accesslog = "logs/access.log"
errorlog = "logs/error.log"
loglevel = "info"
GUNICORN

mkdir -p logs
```

### 3. Créer un Service Systemd
```bash
sudo cat > /etc/systemd/system/exam-grader.service << 'SERVICE'
[Unit]
Description=Exam Grader System
After=network.target postgresql.service

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/opt/exam_grader
Environment="PATH=/opt/exam_grader/.venv/bin"
ExecStart=/opt/exam_grader/.venv/bin/gunicorn -c gunicorn_config.py app:app
ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
TimeoutStopSec=5
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE

# Ajuster les permissions
sudo chown -R www-data:www-data /opt/exam_grader

# Activer et démarrer le service
sudo systemctl daemon-reload
sudo systemctl enable exam-grader
sudo systemctl start exam-grader
sudo systemctl status exam-grader
```

### 4. Configurer Nginx (Reverse Proxy)
```bash
sudo apt install nginx -y

sudo cat > /etc/nginx/sites-available/exam-grader << 'NGINX'
server {
    listen 80;
    server_name votre-domaine.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /static {
        alias /opt/exam_grader/static;
        expires 30d;
    }
}
NGINX

# Activer le site
sudo ln -s /etc/nginx/sites-available/exam-grader /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. Configurer SSL avec Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d votre-domaine.com
```

## Maintenance

### Sauvegardes PostgreSQL
```bash
# Créer un script de sauvegarde
cat > backup.sh << 'BACKUP'
#!/bin/bash
BACKUP_DIR="/backup/exam_grader"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

pg_dump -U exam_user exam_grader_db | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Garder seulement les 7 dernières sauvegardes
ls -t $BACKUP_DIR/db_*.sql.gz | tail -n +8 | xargs rm -f
BACKUP

chmod +x backup.sh

# Ajouter au crontab (tous les jours à 2h)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/exam_grader/backup.sh") | crontab -
```

### Logs
```bash
# Voir les logs en temps réel
tail -f logs/error.log
tail -f logs/access.log

# Logs systemd
sudo journalctl -u exam-grader -f
```

### Redémarrer l'Application
```bash
sudo systemctl restart exam-grader
```

## Sécurité

1. **Firewall**:
```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

2. **Mettre à jour régulièrement**:
```bash
sudo apt update && sudo apt upgrade -y
```

3. **Surveiller les logs**:
```bash
sudo fail2ban-client status
```

## Troubleshooting

### L'application ne démarre pas
```bash
# Vérifier les logs
sudo journalctl -u exam-grader -n 50

# Vérifier PostgreSQL
sudo systemctl status postgresql

# Tester la connexion à la DB
psql -U exam_user -d exam_grader_db -h localhost
```

### Erreurs de permissions
```bash
sudo chown -R www-data:www-data /opt/exam_grader
sudo chmod -R 755 /opt/exam_grader
```

### Base de données corrompue
```bash
# Restaurer depuis une sauvegarde
gunzip < /backup/exam_grader/db_YYYYMMDD_HHMMSS.sql.gz | psql -U exam_user exam_grader_db
```

## Support

Pour toute question ou problème:
- Vérifier les logs
- Consulter la documentation PostgreSQL
- Vérifier la configuration Nginx/Gunicorn

