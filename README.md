# CEI — Centre d'Examen Intelligent

> Plateforme universitaire d'examens en ligne avec surveillance autonome par IA (agent + indicateurs visuels temps réel), correction automatique multi-domaine et gestion pédagogique complète.  
> Développée pour l'**RTN – Réseaux et Techniques Numériques (EC2LT)**, Sénégal.

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0+-green.svg)](https://flask.palletsprojects.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://postgresql.org)
[![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC-orange.svg)](https://livekit.io)
[![Claude AI](https://img.shields.io/badge/Claude-Sonnet_4-purple.svg)](https://anthropic.com)
[![License](https://img.shields.io/badge/licence-MIT-green.svg)](#licence)

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Fonctionnalités](#2-fonctionnalités)
3. [Architecture](#3-architecture)
4. [Prérequis système](#4-prérequis-système)
5. [Installation complète](#5-installation-complète)
6. [Configuration .env](#6-configuration-env)
7. [Structure du projet](#7-structure-du-projet)
8. [Agent de surveillance autonome](#8-agent-de-surveillance-autonome)
9. [Déploiement production PM2 + Nginx](#9-déploiement-production-pm2--nginx)
10. [Dépendances IA](#10-dépendances-ia)
11. [Documentation API Swagger](#11-documentation-api-swagger)
12. [Dépannage](#12-dépannage)

---

## 1. Vue d'ensemble

CEI est une plateforme web complète pour la gestion et la surveillance des examens académiques. Elle combine :

- **Examens en ligne** avec proctoring vidéo via LiveKit (WebRTC)
- **Surveillance autonome par IA** avec escalade vers les surveillants humains
- **Correction automatique** par IA pour toutes les disciplines (droit, médecine, maths, littérature, etc.)
- **Gestion pédagogique** : formations, UE, EC, maquettes, inscriptions, relevés de notes
- **Réclamations** et relevés automatiques
- **Import CSV** en masse des étudiants et notes

---

## 2. Fonctionnalités

### Examens en ligne
- Création d'examens avec minuterie, accès restreint par code
- Proctoring vidéo temps réel (LiveKit WebRTC)
- Détection de visage côté client (MediaPipe + face-api.js)
- Score de risque automatique (0–100) par étudiant
- Système d'avertissement, d'appel privé et d'exclusion
- Enregistrement des sessions vidéo (MinIO/S3)

### Agent de surveillance autonome
- Service Python indépendant — surveille tous les examens actifs toutes les 30 secondes
- **Attribué automatiquement** à tous les examens actifs, aucune action manuelle requise
- Analyse comportementale par IA (Ollama qwen3.6) pour chaque étudiant suspect
- Emails d'alerte HTML aux surveillants et enseignants (niveaux ALERTE et URGENT)
- **Heartbeat** toutes les 30s — l'API `/api/agent/status` expose l'état en temps réel
- **Indicateurs visuels** dans tous les dashboards :
  - Carte "🤖 Agent IA Autonome" avec dot animé vert/rouge dans le panneau surveillants
  - Bandeau agent dans le modal de gestion des surveillants (statut + stats par examen)
  - Mention discrète dans l'interface étudiant pendant l'examen
- Cloche d'alertes 🔔 dans le dashboard avec badge + notifications navigateur
- Cooldown configurable par étudiant (défaut 10 min) pour éviter le spam
- Rapport récapitulatif toutes les 15 minutes à l'enseignant

### Correction par IA (multi-domaine universel)
- Détection automatique de la discipline depuis le titre et le contenu du sujet
- Adapte le niveau d'expertise : droit, médecine, maths, informatique, littérature, agronomie, et tout autre domaine
- Chaîne de fallback : Anthropic Claude → Google Gemini → DeepSeek → Ollama local
- Feedback détaillé par question avec barème sur 20 points

### Extraction PDF avec OCR intégré
- Extraction via pdfplumber (principal) + PyPDF2 (fallback)
- OCR automatique via Tesseract si le PDF contient des polices CIDFont illisibles
- Supporte le français et l'anglais

### Gestion pédagogique
- Hiérarchie : Formation → Semestres → UE → EC → Sujets
- Maquette pédagogique complète avec coefficients et crédits ECTS
- Inscriptions UE/EC par étudiant
- Relevés de notes automatiques (PDF) avec mention
- Import/export CSV

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Nginx (reverse proxy)                     │
│              https://votre-domaine.sn → :5000               │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│               Flask + Gunicorn (app.py)                     │
│  Routes : auth, admin, prof, étudiant, examens, API agent   │
│  Blueprints : proctoring_routes, csv_import_routes          │
└────┬───────────────────┬──────────────────┬─────────────────┘
     │                   │                  │
┌────▼────┐    ┌─────────▼───────┐  ┌──────▼───────┐
│PostgreSQL│    │  LiveKit Server │  │  MinIO / S3  │
│  (BDD)  │    │  (WebRTC vidéo) │  │  (recordings)│
└─────────┘    └─────────────────┘  └──────────────┘
     ▲
┌────┴──────────────────────────────────────────────────────┐
│          Agent Proctor (agent_proctor/run.py)             │
│  Service Python autonome — PM2 : cei-agent-proctor        │
│  • Lit l'API CEI toutes les 30s via endpoints /agent/     │
│  • Analyse comportementale via Ollama                     │
│  • Envoie emails + alertes dashboard                      │
└───────────────────────────────────────────────────────────┘
```

### Chaîne IA de correction

```
Anthropic Claude Sonnet 4.6
        ↓ (si indisponible)
Google Gemini 2.0 Flash
        ↓ (si quota épuisé)
DeepSeek Chat
        ↓ (si indisponible)
Ollama local (qwen3.6 pour corrections, gemma3:12b pour suggestions)
```

---

## 4. Prérequis système

**OS recommandé** : Ubuntu 22.04 LTS

### Packages système

```bash
sudo apt update && sudo apt install -y \
    python3.11 python3.11-venv python3-pip \
    postgresql postgresql-contrib \
    nginx \
    poppler-utils \
    tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng \
    git curl
```

### Node.js et PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### LiveKit Server

Documentation officielle : https://docs.livekit.io/home/self-hosting/local/

### MinIO (stockage vidéo — optionnel)

```bash
# Via Docker
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=motdepasse \
  quay.io/minio/minio server /data --console-address ":9001"
```

---

## 5. Installation complète

### Étape 1 — Cloner le dépôt

```bash
git clone https://github.com/Sergio-Oracle/cei-unchk.sn.git
cd cei-unchk.sn
```

### Étape 2 — Environnement Python virtuel

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Étape 3 — Base de données PostgreSQL

```bash
sudo -u postgres psql << 'EOF'
CREATE USER exam_user WITH PASSWORD 'votre_mot_de_passe_ici';
CREATE DATABASE exam_grader_db OWNER exam_user;
GRANT ALL PRIVILEGES ON DATABASE exam_grader_db TO exam_user;
EOF
```

### Étape 4 — Fichier de configuration

```bash
cp .env.example .env
nano .env   # Remplir toutes les variables (voir section 6)
```

### Étape 5 — Initialiser la base de données

```bash
source .venv/bin/activate
python3 -c "from models import init_db; init_db(); print('OK BDD initialisée')"
```

### Étape 6 — Créer le compte administrateur

```bash
source .venv/bin/activate
python3 create_admin.py
```

### Étape 7 — Créer les dossiers de données

```bash
mkdir -p static/uploads exports exams
touch static/uploads/.gitkeep exports/.gitkeep exams/.gitkeep
```

### Étape 8 — Vérifier l'OCR (obligatoire pour PDFs CIDFont)

```bash
tesseract --version
tesseract --list-langs   # doit afficher fra et eng

# Si les langues manquent :
sudo apt install -y tesseract-ocr-fra tesseract-ocr-eng
```

### Étape 9 — Lancer la plateforme

```bash
# Développement local
source .venv/bin/activate
python3 app.py

# Production avec PM2
pm2 start ecosystem.config.js
pm2 start agent_proctor/ecosystem.agent.config.js
pm2 save
pm2 startup   # suivre les instructions affichées
```

---

## 6. Configuration .env

Créer un fichier `.env` à la racine. **Ne jamais commiter ce fichier** (il est dans .gitignore).

```bash
# ── Clés IA ──────────────────────────────────────────────────────────
# Au moins une clé IA est obligatoire.
# Fallback automatique : Anthropic → Gemini → DeepSeek → Ollama
ANTHROPIC_API_KEY=sk-ant-api03-...
GEMINI_API_KEY=AIza...
GEMINI_API_KEY_2=AIza...          # optionnel, rotation automatique si quota dépassé
DEEPSEEK_API_KEY=sk-...

# ── Ollama — IA locale (fallback final) ───────────────────────────────
OLLAMA_API_URL=https://votre-serveur-ollama.exemple.sn
OLLAMA_API_KEY=votre-cle-api-ollama
OLLAMA_MODEL=qwen3.6:latest        # modèle précis pour les corrections
OLLAMA_MODEL_FAST=gemma3:12b       # modèle rapide pour les suggestions

# ── Flask ─────────────────────────────────────────────────────────────
FLASK_ENV=production
FLASK_DEBUG=False
SECRET_KEY=cle-secrete-longue-et-aleatoire-min-32-chars
JWT_SECRET_KEY=autre-cle-secrete-jwt-min-32-chars

# ── PostgreSQL ────────────────────────────────────────────────────────
DATABASE_URL=postgresql://exam_user:mot_de_passe@localhost:5432/exam_grader_db

# ── Application ──────────────────────────────────────────────────────
APP_URL=https://votre-domaine.sn
MAX_FILE_SIZE=16777216
ALLOWED_EXTENSIONS=pdf,docx,doc,txt
UPLOAD_FOLDER=static/uploads
ITEMS_PER_PAGE=10

# ── Email SMTP ────────────────────────────────────────────────────────
SMTP_SERVER=votre-serveur-smtp.sn
SMTP_PORT=587
SMTP_USERNAME=votre-utilisateur-smtp
SMTP_PASSWORD=votre-mot-de-passe-smtp
SMTP_FROM_EMAIL=noreply@votre-domaine.sn
SMTP_FROM_NAME=CEI — Centre d'Examen Intelligent
SMTP_HOST=votre-serveur-smtp.sn
SMTP_USER=votre-utilisateur-smtp
FROM_EMAIL=noreply@votre-domaine.sn

# ── LiveKit (Proctoring vidéo) ────────────────────────────────────────
LIVEKIT_URL=wss://votre-livekit.domaine.sn
LIVEKIT_API_KEY=votre-livekit-api-key
LIVEKIT_API_SECRET=votre-livekit-api-secret
LIVEKIT_API_URL=http://127.0.0.1:7880

# ── MinIO / S3 (Enregistrements vidéo) ───────────────────────────────
S3_KEY_ID=votre-access-key
S3_KEY_SECRET=votre-secret-key
S3_ENDPOINT=http://votre-minio:9000
S3_BUCKET=livekit-recordings
S3_REGION=us-east-1

# ── Agent Proctor autonome ────────────────────────────────────────────
# IMPORTANT : choisir une clé longue et unique — ne jamais exposer cette clé
AGENT_SECRET_KEY=une-cle-secrete-agent-unique-min-32-chars
AGENT_RISK_ALERT=60       # score de risque déclenchant une alerte email
AGENT_RISK_URGENT=80      # score déclenchant une alerte URGENTE
AGENT_CHECK_INTERVAL=30   # secondes entre deux cycles d'analyse
AGENT_ALERT_COOLDOWN=600  # secondes de silence par étudiant après une alerte
```

---

## 7. Structure du projet

```
cei-unchk.sn/
│
├── app.py                        # Application Flask principale
├── models.py                     # Modèles SQLAlchemy (BDD)
├── utils.py                      # Extraction PDF/OCR, emails, utilitaires
├── proctoring_routes.py          # Routes surveillance LiveKit + endpoints Agent
├── csv_import_routes.py          # Import CSV étudiants/notes
├── export_route.py               # Export relevés de notes PDF
│
├── agent_proctor/                # Service Agent de surveillance autonome
│   ├── run.py                    # Point d'entrée (lancé par PM2)
│   ├── monitor.py                # Boucle principale + analyse IA + heartbeat
│   ├── email_alerts.py           # Templates et envoi emails d'alerte HTML
│   ├── config.py                 # Configuration (lit .env)
│   └── ecosystem.agent.config.js # Configuration PM2 pour l'agent
│
├── agent_heartbeat.json          # Généré automatiquement par l'agent (statut temps réel)
├── agent_alerts.json             # Alertes dashboard (max 200, généré automatiquement)
├── swagger_docs.py               # Documentation API OpenAPI 3.0 (Blueprint Flask)
│
├── templates/
│   ├── index.html                # Application SPA principale
│   ├── landing.html              # Page d'accueil publique
│   ├── proctor_dashboard.html    # Dashboard surveillance + alertes agent
│   ├── proctor_exam.html         # Interface étudiant examen en ligne
│   ├── guide_student.html        # Guide étudiant
│   ├── guide_teacher.html        # Guide enseignant
│   ├── guide_surveillant.html    # Guide surveillant
│   └── terms.html                # Conditions d'utilisation
│
├── static/
│   ├── js/
│   │   ├── app.js                # JavaScript SPA principal
│   │   ├── face_detector.js      # Détection visages (MediaPipe + face-api.js)
│   │   ├── site_translator.js    # Traduction dynamique français/anglais
│   │   └── translations.js       # Dictionnaires de traduction
│   ├── favicon.svg
│   └── fontawesome/              # Icônes FontAwesome (hébergement local)
│
├── ecosystem.config.js           # Configuration PM2 — plateforme principale
├── gunicorn.conf.py              # Configuration Gunicorn (workers, timeout...)
├── requirements.txt              # Dépendances Python
├── create_admin.py               # Script création compte admin initial
├── populate_maquette.py          # Script données de démonstration
├── .env.example                  # Modèle .env (sans valeurs sensibles)
└── .gitignore
```

---

## 8. Agent de surveillance autonome

L'agent proctor est un **service Python indépendant** (`cei-agent-proctor` sous PM2) qui tourne en parallèle de la plateforme. Il ne modifie pas la logique métier — il communique uniquement via les endpoints `/api/agent/`. Il est **attribué automatiquement à tous les examens actifs** sans aucune action de l'enseignant.

### Fonctionnement — cycle de 30 secondes

```
Toutes les 30 secondes :
  1. GET /api/agent/active_exams             → liste des examens actifs
  2. GET /api/agent/exam_proctoring/{id}     → données + emails par examen
  3. Pour chaque étudiant risk_score ≥ AGENT_RISK_ALERT :
     a. Analyse comportementale par Ollama (qwen3.6)
     b. POST /api/agent/alerts               → alerte stockée (visible dashboard)
     c. Email HTML envoyé aux surveillants + enseignant
     d. Cooldown 10 min par étudiant (pas de spam)
  4. Écriture de agent_heartbeat.json        → statut lisible par l'API

Toutes les 15 minutes :
  → Email récapitulatif HTML à l'enseignant (stats : actifs, alertes, exclusions)
```

### Système Heartbeat

L'agent écrit `agent_heartbeat.json` à la racine du projet après chaque cycle. Ce fichier est lu par l'endpoint `GET /api/agent/status` pour exposer l'état en temps réel. Si le fichier date de plus de 90 secondes (3× l'intervalle), l'agent est considéré inactif.

```json
{
  "alive": true,
  "last_check": "2026-05-30T12:05:07+00:00",
  "interval_seconds": 30,
  "exams_monitored": 2,
  "total_alerts_session": 5,
  "exam_stats": {
    "42": { "title": "Réseaux L3", "total": 24, "alerts_sent": 3, "banned": 1 }
  }
}
```

### Niveaux d'alerte

| Score de risque | Niveau | Couleur | Action déclenchée |
|---|---|---|---|
| 60 – 79 | ALERTE | 🟠 Orange | Email + badge dashboard |
| 80 – 100 | URGENT | 🔴 Rouge | Email urgent + notification navigateur |

### Score de risque — ce qui le fait monter

| Événement détecté | Points ajoutés |
|---|---|
| Visage absent (no_face_detected) | +10 par occurrence |
| Plusieurs visages détectés | +20 par occurrence |
| Changement d'onglet / fenêtre | +15 (plafond 60) |
| Avertissement reçu | +5 (plafond 40) |

### Endpoints API de l'agent

| Méthode | Endpoint | Auth | Usage |
|---|---|---|---|
| GET | `/api/agent/status` | JWT | Statut live + stats par examen (`?exam_id=N`) |
| GET | `/api/agent/active_exams` | X-Agent-Secret | Examens actifs (service agent) |
| GET | `/api/agent/exam_proctoring/{id}` | X-Agent-Secret | Données + emails d'un examen |
| POST | `/api/agent/alerts` | X-Agent-Secret | Pousser une alerte vers le dashboard |
| GET | `/api/agent/alerts` | JWT | Lire les alertes non lues (dashboard) |
| POST | `/api/agent/alerts/read` | JWT | Marquer des alertes comme lues |

### Indicateurs visuels dans l'interface

L'agent est rendu visible dans trois endroits :

**1. Dashboard surveillant/enseignant** — Panneau "Surveillance active"
```
┌─────────────────────────────────────────┐
│ 🟢 🤖 Agent IA Autonome  [EN SERVICE]  │ Automatique
│ Agent actif — Surveillance IA en cours  │
│ 👥 24 étudiant(s)  🔔 3 alerte(s)  ⏱/30s │
│ Dernier cycle : il y a 12s              │
└─────────────────────────────────────────┘
  [Surveillant humain 1]  [Surveillant humain 2]
```

**2. Modal "Gestion de la Surveillance"** — bandeau en haut avec statut, seuils, et mention "attribué automatiquement"

**3. Interface étudiant pendant l'examen** — bandeau discret dans le panneau de surveillance :
```
🟢 🤖 Agent IA de surveillance actif
   Surveillance automatique en temps réel
```

### Vérifier le statut de l'agent

```bash
# Via l'API (nécessite un token JWT valide)
curl https://votre-domaine.sn/api/agent/status \
  -H "Authorization: Bearer <token>"

# Via PM2
pm2 logs cei-agent-proctor --lines 20

# Fichier heartbeat direct
cat agent_heartbeat.json | python3 -m json.tool
```

### Gestion PM2

```bash
# Démarrer l'agent
pm2 start agent_proctor/ecosystem.agent.config.js

# Logs en temps réel
pm2 logs cei-agent-proctor

# Redémarrer après modification
pm2 restart cei-agent-proctor

# État de tous les services
pm2 list
```

### L'agent sur l'examen est-il automatique ?

**Oui, totalement automatique.** L'agent surveille tous les examens dont le statut est `ACTIVE`. Il n'existe pas de bouton "activer la surveillance IA" — dès qu'un examen est activé via `/api/online_exams/{id}/activate`, l'agent le détecte lors de son prochain cycle (≤ 30 secondes) et commence à surveiller tous les étudiants inscrits.

---

## 9. Déploiement production PM2 + Nginx

### PM2 — Démarrage de tous les services

```bash
# Lancer la plateforme et l'agent
pm2 start ecosystem.config.js
pm2 start agent_proctor/ecosystem.agent.config.js

# Sauvegarder pour redémarrage automatique après reboot
pm2 save
pm2 startup   # copier-coller la commande affichée avec sudo

# État des processus
pm2 list

# Logs temps réel
pm2 logs

# Redémarrer après mise à jour du code
pm2 restart exam-api-v3 --update-env
pm2 restart cei-agent-proctor
```

### Nginx — Configuration reverse proxy

```nginx
server {
    listen 80;
    server_name votre-domaine.sn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name votre-domaine.sn;

    ssl_certificate     /etc/letsencrypt/live/votre-domaine.sn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votre-domaine.sn/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /static/ {
        alias /chemin/absolu/vers/cei-unchk.sn/static/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### SSL avec Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d votre-domaine.sn
# Renouvellement automatique
sudo crontab -e
# Ajouter : 0 3 * * 0 certbot renew --quiet
```

### Gunicorn — gunicorn.conf.py

```python
bind             = "0.0.0.0:5000"
workers          = 4            # 2 × nb_coeurs recommandé
worker_class     = "sync"
timeout          = 300          # 5 min pour les corrections IA longues
keepalive        = 5
max_requests     = 1000
max_requests_jitter = 100
loglevel         = "info"
accesslog        = "-"
errorlog         = "-"
```

---

## 10. Dépendances IA

### Anthropic Claude (fournisseur principal)

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Obtenir une clé : https://console.anthropic.com  
Modèle utilisé : `claude-sonnet-4-6`

### Google Gemini (fallback 1)

```
GEMINI_API_KEY=AIza...
```

Obtenir une clé : https://aistudio.google.com  
Modèle utilisé : `gemini-2.0-flash`  
Supporte plusieurs clés avec rotation automatique (`GEMINI_API_KEY`, `GEMINI_API_KEY_2`, etc.)

### DeepSeek (fallback 2)

```
DEEPSEEK_API_KEY=sk-...
```

**Note réseau** : Si `api.deepseek.com` est bloqué sur votre réseau universitaire, activer le proxy Tor :

```bash
sudo apt install -y tor
sudo systemctl start tor && sudo systemctl enable tor
# Le code détecte automatiquement Tor sur 127.0.0.1:9050
```

### Ollama — IA locale (fallback final recommandé)

Idéal pour une autonomie complète sans dépendance cloud. Installer sur un serveur avec GPU :

```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull qwen3:8b        # modèle précis — corrections d'examens
ollama pull gemma3:12b      # modèle rapide — suggestions de sujets

# Vérifier
curl http://localhost:11434/api/tags
```

Configuration `.env` :
```
OLLAMA_API_URL=http://votre-serveur-ollama:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_MODEL_FAST=gemma3:12b
```

**Note Qwen3** : Les modèles Qwen3 utilisent un mode "thinking" par défaut. Le code désactive automatiquement ce mode (`"think": false`) et supprime les balises `<think>...</think>` résiduelles.

### OCR — Tesseract (extraction PDF illisibles)

Indispensable pour les PDFs générés avec des outils bureautiques utilisant les polices CIDFont (fréquent avec LibreOffice, Word, outils africains) :

```bash
sudo apt install -y tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng poppler-utils

# Vérification
tesseract --version
tesseract --list-langs   # doit afficher : fra, eng

pdftoppm -v   # doit fonctionner sans erreur
```

**Fonctionnement** : Si pdfplumber et PyPDF2 extraient du texte illisible (type `/0 /1 /i255` ou `(cid:3)`), le système bascule automatiquement sur l'OCR via `pdftoppm` + `tesseract` à 200 DPI.

---

## 12. Dépannage

### La correction IA retourne "service indisponible"

```bash
# Voir les logs de l'application
pm2 logs exam-api-v3 --lines 50

# Tester chaque fournisseur manuellement
# Anthropic :
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'

# Ollama :
curl -X POST $OLLAMA_API_URL/api/chat \
  -H "Authorization: Bearer $OLLAMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3:8b","messages":[{"role":"user","content":"test"}],"stream":false}'
```

### L'OCR ne fonctionne pas sur les PDFs

```bash
# Vérifier l'installation
which tesseract && tesseract --list-langs
which pdftoppm

# Si tesseract absent :
sudo apt install -y tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng poppler-utils
```

### L'agent proctor ne s'exécute pas ou affiche "HORS LIGNE"

```bash
# 1. Voir les logs
pm2 logs cei-agent-proctor --lines 30

# 2. Vérifier le fichier heartbeat
cat agent_heartbeat.json | python3 -m json.tool
# Si le fichier n'existe pas → l'agent n'a jamais démarré

# 3. Vérifier le statut via l'API (avec un token valide)
curl https://votre-domaine.sn/api/agent/status \
  -H "Authorization: Bearer <votre-token>"

# 4. Tester l'authentification agent directement
curl -s -H "X-Agent-Secret: VOTRE_AGENT_SECRET_KEY" \
  https://votre-domaine.sn/api/agent/active_exams

# 5. Vérifier que la clé correspond dans .env
grep AGENT_SECRET_KEY .env

# 6. Redémarrer si nécessaire
pm2 restart cei-agent-proctor
```

**La carte agent affiche "INACTIF" (orange)** — heartbeat existant mais trop ancien :
- L'agent est peut-être bloqué sur un appel réseau
- `pm2 restart cei-agent-proctor` suffit généralement

### Les emails d'alerte ne partent pas

```bash
# Tester le SMTP depuis le serveur
python3 -c "
import smtplib, os
from dotenv import load_dotenv
load_dotenv()
s = smtplib.SMTP(os.getenv('SMTP_SERVER'), int(os.getenv('SMTP_PORT',587)), timeout=15)
s.ehlo(); s.starttls()
s.login(os.getenv('SMTP_USERNAME'), os.getenv('SMTP_PASSWORD'))
print('SMTP OK')
s.quit()
"
```

### Le dashboard n'affiche pas les alertes agent

1. Vérifier que `AGENT_SECRET_KEY` est identique dans `.env` et dans l'agent
2. Vérifier que l'agent tourne : `pm2 list | grep agent`
3. Ouvrir les DevTools navigateur → onglet Réseau → chercher `/api/agent/alerts`
4. Vérifier le fichier `agent_alerts.json` créé à la racine du projet

### Erreur de connexion PostgreSQL

```bash
# Vérifier que PostgreSQL tourne
sudo systemctl status postgresql

# Vérifier la connexion
psql postgresql://exam_user:mot_de_passe@localhost:5432/exam_grader_db -c "\dt"

# Réinitialiser le mot de passe
sudo -u postgres psql -c "ALTER USER exam_user WITH PASSWORD 'nouveau_mdp';"
```

### Port 5000 déjà utilisé

```bash
lsof -i :5000
# Modifier le port dans gunicorn.conf.py et ecosystem.config.js
```

---

## 11. Documentation API Swagger

La plateforme expose une documentation interactive **OpenAPI 3.0** permettant à n'importe quel développeur de découvrir, tester et intégrer les API CEI. La couverture est vérifiée programmatiquement — **100% des endpoints du code sont documentés**.

### URLs d'accès

| Interface | URL | Description |
|---|---|---|
| **Swagger UI** | `https://votre-domaine.sn/api/docs` | Interface interactive — tester les endpoints en un clic |
| **ReDoc** | `https://votre-domaine.sn/api/docs/redoc` | Lecture alternative, plus lisible |
| **Spec JSON** | `https://votre-domaine.sn/api/docs/openapi.json` | Spec brute OpenAPI 3.0 pour les générateurs de clients |

### Contenu de la documentation

**111 opérations HTTP** sur **100 routes** réparties en **13 groupes** :

| Groupe | Opérations | Description |
|---|---|---|
| Authentification | 5 | Login, register, profil, mot de passe |
| Administration | 10 | Utilisateurs, dashboard, historique, imports CSV |
| Académique | 23 | Formations, semestres, UE, EC, inscriptions, affectations |
| Import CSV | 4 | Templates et imports en masse (utilisateurs + maquette) |
| Sujets | 6 | Upload, création, gestion, génération IA |
| Copies | 6 | Upload, correction IA, export PDF, statistiques |
| Examens en ligne | 14 | Création, cycle de vie, tentatives, correction, incidents |
| Proctoring | 22 | Surveillance vidéo, risques, messages, enregistrements LiveKit |
| Agent autonome | 6 | Statut heartbeat, alertes, données surveillance |
| Intelligence Artificielle | 3 | Suggestions et génération de sujets par IA |
| Réclamations | 6 | Dépôt, traitement IA, accepter/rejeter |
| Relevés de notes | 4 | Génération, liste, téléchargement PDF |
| Tableaux de bord | 4 | Dashboards professeur et étudiant |

### Schémas de données documentés (15 objets)

`User` · `Subject` · `StudentPaper` · `OnlineExam` · `ExamAttempt` · `Formation` · `Semester` · `UE` · `EC` · `Reclamation` · `GradeTranscript` · `AgentAlert` · `ExamIncident` · `Error` · `Success`

### Authentification dans Swagger UI

1. Ouvrir `https://votre-domaine.sn/api/docs`
2. Cliquer sur **Authorize** (cadenas en haut à droite)
3. Appeler `POST /api/auth/login` → récupérer `access_token`
4. Saisir `Bearer <access_token>` dans le champ **BearerAuth**
5. Tous les endpoints protégés sont accessibles via **Try it out**

> Les endpoints de l'agent (`/api/agent/active_exams`, `/api/agent/exam_proctoring`, `POST /api/agent/alerts`) utilisent le schéma **AgentSecret** (`X-Agent-Secret` header) — voir `.env` pour la valeur `AGENT_SECRET_KEY`.

### Générer un client SDK automatiquement

```bash
# TypeScript / JavaScript (React, Vue, Next.js, Angular...)
npx openapi-typescript-codegen \
  --input https://votre-domaine.sn/api/docs/openapi.json \
  --output ./src/api-client \
  --client axios

# Python
pip install openapi-python-client
openapi-python-client generate \
  --url https://votre-domaine.sn/api/docs/openapi.json

# Dart / Flutter
flutter pub run build_runner build   # avec openapi_generator dans pubspec.yaml

# Java / Kotlin (Android, Spring)
openapi-generator-cli generate \
  -i https://votre-domaine.sn/api/docs/openapi.json \
  -g kotlin -o ./sdk-android

# PHP (Laravel, Symfony)
openapi-generator-cli generate \
  -i https://votre-domaine.sn/api/docs/openapi.json \
  -g php -o ./sdk-php
```

### Importer dans Postman

```
1. Ouvrir Postman → File → Import
2. Coller l'URL : https://votre-domaine.sn/api/docs/openapi.json
3. Importer → la collection complète est prête (111 requêtes pré-configurées)
```

### Vérification de couverture

La couverture est vérifiable programmatiquement :

```python
import json, requests

spec   = requests.get("https://votre-domaine.sn/api/docs/openapi.json").json()
total  = sum(len(v) for v in spec["paths"].values())
print(f"{total} opérations documentées sur {len(spec['paths'])} routes")
# → 111 opérations documentées sur 100 routes
```

### Structure du fichier `swagger_docs.py`

```
swagger_docs.py                    # Blueprint Flask — aucune dépendance pip requise
├── OPENAPI_SPEC                   # Dictionnaire Python OpenAPI 3.0 complet
│   ├── info                       # Titre, version 2.1.0, contact EC2LT, licence MIT
│   ├── servers                    # Production (cei.ec2lt.sn) + localhost:5000
│   ├── tags                       # 13 groupes avec descriptions
│   ├── components.schemas         # 15 schémas réutilisables
│   ├── components.securitySchemes # BearerAuth (JWT) + AgentSecret (X-Agent-Secret)
│   └── paths                      # 111 opérations avec params, corps, réponses réels
├── GET /api/docs                  # Swagger UI (Swagger UI v5 depuis CDN)
├── GET /api/docs/redoc            # ReDoc (depuis CDN)
└── GET /api/docs/openapi.json     # Spec JSON brute
```

> Swagger UI et ReDoc sont chargés depuis CDN — aucune installation npm ou build step requis.

---

## Rôles utilisateurs

| Rôle | Permissions |
|---|---|
| `admin` | Accès complet — utilisateurs, formations, UE, EC, sujets, examens, notes |
| `professor` | Création sujets/examens, correction copies, consultation notes de ses EC |
| `surveillant` | Dashboard surveillance, envoi avertissements, exclusion étudiants |
| `student` | Passage examens, consultation notes et relevés, dépôt réclamations |

---

## Licence

MIT License — © 2026 RTN – Réseaux et Techniques Numériques (EC2LT), Sénégal.

---

*CEI v2.2 — Mai 2026*  
*Liberté 2, derrière immeuble BICIS, Jet d'eau – Dakar – Sénégal · Castors, avenue Bourguiba, rue n°13*  
*(+221) 77 662 76 94 · entreprisertn221@gmail.com*
