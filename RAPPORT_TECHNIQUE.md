# Rapport Technique — CEI (Centre d'Examen Intelligent)

**Version :** 2.0.0  
**Date :** Avril 2026  
**Plateforme :** https://cei.ec2lt.sn

---

## Table des matières

1. [Introduction et contexte](#1-introduction-et-contexte)
2. [Architecture globale](#2-architecture-globale)
3. [Infrastructure serveur](#3-infrastructure-serveur)
4. [Backend Flask](#4-backend-flask)
5. [Base de données PostgreSQL](#5-base-de-données-postgresql)
6. [Authentification et sécurité](#6-authentification-et-sécurité)
7. [Correction automatique par IA](#7-correction-automatique-par-ia)
8. [Système de proctoring (surveillance)](#8-système-de-proctoring-surveillance)
9. [Frontend (SPA Vanilla JS)](#9-frontend-spa-vanilla-js)
10. [Gestion des fichiers](#10-gestion-des-fichiers)
11. [Système d'emails](#11-système-demails)
12. [Performance et optimisations](#12-performance-et-optimisations)
13. [Modèle de données complet](#13-modèle-de-données-complet)
14. [Flux applicatifs principaux](#14-flux-applicatifs-principaux)
15. [Sécurité et conformité](#15-sécurité-et-conformité)
16. [Perspectives d'évolution](#16-perspectives-dévolution)

---

## 1. Introduction et contexte

### 1.1 Présentation du projet

CEI (Centre d'Examen Intelligent) est une plateforme web destinée aux établissements d'enseignement supérieur d'Afrique de l'Ouest. Elle répond à un double besoin :

1. **Numérisation des examens** — remplacer les processus papier par une gestion entièrement numérique (sujets, copies, notes, relevés)
2. **Intelligence artificielle** — automatiser la correction des copies pour réduire la charge des enseignants et accélérer la publication des résultats

### 1.2 Problématiques résolues

| Problème traditionnel | Solution CEI |
|----------------------|--------------|
| Correction manuelle longue (semaines) | Correction IA en quelques secondes |
| Perte ou détérioration des copies papier | Stockage numérique sécurisé |
| Examens en présentiel contraignants | Examens en ligne surveillés |
| Fraude aux examens | Proctoring vidéo + détection comportementale |
| Relevés de notes manuels | Génération PDF automatisée |
| Communication lente des résultats | Notifications email instantanées |

### 1.3 Utilisateurs cibles

- **Administrateurs** : personnel administratif des universités
- **Professeurs / Enseignants** : création de sujets, correction, surveillance
- **Étudiants** : passage d'examens, consultation des notes, réclamations

---

## 2. Architecture globale

### 2.1 Vue d'ensemble

CEI suit une architecture **monolithique modulaire** : une seule application Flask qui regroupe l'API REST, les templates HTML et la logique métier, organisée en modules distincts (routes principales, proctoring, import CSV, export).

Ce choix est délibéré pour une équipe réduite : il simplifie le déploiement, le débogage et la maintenance, sans sacrifier la lisibilité grâce à la séparation des fichiers de routes.

```
Internet
   │ HTTPS
   ▼
Nginx ──────── Certificat SSL Let's Encrypt
   │ HTTP Proxy
   ▼
PM2 (Node.js process manager)
   │ spawn
   ▼
Flask app (Python 3.10+) ─── Port 7000
   ├── app.py           (routes principales, ~4400 lignes)
   ├── proctoring_routes.py  (LiveKit, incidents, ~820 lignes)
   ├── csv_import_routes.py  (import CSV, ~630 lignes)
   └── export_route.py       (PDF/export, ~125 lignes)
          │
          ▼
   SQLAlchemy ORM
          │
          ▼
   PostgreSQL 16 (exam_grader_db, 15 tables)
```

### 2.2 Séparation des responsabilités

| Module | Fichier | Lignes | Responsabilité |
|--------|---------|--------|----------------|
| Application principale | `app.py` | 4 422 | Init Flask, routes API, logique métier |
| Modèles de données | `models.py` | 616 | Classes SQLAlchemy, schéma DB |
| Utilitaires | `utils.py` | 675 | Email, PDF, traitement fichiers |
| Proctoring | `proctoring_routes.py` | 819 | LiveKit, incidents, surveillance |
| Import CSV | `csv_import_routes.py` | 628 | Import en masse utilisateurs/données |
| Export | `export_route.py` | 125 | Génération de fichiers à télécharger |

---

## 3. Infrastructure serveur

### 3.1 Environnement de production

| Composant | Valeur |
|-----------|--------|
| Hébergeur | VPS Ubuntu 24.04 LTS |
| Domaine | cei.ec2lt.sn |
| Reverse proxy | Nginx |
| SSL | Let's Encrypt (certbot auto-renouvellement) |
| Process manager | PM2 (nom du processus : `exam-api-v3`) |
| Port applicatif | 7000 (interne, non exposé) |
| Port public | 443 (HTTPS) |

### 3.2 Nginx — configuration détaillée

Nginx joue trois rôles :

**1. Terminaison SSL**
Les certificats Let's Encrypt sont gérés par Certbot. Nginx déchiffre le trafic HTTPS et le transmet en HTTP simple à Flask.

**2. Reverse proxy vers Flask**
```nginx
location / {
    proxy_pass http://localhost:7000;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 3000s;   # Délai long pour examens en ligne
    proxy_buffering off;           # Streaming temps réel proctoring
}
```

**3. Cache des ressources statiques**
```nginx
location /static {
    proxy_cache_valid 200 1d;
    add_header Cache-Control "public, immutable";
}
```

Les fichiers statiques (CSS, JS, modèles ML) sont mis en cache 24h côté client, réduisant la charge serveur.

### 3.3 PM2 — gestion des processus

PM2 est un gestionnaire de processus Node.js, mais il peut superviser des scripts Python. Il offre :

- **Redémarrage automatique** en cas de crash
- **Logs persistants** avec rotation
- **Démarrage au boot** via `pm2 startup`
- **Rechargement sans coupure** (`pm2 reload`)

Configuration (`ecosystem.config.js`) :
```javascript
{
  name: "exam-api-v3",
  script: "app.py",
  interpreter: "/root/exam-grading-system_online/.venv/bin/python3",
  watch: false,    // Désactivé en production pour éviter les redémarrages sauvages
  env: { FLASK_ENV: "production" }
}
```

---

## 4. Backend Flask

### 4.1 Framework et extensions

Flask 3.0+ est utilisé comme framework web. Les extensions principales :

| Extension | Rôle |
|-----------|------|
| `Flask-SQLAlchemy` | ORM intégré à Flask |
| `Flask-JWT-Extended` | Gestion des JSON Web Tokens |
| `Flask-Bcrypt` | Hachage sécurisé des mots de passe |
| `Flask-CORS` | Cross-Origin Resource Sharing pour le frontend |

### 4.2 Organisation des routes

L'API compte plus de 60 endpoints organisés par domaine fonctionnel :

**Authentification** (`/api/auth/`)
- Inscription, connexion, informations utilisateur courant
- Retour d'un JWT à durée configurable

**Administration** (`/api/admin/`)
- CRUD complet utilisateurs, formations, semestres, UE, EC
- Affectation professeur-EC, inscription étudiant-UE
- Dashboard statistiques globales

**Sujets et copies** (`/api/subjects/`, `/api/papers/`)
- Upload PDF/DOCX, extraction de texte
- Correction automatique via Claude API
- Historique des corrections

**Examens en ligne** (`/api/online_exams/`, `/api/exam_attempts/`)
- Création d'examens avec paramètres de surveillance
- Gestion des tentatives, soumission, journalisation
- Calcul automatique du score de risque

**Maquette pédagogique** (`/api/formations/`, `/api/semesters/`, `/api/ues/`, `/api/ecs/`)
- Hiérarchie académique complète
- Filtrage contextuel par rôle utilisateur

**IA** (`/api/ai/`, `/api/subjects/generate-*`)
- Génération de suggestions de sujets d'examen
- Création de sujets complets par IA

**Transcripts** (`/api/transcripts/`)
- Calcul des crédits ECTS, GPA
- Génération PDF de relevés de notes

**Réclamations** (`/api/reclamations/`)
- Dépôt, traitement IA, réponse professeur
- Fenêtre de réclamation configurable par copy

### 4.3 Extraction de texte des fichiers

Lors de l'upload des copies étudiantes, le texte est extrait automatiquement :

- **PDF** : `PyPDF2` lit le texte brut page par page
- **DOCX** : `python-docx` extrait les paragraphes
- **TXT** : lecture directe
- **Fallback** : si l'extraction échoue (PDF scanné), la copie est traitée comme image

### 4.4 Traitement des corrections en lot

Pour la correction en lot, plusieurs copies peuvent être uploadées simultanément. Le serveur :
1. Associe chaque fichier à un étudiant par hachage MD5 du contenu
2. Extrait le nom étudiant mentionné dans la copie
3. Lance la correction IA séquentiellement
4. Retourne un rapport d'avancement

---

## 5. Base de données PostgreSQL

### 5.1 Choix de PostgreSQL

PostgreSQL 16 a été choisi pour :
- Robustesse et conformité ACID
- Support natif du JSON (stockage des réponses d'examen)
- Contraintes d'intégrité référentielle (clés étrangères)
- Performance sur les requêtes analytiques (statistiques de notes)

### 5.2 Schéma de la base de données

La base `exam_grader_db` contient **15 tables** organisées en 4 domaines :

#### Domaine Utilisateurs
```sql
users (
    id, email, password_hash, full_name,
    role (STUDENT|PROFESSOR|ADMIN),
    is_active, email_verified, has_email,
    created_at, last_login
)
```

#### Domaine Maquette Pédagogique
```
formations → semesters → ues → ecs
                                 ↓
                          ec_assignments (professeur affecté)
                         ues → student_ue_enrollments (étudiants inscrits)
```

```sql
formations    (code, name, level, department)
semesters     (formation_id, number, name, total_credits)
ues           (semester_id, code, name, credits)
ecs           (ue_id, code, name, cm, td, tp, vht, coefficient)
ec_assignments     (ec_id, professor_id)
student_ue_enrollments (student_id, ue_id)
```

#### Domaine Examens et Corrections
```sql
subjects (ec_id, title, content, rubric, filename, creator_id)
student_papers (
    subject_id, student_id, content, grade, score, filename,
    file_hash, extracted_student_name, corrected_by_id,
    corrected_at, reclamation_window_end, email_sent
)
reclamations (
    paper_id, student_id, reason, status,
    ia_decision, ia_proposed_score, ia_proposed_grade,
    responded_by_id, created_at
)
correction_history (paper_id, corrector_id, old_score, new_score, reason)
grade_transcripts  (student_id, semester_id, total_credits, obtained_credits, gpa)
```

#### Domaine Proctoring (Examens en ligne)
```sql
online_exams (
    subject_id, title, instructions, duration_minutes,
    start_time, end_time, max_tab_switches,
    enable_copy_paste, randomize_questions, max_no_face_count,
    ban_on_devtools, status (DRAFT|SCHEDULED|ACTIVE|CLOSED)
)
exam_attempts (
    exam_id, student_id, status, started_at, submitted_at,
    tab_switches, warnings_count, no_face_count, banned_at,
    ban_reason, risk_score, answers (JSON), score, feedback
)
exam_activity_logs (attempt_id, event_type, event_data, timestamp)
camera_logs (
    attempt_id, timestamp, face_detected, faces_count,
    in_frame, violation_type, violation_severity,
    image_data, confidence_score, frame_analysis
)
```

### 5.3 Gestion des migrations

Les migrations de schéma sont gérées via des scripts Python individuels (`migrate_*.py`) qui utilisent SQLAlchemy pour modifier le schéma en place. Ce système artisanal convient à une équipe réduite ; une migration vers Alembic est recommandée pour la v3.

---

## 6. Authentification et sécurité

### 6.1 JSON Web Tokens (JWT)

L'authentification est stateless via JWT. Le flux est :

```
Client → POST /api/auth/login {email, password}
Server → Vérifie bcrypt → Génère JWT
Client → Stocke JWT (localStorage)
Client → Toutes requêtes : Authorization: Bearer <token>
Server → Décoder JWT → Identifier utilisateur → Autoriser/Refuser
```

Le JWT contient :
- `identity` : ID utilisateur
- `role` : rôle (admin/professor/student)
- Expiration configurable

### 6.2 Hachage des mots de passe

`Flask-Bcrypt` avec un facteur de coût adaptatif. Les mots de passe ne sont jamais stockés en clair.

### 6.3 Contrôle d'accès par rôle (RBAC)

Trois rôles avec décorateurs Python :
- `@admin_required` : admin uniquement
- `@professor_required` : professeur ou admin
- `@jwt_required()` : tout utilisateur authentifié

### 6.4 Protection des uploads

- Vérification de l'extension et du type MIME
- Nom de fichier sécurisé via `werkzeug.utils.secure_filename`
- Hash MD5 du contenu pour détecter les doublons
- Taille maximale : 16 Mo (configurable)
- Extensions autorisées : PDF, DOCX, DOC, TXT

### 6.5 CORS

Flask-CORS est configuré pour autoriser uniquement les origines connues en production.

---

## 7. Correction automatique par IA

### 7.1 Intégration Anthropic Claude

CEI utilise l'API Anthropic avec le modèle **Claude Sonnet** pour corriger les copies. L'approche :

```python
# Prompt de correction type
prompt = f"""
Tu es un correcteur d'examen universitaire.

SUJET : {subject.title}
BARÈME : {subject.rubric}
CONTENU DU SUJET : {subject.content}

COPIE DE L'ÉTUDIANT :
{paper.content}

Évalue cette copie. Retourne :
1. Une note sur 20
2. Une appréciation détaillée avec les points forts et faibles
3. Les critères du barème et leur évaluation
"""
```

### 7.2 Traitement des réclamations par IA

Les réclamations étudiantes sont aussi analysées par Claude :
- Lecture de la copie originale + correction initiale + argument de l'étudiant
- Claude évalue si la réclamation est fondée
- Proposition d'une note révisée avec justification
- Le professeur valide ou refuse la décision IA

### 7.3 Génération de sujets

Claude peut générer :
- Des **suggestions de sujets** basées sur le nom de l'EC et le niveau
- Un **sujet complet** avec énoncé, questions et barème de correction

### 7.4 Gestion des erreurs API

En cas d'indisponibilité de l'API Anthropic, le système log l'erreur et retourne un message explicite à l'enseignant. La correction reste possible manuellement.

---

## 8. Système de proctoring (surveillance)

### 8.1 Architecture du proctoring

Le système de surveillance combine deux technologies :

```
Côté Étudiant (Browser)          Côté Serveur
─────────────────────           ─────────────
Face.js (TensorFlow.js)  ──────► API Flask
  └─ Détection faciale           └─ camera_logs
                                 └─ exam_activity_logs
Webcam (MediaDevices API)
  └─ Flux vidéo WebRTC  ────────► LiveKit Server
                                  └─ Enregistrement S3/MinIO

Événements navigateur:
  └─ visibilitychange   ────────► tab_switches++
  └─ DevTools ouvert    ────────► ban si activé
  └─ copier/coller      ────────► log violation
```

### 8.2 LiveKit WebRTC

LiveKit est un serveur WebRTC open-source qui gère les flux vidéo en temps réel. Dans CEI :

- Chaque session d'examen = une **room LiveKit** (identifiée par `exam_id + student_id`)
- L'étudiant publie son flux webcam
- Le surveillant peut voir tous les flux en temps réel depuis le dashboard
- Les sessions peuvent être enregistrées sur MinIO/S3

Tokens JWT LiveKit générés côté serveur Flask avec `LIVEKIT_API_KEY` et `LIVEKIT_API_SECRET`.

### 8.3 Détection faciale (Face.js)

Face.js est une bibliothèque JavaScript utilisant TensorFlow.js pour la détection faciale côté client :

**Modèles embarqués** (dans `static/models/faceapi/`) :
- `tiny_face_detector` : détection rapide de visages
- `face_landmark_68` : 68 points de repère du visage
- `face_recognition` : empreinte faciale pour identifier

**Vérifications effectuées toutes les N secondes :**
1. Présence d'un visage → pas de visage = violation
2. Nombre de visages → plus d'un = suspect (tricherie potentielle)
3. Position dans le cadre → visage hors champ = avertissement

**Seuils configurables par examen :**
- `max_no_face_count` : nombre maximum d'absences autorisées avant exclusion
- `max_tab_switches` : changements d'onglet autorisés

### 8.4 Score de risque

Un score de risque est calculé pour chaque tentative :
```
risk_score = (tab_switches × 10) + (no_face_count × 5) + (warnings_count × 3)
```

Ce score aide le surveillant à prioriser quels étudiants observer.

### 8.5 Dashboard de surveillance

Le surveillant voit en temps réel :
- La liste de tous les étudiants avec leur statut (en cours, soumis, banni)
- Les flux vidéo LiveKit de chaque étudiant
- Les incidents détectés avec horodatage
- Le score de risque de chaque étudiant
- La possibilité d'exclure manuellement un étudiant

---

## 9. Frontend (SPA Vanilla JS)

### 9.1 Architecture frontend

CEI n'utilise pas de framework frontend (pas de React, Vue ou Angular). Le choix du **Vanilla JavaScript** est délibéré :
- Aucune dépendance à maintenir
- Chargement plus rapide (pas de bundle JS volumineux)
- Simplicité de débogage

L'interface est une **SPA (Single Page Application)** : une seule page HTML (`index.html`) qui affiche différentes vues selon l'action de l'utilisateur.

### 9.2 Organisation du code JS

| Fichier | Taille | Rôle |
|---------|--------|------|
| `app.js` | Principal | API calls, gestion des vues, logique UI |
| `app_maquette.js` | Secondaire | Gestion de la maquette pédagogique |

### 9.3 Gestion des états

Sans framework de state management, l'état est géré via :
- Variables globales JavaScript pour l'utilisateur connecté et le JWT
- `localStorage` pour la persistance entre rechargements
- Fonctions de rendu qui regénèrent le DOM à chaque changement d'état

### 9.4 Performance du chargement (Landing page)

Optimisations appliquées sur `landing.html` :
- **CSS critique inline** : les styles above-the-fold sont inlinés dans `<head>` pour un First Contentful Paint immédiat
- **CSS asynchrone** : `landing.css` et Font Awesome chargés avec `<link rel="preload">` + `onload`
- **Preconnect** : connexion DNS établie en avance vers le CDN Font Awesome

---

## 10. Gestion des fichiers

### 10.1 Stockage local des fichiers

Les fichiers uploadés sont stockés dans `static/uploads/` avec des noms horodatés :
```
static/uploads/
├── subject_20260115_143022_mathematiques.pdf   # Sujet d'examen
├── paper_20260201_091530_student_dupont.pdf     # Copie étudiant
└── course_20260110_102015_analyse_chap3.pdf    # Document de cours
```

Le chemin relatif est stocké en base de données. Flask sert ces fichiers via le mécanisme standard `static/`.

### 10.2 Génération de PDF

Deux types de PDF sont générés :
- **Relevés de notes** : `ReportLab` génère les PDF de transcripts avec mise en page institutionnelle
- **Export de corrections** : les résultats de correction sont mis en forme pour impression

### 10.3 Stockage S3/MinIO (enregistrements vidéo)

Les enregistrements des sessions de proctoring LiveKit sont envoyés automatiquement par LiveKit vers un bucket S3 ou MinIO. Les métadonnées sont stockées dans `camera_logs`.

---

## 11. Système d'emails

### 11.1 SMTP Gmail

Les notifications sont envoyées via Gmail SMTP (port 587, TLS STARTTLS).

### 11.2 Emails envoyés automatiquement

| Déclencheur | Destinataire | Contenu |
|-------------|--------------|---------|
| Correction publiée | Étudiant | Note obtenue + appréciation |
| Réclamation reçue | Professeur | Détail de la réclamation |
| Réponse réclamation | Étudiant | Décision + nouvelle note |
| Création de compte | Étudiant | Identifiants de connexion |

### 11.3 Configuration

Utilise un **App Password Gmail** (pas le mot de passe du compte) pour la sécurité. `dnspython` est utilisé pour la validation des adresses email.

---

## 12. Performance et optimisations

### 12.1 Métriques Lighthouse (landing page)

Après optimisations CSS (inline critical CSS + async loading) :
- **FCP** : ~3.5s → objectif <2s avec CDN
- **LCP** : ~3.5s
- **Speed Index** : ~4.7s

### 12.2 Cache Nginx

Les ressources statiques (CSS, JS, modèles ML) sont mises en cache 1 jour côté client. Le modèle Face.js (~6 MB) n'est téléchargé qu'une fois par navigateur.

### 12.3 Pagination

Toutes les listes retournées par l'API sont paginées (`ITEMS_PER_PAGE=10`) pour éviter les retours volumineux.

### 12.4 Indexes base de données

Les colonnes de jointure fréquente (`student_id`, `subject_id`, `exam_id`) bénéficient d'index implicites via les clés étrangères SQLAlchemy.

---

## 13. Modèle de données complet

```
formations (1) ──────── (N) semesters
semesters  (1) ──────── (N) ues
ues        (1) ──────── (N) ecs
ues        (1) ──────── (N) student_ue_enrollments ──── (N) users [students]
ecs        (1) ──────── (N) ec_assignments ──────────── (1) users [professors]
ecs        (1) ──────── (N) subjects ────────────────── (1) users [professors]
subjects   (1) ──────── (N) student_papers ─────────── (1) users [students]
student_papers (1) ──── (N) reclamations
student_papers (1) ──── (N) correction_history
subjects   (1) ──────── (N) online_exams
online_exams (1) ─────── (N) exam_attempts ─────────── (1) users [students]
exam_attempts (1) ────── (N) exam_activity_logs
exam_attempts (1) ────── (N) camera_logs
users (students) (1) ─── (N) grade_transcripts ─────── (1) semesters
```

---

## 14. Flux applicatifs principaux

### 14.1 Flux de correction classique (copies papier numérisées)

```
1. Admin/Prof crée un EC et un sujet (upload PDF)
2. Prof uploade les copies scannées (PDF/DOCX)
   → Extraction automatique du texte (PyPDF2/python-docx)
   → Association copie ↔ étudiant (par nom détecté ou manuel)
3. Prof déclenche la correction IA
   → Appel API Anthropic Claude Sonnet
   → Claude lit le sujet + barème + copie
   → Retourne note (0-20) + appréciation détaillée
4. Note enregistrée dans student_papers
5. Email automatique envoyé à l'étudiant
6. Étudiant peut déposer une réclamation (dans la fenêtre autorisée)
7. Réclamation analysée par IA → Prof valide/refuse
```

### 14.2 Flux d'examen en ligne surveillé

```
1. Prof crée un OnlineExam (sujet, durée, règles anti-triche)
2. Exam planifié (SCHEDULED) → passe ACTIVE à l'heure définie
3. Étudiant se connecte → POST /api/online_exams/:id/start
   → ExamAttempt créé (IN_PROGRESS)
   → Room LiveKit créée → token WebRTC généré
4. Pendant l'examen :
   → Face.js vérifie le visage toutes les N secondes
   → Violations loggées dans camera_logs
   → Changements d'onglet incrémentent tab_switches
   → Comportements suspects → warnings_count++
   → Si max_tab_switches atteint → BANNED
5. Étudiant soumet → POST /api/exam_attempts/:id/submit
   → Statut SUBMITTED
   → Réponses stockées en JSON dans exam_attempts.answers
6. Prof corrige les tentatives soumises (manuel ou IA)
7. Notes publiées → emails étudiants
```

### 14.3 Flux de génération de relevé de notes

```
1. Admin sélectionne étudiant + semestre
2. POST /api/transcripts/generate/:student_id/:semester_id
3. Le serveur :
   → Récupère toutes les UE du semestre
   → Pour chaque UE, calcule la moyenne des EC
   → Applique les coefficients
   → Calcule les crédits obtenus (UE validée si moyenne ≥ 10)
   → Calcule le GPA (0-4)
4. GradeTranscript créé en base
5. GET /api/transcripts/:id/pdf → ReportLab génère le PDF
6. PDF téléchargeable avec en-tête institutionnel
```

---

## 15. Sécurité et conformité

### 15.1 Mesures de sécurité en place

| Mesure | Implémentation |
|--------|----------------|
| HTTPS forcé | Nginx + Let's Encrypt |
| Mots de passe hachés | bcrypt (facteur adaptatif) |
| Auth stateless | JWT avec expiration |
| RBAC | Décorateurs Flask par rôle |
| Uploads sécurisés | secure_filename + validation MIME |
| SQL injection | Impossible via SQLAlchemy ORM |
| Variables d'env | Fichier .env non versionné |

### 15.2 Points d'amélioration recommandés

1. **Rate limiting** : limiter les tentatives de connexion (`flask-limiter`)
2. **Audit logs** : journaliser toutes les actions admin
3. **2FA** : authentification deux facteurs pour les admins
4. **Chiffrement fichiers** : chiffrer les copies étudiantes au repos
5. **Headers de sécurité** : `Content-Security-Policy`, `X-Frame-Options` via Nginx
6. **Rotation des JWT** : implémenter le refresh token

### 15.3 Protection des données personnelles

Les données traitées incluent : noms, emails, notes académiques — informations sensibles soumises aux réglementations nationales sur la protection des données. Recommandations :
- Définir une politique de rétention des données
- Permettre l'export/suppression des données sur demande (RGPD-like)
- Chiffrer les données sensibles au repos

---

## 16. Perspectives d'évolution

### Court terme (v2.1)
- [ ] Migrations de base de données via Alembic
- [ ] Rate limiting sur les routes d'authentification
- [ ] Tests automatisés (pytest) avec couverture >80%
- [ ] Docker + docker-compose pour le développement local
- [ ] Variables d'environnement validées au démarrage

### Moyen terme (v3.0)
- [ ] Séparation frontend/backend (React ou Vue.js)
- [ ] API GraphQL pour des requêtes plus flexibles
- [ ] Système de notifications WebSocket (résultats en temps réel)
- [ ] Application mobile (PWA ou React Native)
- [ ] Intégration Moodle LMS

### Long terme
- [ ] Multi-tenancy (plusieurs universités sur la même instance)
- [ ] Analyse prédictive des résultats étudiants
- [ ] Détection de plagiat entre copies
- [ ] Modèle IA fine-tuné sur les matières africaines

---

*Document généré le 8 avril 2026. Version 2.0.0 de la plateforme CEI.*
