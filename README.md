# CEI — Centre d'Examen Intelligent

> Plateforme sénégalaise d'examens en ligne avec surveillance vidéo en temps réel, correction automatique par IA et gestion pédagogique complète.

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0+-green.svg)](https://flask.palletsprojects.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://postgresql.org)
[![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC-orange.svg)](https://livekit.io)
[![Claude AI](https://img.shields.io/badge/Claude-Sonnet_4-purple.svg)](https://anthropic.com)

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Fonctionnalités](#fonctionnalités)
3. [Architecture](#architecture)
4. [Prérequis](#prérequis)
5. [Installation rapide](#installation-rapide)
6. [Structure du projet](#structure-du-projet)
7. [API Reference](#api-reference)
8. [Configuration](#configuration)
9. [Déploiement production](#déploiement-production)
10. [Contribution](#contribution)

---

## Vue d'ensemble

CEI est une plateforme web complète pour la gestion des examens académiques, développée pour les universités et grandes écoles d'Afrique de l'Ouest. Elle combine :

- **Gestion pédagogique** — maquette académique complète (Formations → Semestres → UE → EC)
- **Correction par IA** — utilisation de Claude Sonnet d'Anthropic pour corriger automatiquement les copies
- **Surveillance en ligne** — proctoring WebRTC avec détection faciale via Face.js et LiveKit
- **Gestion des notes** — relevés de notes, réclamations, historique des corrections
- **Multi-rôles** — interfaces dédiées Admin, Professeur, Étudiant

---

## Fonctionnalités

### Pour les Administrateurs
- Gestion complète des utilisateurs (créer/modifier/supprimer)
- Gestion de la maquette pédagogique (Formation, Semestre, UE, EC)
- Affectation des professeurs aux EC
- Inscription des étudiants aux UE
- Import en masse via CSV
- Dashboard avec statistiques globales
- Génération de relevés de notes PDF

### Pour les Professeurs
- Création de sujets d'examens (upload PDF/DOCX ou génération IA)
- Correction automatique par IA (Claude Sonnet)
- Correction manuelle avec interface dédiée
- Correction en lot (upload multiple de copies)
- Statistiques détaillées (moyenne, médiane, écart-type, distribution)
- Gestion des réclamations étudiantes
- Création et gestion d'examens en ligne avec surveillance
- Dashboard de proctoring en temps réel

### Pour les Étudiants
- Passage d'examens en ligne surveillés
- Détection automatique : changement d'onglet, absence de visage, outils de développement
- Consultation de ses notes et relevés de notes
- Dépôt de réclamations sur les corrections
- Téléchargement des relevés de notes en PDF

### Proctoring (Surveillance)
- Flux vidéo WebRTC via LiveKit
- Détection faciale en temps réel (Face.js — modèles TinyFaceDetector)
- Journalisation des incidents (tabswitch, absence, multi-visages)
- Score de risque calculé automatiquement
- Exclusion automatique en cas de violations multiples
- Enregistrement des sessions sur MinIO/S3

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (443)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    NGINX (Reverse Proxy)                     │
│   cei.ec2lt.sn → localhost:7000   │  /static → cache 1d    │
│   SSL : Let's Encrypt             │  upload max : 100MB     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              PM2  (Process Manager)                          │
│         app: exam-api-v3   │   port: 7000                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Flask Application (app.py)                 │
│                                                             │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  REST API  │  │ Proctoring   │  │   CSV Import /     │  │
│  │ 60+ routes │  │ Routes       │  │   Export Routes    │  │
│  └─────┬──────┘  └──────┬───────┘  └────────┬───────────┘  │
│        │                │                   │              │
│  ┌─────▼──────────────────────────────────────────────┐   │
│  │            SQLAlchemy ORM  (models.py)              │   │
│  └─────┬──────────────────────────────────────────────┘   │
└────────│────────────────────────────────────────────────────┘
         │
         ├──────────────────────────────────────────┐
         ▼                                          ▼
┌─────────────────┐                    ┌────────────────────┐
│  PostgreSQL 16  │                    │   Services externes │
│  exam_grader_db │                    │                    │
│                 │                    │  Anthropic Claude  │
│  15 tables      │                    │  (Correction IA)   │
│  migrations SQL │                    │                    │
└─────────────────┘                    │  LiveKit WebRTC    │
                                       │  (Proctoring)      │
                                       │                    │
                                       │  MinIO / S3        │
                                       │  (Enregistrements) │
                                       │                    │
                                       │  Gmail SMTP        │
                                       │  (Notifications)   │
                                       └────────────────────┘

Frontend (SPA Vanilla JS)
─────────────────────────
Browser → app.js (REST API calls) → Flask
        → Face.js (face detection ML, WebWorker)
        → LiveKit SDK (WebRTC video)
```

### Stack technologique

| Couche | Technologie | Version | Rôle |
|--------|-------------|---------|------|
| Reverse Proxy | Nginx | latest | TLS, cache statiques, proxy |
| Process Manager | PM2 | latest | Démarrage, redémarrage auto |
| Backend | Flask | 3.0+ | API REST + rendu templates |
| ORM | SQLAlchemy | 2.0+ | Abstraction base de données |
| Base de données | PostgreSQL | 16 | Stockage persistant |
| Auth | JWT (Flask-JWT-Extended) | — | Authentification sans session |
| IA | Anthropic Claude Sonnet | API | Correction automatique |
| WebRTC | LiveKit | — | Streaming vidéo proctoring |
| Face Detection | Face.js (TensorFlow.js) | — | Détection faciale côté client |
| Stockage objets | MinIO / AWS S3 | — | Enregistrements vidéo |
| Email | Gmail SMTP | — | Notifications étudiants |
| Frontend | Vanilla JS + HTML5 | — | SPA sans framework |
| PDF | ReportLab + PyPDF2 | — | Génération relevés, lecture copies |
| Déploiement | Ubuntu 24.04 + systemd | — | Serveur VPS |

---

## Prérequis

- **OS** : Ubuntu 22.04 / 24.04 LTS (ou Debian 12)
- **Python** : 3.10+
- **PostgreSQL** : 14+
- **Node.js** : 18+ (pour PM2)
- **Nginx** : 1.18+
- **Certbot** : pour SSL Let's Encrypt
- **RAM** : 2 Go minimum (4 Go recommandés)
- **Disque** : 20 Go minimum

### Services externes requis

| Service | Usage | Obligatoire |
|---------|-------|-------------|
| [Anthropic API](https://console.anthropic.com/) | Correction IA | Oui |
| [LiveKit Server](https://docs.livekit.io/) | Proctoring vidéo | Si examens en ligne |
| Gmail (App Password) | Notifications email | Recommandé |
| MinIO ou AWS S3 | Enregistrements vidéo | Si proctoring activé |

---

## Installation rapide

```bash
# 1. Cloner le dépôt
git clone https://github.com/Sergio-Oracle/cei-exam-platform.git
cd cei-exam-platform

# 2. Configurer l'environnement
cp .env.example .env
nano .env   # Remplir toutes les valeurs

# 3. Déploiement automatisé complet
sudo bash scripts/deploy.sh

# 4. Créer le premier administrateur
source .venv/bin/activate
python create_admin.py

# 5. (Optionnel) Importer une maquette pédagogique exemple
python populate_maquette.py
```

Pour une installation pas à pas, voir [QUICKSTART.md](QUICKSTART.md).

---

## Structure du projet

```
cei-exam-platform/
├── app.py                    # Application Flask principale (60+ routes API)
├── models.py                 # Modèles SQLAlchemy (15 tables)
├── utils.py                  # Utilitaires (email, PDF, fichiers)
├── proctoring_routes.py      # Routes proctoring LiveKit
├── csv_import_routes.py      # Import en masse CSV
├── export_route.py           # Export PDF / données
├── ecosystem.config.js       # Configuration PM2
├── requirements.txt          # Dépendances Python
├── .env.example              # Template variables d'environnement
│
├── templates/                # Templates HTML Jinja2
│   ├── landing.html          # Page d'accueil publique
│   ├── index.html            # Application principale (SPA)
│   ├── proctor_dashboard.html # Dashboard surveillant
│   ├── proctor_exam.html     # Interface examen étudiant
│   ├── guide_student.html    # Guide étudiant
│   ├── guide_teacher.html    # Guide enseignant
│   └── terms.html            # Conditions d'utilisation
│
├── static/
│   ├── css/
│   │   ├── landing.css       # Styles page d'accueil
│   │   └── style.css         # Styles application
│   ├── js/
│   │   ├── app.js            # SPA principale (REST API + UI)
│   │   └── app_maquette.js   # Gestion maquette pédagogique
│   ├── models/faceapi/       # Modèles ML Face.js
│   └── uploads/              # Fichiers uploadés (gitignore)
│
├── scripts/
│   ├── deploy.sh             # Déploiement automatisé complet
│   ├── setup_db.sh           # Initialisation PostgreSQL
│   ├── backup.sh             # Sauvegarde DB + fichiers
│   └── update.sh             # Mise à jour sans downtime
│
├── exports/                  # Relevés de notes générés (gitignore)
└── exams/                    # Fichiers d'examens (gitignore)
```

---

## API Reference

L'API REST utilise JWT pour l'authentification. Inclure le header :
```
Authorization: Bearer <token>
```

### Authentification

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/register` | Inscription |
| POST | `/api/auth/login` | Connexion → retourne JWT |
| GET | `/api/auth/me` | Infos utilisateur courant |

### Maquette pédagogique

| Méthode | Route | Rôle requis |
|---------|-------|-------------|
| GET | `/api/formations` | Tous |
| POST | `/api/admin/formations` | Admin |
| GET | `/api/formations/:id/semesters` | Tous |
| POST | `/api/admin/semesters` | Admin |
| GET | `/api/semesters/:id/ues` | Tous |
| GET | `/api/ues/:id/ecs` | Tous |

### Sujets et Copies

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/subjects` | Liste des sujets (filtré par rôle) |
| POST | `/api/subjects/upload` | Créer un sujet |
| POST | `/api/papers/upload` | Upload une copie |
| POST | `/api/papers/upload-batch` | Upload en lot |
| POST | `/api/exam_attempts/:id/correct` | Déclencher correction IA |

### Examens en ligne

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/online_exams` | Liste des examens |
| POST | `/api/online_exams` | Créer un examen |
| POST | `/api/online_exams/:id/start` | Démarrer (étudiant) |
| POST | `/api/exam_attempts/:id/submit` | Soumettre |
| POST | `/api/exam_attempts/:id/log_activity` | Log incident |

### IA

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/ai/generate-exam-suggestions` | Suggestions de sujets |
| POST | `/api/subjects/generate-full-exam` | Générer un examen complet |

---

## Configuration

Toutes les configurations se font via le fichier `.env`. Voir `.env.example` pour la référence complète.

Variables critiques :

```bash
# Base de données
DATABASE_URL=postgresql://exam_user:PASSWORD@localhost:5432/exam_grader_db

# IA
ANTHROPIC_API_KEY=sk-ant-api03-...

# Sécurité
SECRET_KEY=<32 octets aléatoires>
JWT_SECRET_KEY=<32 octets aléatoires>

# Proctoring
LIVEKIT_URL=wss://livekit.votre-domaine.com
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

---

## Déploiement production

### Commandes PM2 essentielles

```bash
pm2 status                    # Voir l'état de l'application
pm2 logs exam-api-v3          # Voir les logs en temps réel
pm2 restart exam-api-v3       # Redémarrer
pm2 stop exam-api-v3          # Arrêter
pm2 reload exam-api-v3        # Redémarrer sans coupure
pm2 save                      # Sauvegarder la config (survit aux reboots)
```

### Sauvegarde automatique (cron)

```bash
# Éditer le cron
crontab -e

# Ajouter : sauvegarde quotidienne à 2h du matin
0 2 * * * /root/exam-grading-system_online/scripts/backup.sh >> /var/log/cei_backup.log 2>&1
```

### Logs

```bash
# Logs Nginx
tail -f /var/log/nginx/cei_access.log
tail -f /var/log/nginx/cei_error.log

# Logs application
pm2 logs exam-api-v3 --lines 100
```

---

## Contribution

1. Fork le dépôt
2. Créer une branche : `git checkout -b feature/ma-fonctionnalite`
3. Commiter : `git commit -m "feat: description"`
4. Pousser : `git push origin feature/ma-fonctionnalite`
5. Ouvrir une Pull Request

---

*Développé pour les universités et grandes écoles d'Afrique de l'Ouest.*
