# 📚 DOCUMENTATION COMPLÈTE - SYSTÈME DE NOTATION

## 🎯 VUE D'ENSEMBLE

Système de correction automatique de copies d'examen avec :
- ✅ Gestion complète de la maquette pédagogique
- ✅ Détection de doublons (hash SHA256)
- ✅ Extraction automatique du nom étudiant
- ✅ Envoi d'emails automatiques
- ✅ Export PDF des copies corrigées
- ✅ Correction par IA (Claude)
- ✅ Gestion des réclamations
- ✅ Statistiques avancées

---

## 🏗️ ARCHITECTURE

### Base de données PostgreSQL
```
formations → semesters → ues → ecs → subjects → student_papers
                                           ↓
                                        users
```

### Technologies
- **Backend**: Flask + SQLAlchemy + PostgreSQL
- **Frontend**: JavaScript Vanilla
- **IA**: Anthropic Claude API
- **Emails**: SMTP (Gmail compatible)
- **PDF**: ReportLab

---

## 🚀 INSTALLATION

### 1. Prérequis
```bash
Python 3.10+
PostgreSQL 14+
```

### 2. Installation
```bash
cd /home/serge/exam-grading-system
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configuration
```bash
# Copier .env.example vers .env
cp .env.example .env

# Éditer .env
nano .env
```

**Variables essentielles:**
```env
# Base de données
DATABASE_URL=postgresql://exam_user:passer@localhost:5432/exam_grader_db

# API Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Emails (Gmail)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=votre.email@gmail.com
SMTP_PASSWORD=mot_de_passe_application
SMTP_FROM_EMAIL=noreply@votresite.com
SMTP_FROM_NAME=Système de Notation
```

### 4. Initialisation base de données
```bash
# Créer la base
sudo -u postgres psql
CREATE DATABASE exam_grader_db;
CREATE USER exam_user WITH PASSWORD 'passer';
GRANT ALL PRIVILEGES ON DATABASE exam_grader_db TO exam_user;
\q

# Migrer
python migrate_database.py

# Peupler avec la maquette
python populate_maquette.py
```

### 5. Créer un admin
```bash
python create_admin.py
```

### 6. Lancer le serveur
```bash
./start_system.sh
```

---

## 📖 UTILISATION

### 🔐 Comptes de test

**Admin:**
- Email: admin@test.com
- Password: Admin123!

**Professeur:**
- Email: nasry.ahamadi@esp.sn
- Password: Prof123!

---

## 🎓 GESTION DE LA MAQUETTE

### Pour les Admins

#### 1. Créer une Formation
```
Dashboard → Maquette → ➕ Créer Formation
- Code: MASTER_TR
- Nom: Master Télécommunications
- Niveau: Master 1
```

#### 2. Ajouter des Semestres
```
Cliquer sur formation → ➕ Semestre
- Numéro: 1
- Nom: Semestre 1
- Crédits: 30
```

#### 3. Ajouter des UEs
```
Cliquer sur semestre → ➕ UE
- Code: UEM111
- Nom: Informatique générale
- Crédits: 6
```

#### 4. Ajouter des ECs
```
Cliquer sur UE → ➕ EC
- Code: M1111
- Nom: Bases de données
- CM: 10h, TD: 10h, TP: 20h
- VHT: 40h
- Coefficient: 1
```

---

## 📝 CRÉATION DE SUJETS

### Pour les Professeurs
```
Dashboard → ➕ Créer Sujet
1. Sélectionner un EC (obligatoire)
2. Titre du sujet
3. Uploader PDF/DOCX/TXT
4. Créer
```

**Le système génère automatiquement:**
- ✅ Barème de notation
- ✅ Critères d'évaluation

---

## ✍️ CORRECTION DE COPIES

### Correction Unique
```
Dashboard → ✍️ Corriger
1. Sélectionner sujet
2. Nom étudiant
3. Uploader copie
4. Corriger
```

### Correction en Lot
```
Dashboard → ✍️ Corriger → Correction en Lot
1. Sélectionner sujet
2. Uploader PLUSIEURS fichiers (ou dossier)
3. Corriger Toutes les Copies
```

**Fonctionnalités automatiques:**
- ✅ Détection de doublons (hash)
- ✅ Extraction du nom étudiant
- ✅ Email automatique à l'étudiant
- ✅ Note sur /20

---

## 📧 SYSTÈME D'EMAILS

### Configuration Gmail

1. **Activer validation 2 étapes**
   - Google Account → Sécurité
   - Validation en 2 étapes

2. **Créer mot de passe d'application**
   - Mots de passe d'application
   - Sélectionner "Autre"
   - Copier le mot de passe

3. **Configurer .env**
```env
SMTP_USERNAME=votre.email@gmail.com
SMTP_PASSWORD=mdp_application_16_caracteres
```

### Emails automatiques envoyés

1. **Création de compte**
   - À : Nouvel utilisateur
   - Contenu : Email + mot de passe temporaire

2. **Copie corrigée**
   - À : Étudiant
   - Contenu : Note + lien vers copie

---

## 📄 EXPORT PDF

### Pour les Étudiants
```
Dashboard → Mes Notes → 📄 Exporter PDF
```

Le PDF contient:
- Informations étudiant
- Sujet
- Note
- Correction détaillée
- Pied de page avec date

---

## 🔍 DÉTECTION DE DOUBLONS

Le système utilise **SHA256** pour détecter les copies identiques.

**Comportement:**
```
1. Upload copie → Calcul hash
2. Vérification base de données
3. Si hash existe → REJET avec message
4. Si nouveau → Correction
```

**Message de rejet:**
```json
{
  "error": "Cette copie a déjà été corrigée",
  "existing_paper_id": 42,
  "student_name": "Jean Dupont",
  "score": 15.5
}
```

---

## 📊 STATISTIQUES
```
Dashboard → 📊 Résultats
1. Sélectionner sujet
2. Voir statistiques:
   - Moyenne
   - Médiane
   - Écart-type
   - Taux de réussite
   - Distribution des notes
```

---

## ⚠️ RÉCLAMATIONS

### Pour les Étudiants
```
Dashboard → Mes Notes → ⚠️ Réclamer
```

### Pour les Professeurs
```
Dashboard → ⚠️ Réclamations
→ Accepter/Rejeter
→ Modifier note si accepté
```

---

## 🧪 TESTS

### Lancer les tests automatisés
```bash
python test_system.py
```

**Tests inclus:**
- ✅ Création maquette
- ✅ Création sujet
- ✅ Upload copie
- ✅ Détection doublon
- ✅ Export PDF
- ✅ Emails

---

## 🐛 TROUBLESHOOTING

### Erreur: "column does not exist"
```bash
python migrate_database.py
```

### Emails non envoyés
```bash
# Vérifier .env
echo $SMTP_USERNAME
echo $SMTP_PASSWORD

# Tester SMTP
python -c "from utils import send_email; print(send_email('test@test.com', 'Test', '<h1>Test</h1>'))"
```

### Doublons non détectés
```bash
# Vérifier colonne file_hash
sudo -u postgres psql -d exam_grader_db -c "\d student_papers"
```

---

## 📞 SUPPORT

Pour toute question ou problème, contactez :
- Email: support@votresite.com
- Documentation: /docs

---

## 🔐 SÉCURITÉ

### Bonnes pratiques

1. **Mots de passe**
   - Minimum 8 caractères
   - Changer régulièrement

2. **Base de données**
   - Sauvegardes quotidiennes
   - Accès limité

3. **API Keys**
   - Jamais dans le code
   - Toujours dans .env

4. **HTTPS**
   - Obligatoire en production
   - Certificat SSL valide

---

## 📈 ÉVOLUTIONS FUTURES

- [ ] OCR avancé (reconnaissance écriture manuscrite)
- [ ] Correction collaborative (plusieurs correcteurs)
- [ ] Intégration LMS (Moodle, Canvas)
- [ ] API REST publique
- [ ] Application mobile
- [ ] Analyse prédictive (ML)

---

**Version:** 2.0 - Novembre 2025
**Auteur:** Serge & Claude
**License:** Propriétaire
