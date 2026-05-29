"""
CEI — Documentation API Swagger / OpenAPI 3.0
Accessible à /api/docs (Swagger UI) et /api/docs/openapi.json (spec brute)
"""
from flask import Blueprint, jsonify, render_template_string

swagger_bp = Blueprint('swagger', __name__)

# ── Spec OpenAPI 3.0 ──────────────────────────────────────────────────────────

OPENAPI_SPEC = {
    "openapi": "3.0.3",
    "info": {
        "title": "CEI — Centre d'Examen Intelligent API",
        "version": "2.1.0",
        "description": (
            "API REST complète de la plateforme CEI (Centre d'Examen Intelligent) "
            "de l'Université Numérique Cheikh Hamidou Kane (UNCHK).\n\n"
            "## Authentification\n"
            "Toutes les routes protégées nécessitent un **JWT Bearer token**.\n\n"
            "1. Appelez `POST /api/auth/login` avec vos identifiants.\n"
            "2. Récupérez le `access_token` dans la réponse.\n"
            "3. Ajoutez l'en-tête `Authorization: Bearer <token>` à chaque requête.\n\n"
            "## Rôles\n"
            "| Rôle | Description |\n"
            "|---|---|\n"
            "| `admin` | Accès complet |\n"
            "| `professor` | Gestion sujets, examens, corrections |\n"
            "| `surveillant` | Dashboard surveillance uniquement |\n"
            "| `student` | Passage examens, consultation notes |\n\n"
            "## Chaîne IA\n"
            "Anthropic Claude → Google Gemini → DeepSeek → Ollama (local)"
        ),
        "contact": {
            "name": "UNCHK — VisioPLUS",
            "email": "visioplus@unchk.edu.sn",
            "url": "https://cei.unchk.sn"
        },
        "license": {"name": "MIT", "url": "https://opensource.org/licenses/MIT"}
    },
    "servers": [
        {"url": "https://cei.unchk.sn", "description": "Production UNCHK"},
        {"url": "http://localhost:5000",  "description": "Développement local"}
    ],
    "tags": [
        {"name": "Authentification",    "description": "Connexion, profil, gestion de session"},
        {"name": "Administration",      "description": "Gestion des utilisateurs et du tableau de bord admin"},
        {"name": "Académique",          "description": "Formations, semestres, UE, EC et inscriptions étudiants"},
        {"name": "Sujets",              "description": "Création, upload et gestion des sujets d'examen"},
        {"name": "Copies",              "description": "Upload et correction des copies étudiants par IA"},
        {"name": "Examens en ligne",    "description": "Création, activation et gestion des examens en ligne"},
        {"name": "Proctoring",          "description": "Surveillance vidéo, risques, avertissements et exclusions"},
        {"name": "Agent autonome",      "description": "API interne du service de surveillance autonome par IA"},
        {"name": "Intelligence Artificielle", "description": "Génération de sujets et suggestions d'examens par IA"},
        {"name": "Réclamations",        "description": "Dépôt et traitement des réclamations de notes"},
        {"name": "Relevés de notes",    "description": "Génération et consultation des relevés de notes PDF"},
    ],
    "components": {
        "securitySchemes": {
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "Token JWT obtenu via POST /api/auth/login"
            },
            "AgentSecret": {
                "type": "apiKey",
                "in": "header",
                "name": "X-Agent-Secret",
                "description": "Clé secrète de l'agent autonome (AGENT_SECRET_KEY dans .env)"
            }
        },
        "schemas": {
            "Error": {
                "type": "object",
                "properties": {
                    "error": {"type": "string", "example": "Message d'erreur détaillé"}
                }
            },
            "Success": {
                "type": "object",
                "properties": {
                    "success": {"type": "boolean", "example": True},
                    "message": {"type": "string", "example": "Opération réussie"}
                }
            },
            "User": {
                "type": "object",
                "properties": {
                    "id":        {"type": "integer", "example": 1},
                    "email":     {"type": "string",  "example": "prof@unchk.edu.sn"},
                    "full_name": {"type": "string",  "example": "Professeur Diallo"},
                    "role":      {"type": "string",  "enum": ["admin","professor","surveillant","student"]},
                    "created_at":{"type": "string",  "format": "date-time"}
                }
            },
            "Subject": {
                "type": "object",
                "properties": {
                    "id":         {"type": "integer"},
                    "title":      {"type": "string",  "example": "Examen de Réseaux Informatiques"},
                    "content":    {"type": "string",  "description": "Texte complet du sujet"},
                    "rubric":     {"type": "string",  "description": "Barème de notation"},
                    "ec_id":      {"type": "integer", "description": "Identifiant de l'EC associé"},
                    "created_at": {"type": "string",  "format": "date-time"},
                    "papers_count": {"type": "integer"}
                }
            },
            "OnlineExam": {
                "type": "object",
                "properties": {
                    "id":               {"type": "integer"},
                    "title":            {"type": "string",  "example": "Examen Final L3 Réseaux"},
                    "subject_id":       {"type": "integer"},
                    "duration_minutes": {"type": "integer", "example": 90},
                    "access_code":      {"type": "string",  "example": "EXAM2026"},
                    "status":           {"type": "string",  "enum": ["draft","active","closed","archived"]},
                    "max_attempts":     {"type": "integer", "example": 1},
                    "starts_at":        {"type": "string",  "format": "date-time"},
                    "ends_at":          {"type": "string",  "format": "date-time"},
                    "created_at":       {"type": "string",  "format": "date-time"}
                }
            },
            "ExamAttempt": {
                "type": "object",
                "properties": {
                    "id":             {"type": "integer"},
                    "exam_id":        {"type": "integer"},
                    "student_id":     {"type": "integer"},
                    "student_name":   {"type": "string"},
                    "status":         {"type": "string", "enum": ["in_progress","submitted","auto_submitted","graded","banned"]},
                    "score":          {"type": "number", "format": "float", "example": 15.5},
                    "risk_score":     {"type": "integer", "minimum": 0, "maximum": 100},
                    "tab_switches":   {"type": "integer"},
                    "warnings_count": {"type": "integer"},
                    "started_at":     {"type": "string", "format": "date-time"},
                    "submitted_at":   {"type": "string", "format": "date-time"}
                }
            },
            "Formation": {
                "type": "object",
                "properties": {
                    "id":          {"type": "integer"},
                    "name":        {"type": "string", "example": "Licence Informatique"},
                    "code":        {"type": "string", "example": "LI"},
                    "description": {"type": "string"},
                    "duration_years": {"type": "integer", "example": 3}
                }
            },
            "AgentAlert": {
                "type": "object",
                "properties": {
                    "exam_id":      {"type": "integer"},
                    "exam_title":   {"type": "string"},
                    "attempt_id":   {"type": "integer"},
                    "student_name": {"type": "string"},
                    "risk_score":   {"type": "integer", "minimum": 0, "maximum": 100},
                    "level":        {"type": "string", "enum": ["ALERTE", "URGENT"]},
                    "no_face":      {"type": "integer"},
                    "multi_face":   {"type": "integer"},
                    "tab_switches": {"type": "integer"},
                    "ai_note":      {"type": "string", "description": "Analyse comportementale par IA"},
                    "timestamp":    {"type": "string", "format": "date-time"},
                    "read":         {"type": "boolean"}
                }
            }
        },
        "responses": {
            "Unauthorized": {
                "description": "Token JWT manquant ou invalide",
                "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}}
            },
            "Forbidden": {
                "description": "Droits insuffisants pour cette action",
                "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}}
            },
            "NotFound": {
                "description": "Ressource introuvable",
                "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}}
            }
        }
    },
    "security": [{"BearerAuth": []}],
    "paths": {

        # ── AUTHENTIFICATION ──────────────────────────────────────────────────

        "/api/auth/login": {
            "post": {
                "tags": ["Authentification"],
                "summary": "Connexion — obtenir un JWT",
                "security": [],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["email", "password"],
                        "properties": {
                            "email":    {"type": "string", "example": "admin@unchk.edu.sn"},
                            "password": {"type": "string", "example": "VotreMotDePasse"}
                        }
                    }}}
                },
                "responses": {
                    "200": {
                        "description": "Connexion réussie",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "access_token": {"type": "string", "description": "JWT à utiliser dans Authorization: Bearer"},
                                "user": {"$ref": "#/components/schemas/User"}
                            }
                        }}}
                    },
                    "401": {"description": "Identifiants incorrects"}
                }
            }
        },
        "/api/auth/register": {
            "post": {
                "tags": ["Authentification"],
                "summary": "Créer un compte (admin requis en production)",
                "security": [],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["email", "password", "full_name", "role"],
                        "properties": {
                            "email":     {"type": "string"},
                            "password":  {"type": "string"},
                            "full_name": {"type": "string"},
                            "role":      {"type": "string", "enum": ["professor","surveillant","student"]}
                        }
                    }}}
                },
                "responses": {
                    "201": {"description": "Compte créé"},
                    "409": {"description": "Email déjà utilisé"}
                }
            }
        },
        "/api/auth/me": {
            "get": {
                "tags": ["Authentification"],
                "summary": "Profil de l'utilisateur connecté",
                "responses": {
                    "200": {"description": "Profil", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/User"}}}},
                    "401": {"$ref": "#/components/responses/Unauthorized"}
                }
            }
        },
        "/api/profile": {
            "put": {
                "tags": ["Authentification"],
                "summary": "Modifier son profil (nom, email)",
                "requestBody": {
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "properties": {
                            "full_name": {"type": "string"},
                            "email":     {"type": "string"}
                        }
                    }}}
                },
                "responses": {
                    "200": {"description": "Profil mis à jour"},
                    "401": {"$ref": "#/components/responses/Unauthorized"}
                }
            }
        },
        "/api/profile/password": {
            "put": {
                "tags": ["Authentification"],
                "summary": "Changer son mot de passe",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["current_password", "new_password"],
                        "properties": {
                            "current_password": {"type": "string"},
                            "new_password":     {"type": "string", "minLength": 6}
                        }
                    }}}
                },
                "responses": {
                    "200": {"description": "Mot de passe modifié"},
                    "400": {"description": "Mot de passe actuel incorrect"}
                }
            }
        },

        # ── ADMINISTRATION ────────────────────────────────────────────────────

        "/api/admin/dashboard": {
            "get": {
                "tags": ["Administration"],
                "summary": "Tableau de bord administrateur",
                "description": "Statistiques globales : utilisateurs, sujets, copies corrigées, examens actifs.",
                "responses": {
                    "200": {
                        "description": "Statistiques",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "total_users":    {"type": "integer"},
                                "total_subjects": {"type": "integer"},
                                "total_papers":   {"type": "integer"},
                                "active_exams":   {"type": "integer"}
                            }
                        }}}
                    },
                    "403": {"$ref": "#/components/responses/Forbidden"}
                }
            }
        },
        "/api/admin/users": {
            "get": {
                "tags": ["Administration"],
                "summary": "Liste de tous les utilisateurs",
                "parameters": [
                    {"name": "role",  "in": "query", "schema": {"type": "string", "enum": ["admin","professor","surveillant","student"]}},
                    {"name": "page",  "in": "query", "schema": {"type": "integer", "default": 1}},
                    {"name": "search","in": "query", "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Liste paginée des utilisateurs"},
                    "403": {"$ref": "#/components/responses/Forbidden"}
                }
            },
            "post": {
                "tags": ["Administration"],
                "summary": "Créer un utilisateur (admin)",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["email", "full_name", "role", "password"],
                        "properties": {
                            "email":     {"type": "string", "example": "etudiant@unchk.edu.sn"},
                            "full_name": {"type": "string", "example": "Fatou Seck"},
                            "role":      {"type": "string", "enum": ["professor","surveillant","student"]},
                            "password":  {"type": "string"},
                            "send_email":{"type": "boolean", "default": True, "description": "Envoyer email de bienvenue"}
                        }
                    }}}
                },
                "responses": {
                    "201": {"description": "Utilisateur créé"},
                    "409": {"description": "Email déjà utilisé"}
                }
            }
        },
        "/api/admin/users/{user_id}": {
            "put": {
                "tags": ["Administration"],
                "summary": "Modifier un utilisateur",
                "parameters": [{"name": "user_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "requestBody": {
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "properties": {
                            "full_name": {"type": "string"},
                            "email":     {"type": "string"},
                            "role":      {"type": "string"},
                            "password":  {"type": "string"}
                        }
                    }}}
                },
                "responses": {
                    "200": {"description": "Utilisateur mis à jour"},
                    "404": {"$ref": "#/components/responses/NotFound"}
                }
            },
            "delete": {
                "tags": ["Administration"],
                "summary": "Supprimer un utilisateur",
                "parameters": [{"name": "user_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {"description": "Utilisateur supprimé"},
                    "404": {"$ref": "#/components/responses/NotFound"}
                }
            }
        },

        # ── ACADÉMIQUE ────────────────────────────────────────────────────────

        "/api/formations": {
            "get": {
                "tags": ["Académique"],
                "summary": "Liste des formations",
                "responses": {
                    "200": {
                        "description": "Formations disponibles",
                        "content": {"application/json": {"schema": {
                            "type": "array", "items": {"$ref": "#/components/schemas/Formation"}
                        }}}
                    }
                }
            }
        },
        "/api/formations/{formation_id}/semesters": {
            "get": {
                "tags": ["Académique"],
                "summary": "Semestres d'une formation",
                "parameters": [{"name": "formation_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Liste des semestres"}}
            }
        },
        "/api/semesters/{semester_id}/ues": {
            "get": {
                "tags": ["Académique"],
                "summary": "UE d'un semestre",
                "parameters": [{"name": "semester_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Liste des UE"}}
            }
        },
        "/api/ues/{ue_id}/ecs": {
            "get": {
                "tags": ["Académique"],
                "summary": "Éléments constitutifs (EC) d'une UE",
                "parameters": [{"name": "ue_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Liste des EC"}}
            }
        },
        "/api/admin/formations": {
            "post": {
                "tags": ["Académique"],
                "summary": "Créer une formation (admin)",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["name"],
                        "properties": {
                            "name":           {"type": "string", "example": "Licence Informatique"},
                            "code":           {"type": "string", "example": "LI3"},
                            "description":    {"type": "string"},
                            "duration_years": {"type": "integer", "example": 3}
                        }
                    }}}
                },
                "responses": {"201": {"description": "Formation créée"}}
            }
        },
        "/api/admin/ues": {
            "post": {
                "tags": ["Académique"],
                "summary": "Créer une Unité d'Enseignement (admin)",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["name", "semester_id"],
                        "properties": {
                            "name":        {"type": "string", "example": "Réseaux et Télécommunications"},
                            "code":        {"type": "string", "example": "RT301"},
                            "semester_id": {"type": "integer"},
                            "credits":     {"type": "number", "example": 6},
                            "coefficient": {"type": "number", "example": 2}
                        }
                    }}}
                },
                "responses": {"201": {"description": "UE créée"}}
            }
        },
        "/api/admin/ecs": {
            "post": {
                "tags": ["Académique"],
                "summary": "Créer un Élément Constitutif (admin)",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["name", "ue_id"],
                        "properties": {
                            "name":        {"type": "string", "example": "Protocoles TCP/IP"},
                            "code":        {"type": "string", "example": "RT301-01"},
                            "ue_id":       {"type": "integer"},
                            "coefficient": {"type": "number", "example": 1}
                        }
                    }}}
                },
                "responses": {"201": {"description": "EC créé"}}
            }
        },
        "/api/admin/student_enrollments": {
            "post": {
                "tags": ["Académique"],
                "summary": "Inscrire un étudiant à une UE/EC",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["student_id"],
                        "properties": {
                            "student_id": {"type": "integer"},
                            "ue_id":      {"type": "integer"},
                            "ec_id":      {"type": "integer"}
                        }
                    }}}
                },
                "responses": {
                    "201": {"description": "Inscription effectuée"},
                    "409": {"description": "Déjà inscrit"}
                }
            }
        },

        # ── SUJETS ────────────────────────────────────────────────────────────

        "/api/subjects": {
            "get": {
                "tags": ["Sujets"],
                "summary": "Liste des sujets (filtrés par rôle)",
                "parameters": [
                    {"name": "ec_id",   "in": "query", "schema": {"type": "integer"}},
                    {"name": "page",    "in": "query", "schema": {"type": "integer"}},
                    {"name": "search",  "in": "query", "schema": {"type": "string"}}
                ],
                "responses": {"200": {"description": "Liste des sujets"}}
            }
        },
        "/api/subjects/{subject_id}": {
            "get": {
                "tags": ["Sujets"],
                "summary": "Détail d'un sujet",
                "parameters": [{"name": "subject_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {"description": "Sujet", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Subject"}}}},
                    "404": {"$ref": "#/components/responses/NotFound"}
                }
            },
            "delete": {
                "tags": ["Sujets"],
                "summary": "Supprimer un sujet (admin/prof)",
                "parameters": [{"name": "subject_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {"description": "Sujet supprimé"},
                    "403": {"$ref": "#/components/responses/Forbidden"}
                }
            }
        },
        "/api/subjects/upload": {
            "post": {
                "tags": ["Sujets"],
                "summary": "Uploader et créer un sujet depuis un fichier PDF/DOCX",
                "description": "Envoie un fichier PDF ou DOCX. L'IA génère automatiquement le barème.",
                "requestBody": {
                    "required": True,
                    "content": {"multipart/form-data": {"schema": {
                        "type": "object",
                        "required": ["file"],
                        "properties": {
                            "file":  {"type": "string", "format": "binary", "description": "Fichier sujet (PDF, DOCX, TXT)"},
                            "ec_id": {"type": "integer", "description": "EC auquel rattacher le sujet"},
                            "title": {"type": "string",  "description": "Titre (optionnel, extrait du fichier si absent)"}
                        }
                    }}}
                },
                "responses": {
                    "201": {"description": "Sujet créé avec barème généré par IA"},
                    "400": {"description": "Fichier invalide ou contenu illisible"}
                }
            }
        },

        # ── COPIES ────────────────────────────────────────────────────────────

        "/api/papers/upload": {
            "post": {
                "tags": ["Copies"],
                "summary": "Uploader et corriger une copie par IA",
                "description": (
                    "Upload d'une copie étudiant (PDF/DOCX). L'IA détecte automatiquement "
                    "le domaine disciplinaire et corrige la copie selon le barème du sujet."
                ),
                "requestBody": {
                    "required": True,
                    "content": {"multipart/form-data": {"schema": {
                        "type": "object",
                        "required": ["file", "subject_id"],
                        "properties": {
                            "file":         {"type": "string", "format": "binary"},
                            "subject_id":   {"type": "integer"},
                            "student_id":   {"type": "integer", "description": "Optionnel si nom extractible du fichier"},
                            "student_name": {"type": "string",  "description": "Nom si student_id absent"}
                        }
                    }}}
                },
                "responses": {
                    "200": {
                        "description": "Copie corrigée",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "score":    {"type": "number", "example": 14.5},
                                "feedback": {"type": "string", "description": "Correction détaillée par IA"},
                                "paper_id": {"type": "integer"}
                            }
                        }}}
                    }
                }
            }
        },
        "/api/papers/upload-batch": {
            "post": {
                "tags": ["Copies"],
                "summary": "Upload en masse de copies (plusieurs fichiers)",
                "description": "Corrige plusieurs copies en une seule requête. L'IA détecte le nom de l'étudiant dans le contenu du fichier.",
                "requestBody": {
                    "required": True,
                    "content": {"multipart/form-data": {"schema": {
                        "type": "object",
                        "required": ["files", "subject_id"],
                        "properties": {
                            "files":      {"type": "array", "items": {"type": "string", "format": "binary"}},
                            "subject_id": {"type": "integer"}
                        }
                    }}}
                },
                "responses": {
                    "200": {
                        "description": "Résultats par fichier",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "results":      {"type": "array", "items": {"type": "object"}},
                                "errors":       {"type": "array", "items": {"type": "string"}},
                                "success_count":{"type": "integer"},
                                "error_count":  {"type": "integer"}
                            }
                        }}}
                    }
                }
            }
        },
        "/api/papers/subject/{subject_id}": {
            "get": {
                "tags": ["Copies"],
                "summary": "Copies corrigées pour un sujet",
                "parameters": [{"name": "subject_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Liste des copies avec scores"}}
            }
        },
        "/api/papers/detail/{paper_id}": {
            "get": {
                "tags": ["Copies"],
                "summary": "Détail d'une copie corrigée",
                "parameters": [{"name": "paper_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {"description": "Copie avec feedback complet"},
                    "404": {"$ref": "#/components/responses/NotFound"}
                }
            }
        },
        "/api/statistics/{subject_id}": {
            "get": {
                "tags": ["Copies"],
                "summary": "Statistiques d'un sujet (moyenne, médiane, distribution)",
                "parameters": [{"name": "subject_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {
                        "description": "Statistiques",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "mean":    {"type": "number"},
                                "median":  {"type": "number"},
                                "min":     {"type": "number"},
                                "max":     {"type": "number"},
                                "std_dev": {"type": "number"},
                                "distribution": {"type": "object"}
                            }
                        }}}
                    }
                }
            }
        },

        # ── EXAMENS EN LIGNE ──────────────────────────────────────────────────

        "/api/online_exams": {
            "get": {
                "tags": ["Examens en ligne"],
                "summary": "Liste des examens en ligne",
                "parameters": [
                    {"name": "status", "in": "query", "schema": {"type": "string", "enum": ["draft","active","closed","archived"]}},
                    {"name": "page",   "in": "query", "schema": {"type": "integer"}}
                ],
                "responses": {
                    "200": {
                        "description": "Examens",
                        "content": {"application/json": {"schema": {
                            "type": "array", "items": {"$ref": "#/components/schemas/OnlineExam"}
                        }}}
                    }
                }
            },
            "post": {
                "tags": ["Examens en ligne"],
                "summary": "Créer un examen en ligne",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["title", "subject_id", "duration_minutes"],
                        "properties": {
                            "title":            {"type": "string",  "example": "Examen Final Réseaux L3"},
                            "subject_id":       {"type": "integer"},
                            "duration_minutes": {"type": "integer", "example": 90},
                            "access_code":      {"type": "string",  "example": "EXAM2026"},
                            "max_attempts":     {"type": "integer", "default": 1},
                            "starts_at":        {"type": "string",  "format": "date-time"},
                            "ends_at":          {"type": "string",  "format": "date-time"},
                            "instructions":     {"type": "string"}
                        }
                    }}}
                },
                "responses": {
                    "201": {"description": "Examen créé", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/OnlineExam"}}}},
                    "400": {"description": "Données invalides"}
                }
            }
        },
        "/api/online_exams/{exam_id}/details": {
            "get": {
                "tags": ["Examens en ligne"],
                "summary": "Détail complet d'un examen",
                "parameters": [{"name": "exam_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {"description": "Examen avec statistiques et tentatives"},
                    "404": {"$ref": "#/components/responses/NotFound"}
                }
            }
        },
        "/api/online_exams/{exam_id}/activate": {
            "post": {
                "tags": ["Examens en ligne"],
                "summary": "Activer un examen (le rendre accessible aux étudiants)",
                "parameters": [{"name": "exam_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {"description": "Examen activé"},
                    "400": {"description": "Examen déjà actif ou fermé"}
                }
            }
        },
        "/api/online_exams/{exam_id}/close": {
            "post": {
                "tags": ["Examens en ligne"],
                "summary": "Clôturer un examen",
                "parameters": [{"name": "exam_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Examen clôturé, toutes les copies soumises"}}
            }
        },
        "/api/online_exams/{exam_id}/start": {
            "post": {
                "tags": ["Examens en ligne"],
                "summary": "Démarrer une tentative d'examen (étudiant)",
                "parameters": [{"name": "exam_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["access_code"],
                        "properties": {"access_code": {"type": "string", "example": "EXAM2026"}}
                    }}}
                },
                "responses": {
                    "200": {"description": "Tentative démarrée", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ExamAttempt"}}}},
                    "400": {"description": "Code d'accès incorrect ou examen non actif"},
                    "409": {"description": "Tentative déjà en cours"}
                }
            }
        },
        "/api/exam_attempts/{attempt_id}/save": {
            "post": {
                "tags": ["Examens en ligne"],
                "summary": "Sauvegarder une réponse en cours de rédaction",
                "parameters": [{"name": "attempt_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "requestBody": {
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "properties": {"content": {"type": "string", "description": "Réponse partielle de l'étudiant"}}
                    }}}
                },
                "responses": {"200": {"description": "Sauvegardé"}}
            }
        },
        "/api/exam_attempts/{attempt_id}/submit": {
            "post": {
                "tags": ["Examens en ligne"],
                "summary": "Soumettre définitivement la copie",
                "parameters": [{"name": "attempt_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "requestBody": {
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "properties": {"content": {"type": "string", "description": "Réponse finale"}}
                    }}}
                },
                "responses": {
                    "200": {"description": "Copie soumise"},
                    "400": {"description": "Tentative déjà soumise"}
                }
            }
        },
        "/api/exam_attempts/{attempt_id}/correct": {
            "post": {
                "tags": ["Examens en ligne"],
                "summary": "Corriger une copie par IA (professeur/admin)",
                "description": "L'IA détecte le domaine, applique le barème et retourne une note sur 20.",
                "parameters": [{"name": "attempt_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {
                        "description": "Copie corrigée",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "score":    {"type": "number", "example": 16.5},
                                "feedback": {"type": "string"}
                            }
                        }}}
                    }
                }
            }
        },
        "/api/online_exams/{exam_id}/attempts": {
            "get": {
                "tags": ["Examens en ligne"],
                "summary": "Liste des tentatives d'un examen",
                "parameters": [{"name": "exam_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {
                        "description": "Tentatives",
                        "content": {"application/json": {"schema": {
                            "type": "array", "items": {"$ref": "#/components/schemas/ExamAttempt"}
                        }}}
                    }
                }
            }
        },

        # ── PROCTORING ────────────────────────────────────────────────────────

        "/api/online_exams/{exam_id}/active_proctoring": {
            "get": {
                "tags": ["Proctoring"],
                "summary": "Vue temps réel — tous les étudiants actifs (dashboard surveillant)",
                "parameters": [{"name": "exam_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {
                        "description": "Étudiants actifs avec scores de risque",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "attempts": {
                                    "type": "array",
                                    "items": {"$ref": "#/components/schemas/ExamAttempt"}
                                },
                                "exam_title": {"type": "string"},
                                "active_count": {"type": "integer"}
                            }
                        }}}
                    },
                    "403": {"$ref": "#/components/responses/Forbidden"}
                }
            }
        },
        "/api/exam_attempts/{attempt_id}/proctoring_event": {
            "post": {
                "tags": ["Proctoring"],
                "summary": "Enregistrer un événement de surveillance (client étudiant)",
                "description": "Appelé automatiquement par face_detector.js. Incrémente le score de risque.",
                "parameters": [{"name": "attempt_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["event_type"],
                        "properties": {
                            "event_type": {
                                "type": "string",
                                "enum": ["no_face_detected", "multiple_faces", "tab_switch", "camera_disabled", "fullscreen_exit"],
                                "description": "no_face_detected +10pts, multiple_faces +20pts, tab_switch +15pts"
                            }
                        }
                    }}}
                },
                "responses": {
                    "200": {
                        "description": "Événement enregistré",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "risk_score": {"type": "integer"},
                                "banned":     {"type": "boolean"}
                            }
                        }}}
                    }
                }
            }
        },
        "/api/exam_attempts/{attempt_id}/risk_status": {
            "get": {
                "tags": ["Proctoring"],
                "summary": "Score de risque et statut de bannissement d'un étudiant",
                "parameters": [{"name": "attempt_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {
                        "description": "Statut de risque",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "risk_score":     {"type": "integer", "minimum": 0, "maximum": 100},
                                "warnings_count": {"type": "integer"},
                                "tab_switches":   {"type": "integer"},
                                "banned":         {"type": "boolean"},
                                "ban_reason":     {"type": "string"}
                            }
                        }}}
                    }
                }
            }
        },
        "/api/exam_attempts/{attempt_id}/send_warning": {
            "post": {
                "tags": ["Proctoring"],
                "summary": "Envoyer un avertissement à un étudiant",
                "parameters": [{"name": "attempt_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "properties": {
                            "message": {"type": "string", "example": "Votre visage n'est plus visible. Repositionnez-vous."},
                            "type":    {"type": "string", "enum": ["warning","message","private_call"]}
                        }
                    }}}
                },
                "responses": {"200": {"description": "Avertissement envoyé"}}
            }
        },
        "/api/exam_attempts/{attempt_id}/proctor_ban": {
            "post": {
                "tags": ["Proctoring"],
                "summary": "Exclure définitivement un étudiant de l'examen",
                "parameters": [{"name": "attempt_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["reason"],
                        "properties": {
                            "reason": {"type": "string", "example": "Fraude avérée — présence d'une tierce personne"}
                        }
                    }}}
                },
                "responses": {"200": {"description": "Étudiant exclu"}}
            }
        },
        "/api/exam_attempts/{attempt_id}/livekit_token": {
            "get": {
                "tags": ["Proctoring"],
                "summary": "Token LiveKit pour la session vidéo étudiant",
                "description": "Retourne un JWT LiveKit permettant à l'étudiant de publier son flux vidéo.",
                "parameters": [{"name": "attempt_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {
                        "description": "Token LiveKit",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "token":     {"type": "string"},
                                "room_name": {"type": "string"},
                                "livekit_url": {"type": "string"}
                            }
                        }}}
                    }
                }
            }
        },
        "/api/online_exams/{exam_id}/proctors": {
            "get": {
                "tags": ["Proctoring"],
                "summary": "Liste des surveillants affectés à un examen",
                "parameters": [{"name": "exam_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Surveillants affectés"}}
            },
            "post": {
                "tags": ["Proctoring"],
                "summary": "Affecter un surveillant à un examen",
                "parameters": [{"name": "exam_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["proctor_id"],
                        "properties": {"proctor_id": {"type": "integer"}}
                    }}}
                },
                "responses": {"201": {"description": "Surveillant affecté"}}
            }
        },

        # ── AGENT AUTONOME ────────────────────────────────────────────────────

        "/api/agent/alerts": {
            "post": {
                "tags": ["Agent autonome"],
                "summary": "Pousser une alerte (service agent uniquement)",
                "description": "Endpoint réservé au service `cei-agent-proctor`. Authentification par `X-Agent-Secret`.",
                "security": [{"AgentSecret": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AgentAlert"}}}
                },
                "responses": {
                    "200": {"description": "Alerte enregistrée"},
                    "403": {"description": "Secret agent invalide"}
                }
            },
            "get": {
                "tags": ["Agent autonome"],
                "summary": "Récupérer les alertes non lues (dashboard)",
                "description": "Retourne les 50 dernières alertes non lues. Utilisé par le dashboard surveillant toutes les 15 secondes.",
                "responses": {
                    "200": {
                        "description": "Alertes actives",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "alerts":       {"type": "array", "items": {"$ref": "#/components/schemas/AgentAlert"}},
                                "total_unread": {"type": "integer"}
                            }
                        }}}
                    }
                }
            }
        },
        "/api/agent/alerts/read": {
            "post": {
                "tags": ["Agent autonome"],
                "summary": "Marquer des alertes comme lues",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "properties": {
                            "attempt_ids": {"type": "array", "items": {"type": "integer"}}
                        }
                    }}}
                },
                "responses": {"200": {"description": "Alertes marquées lues"}}
            }
        },
        "/api/agent/active_exams": {
            "get": {
                "tags": ["Agent autonome"],
                "summary": "Examens actifs (service agent uniquement)",
                "security": [{"AgentSecret": []}],
                "responses": {
                    "200": {
                        "description": "Examens en cours",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "exams": {"type": "array", "items": {
                                    "type": "object",
                                    "properties": {
                                        "id":    {"type": "integer"},
                                        "title": {"type": "string"}
                                    }
                                }}
                            }
                        }}}
                    }
                }
            }
        },
        "/api/agent/exam_proctoring/{exam_id}": {
            "get": {
                "tags": ["Agent autonome"],
                "summary": "Données de surveillance complètes (service agent)",
                "description": "Retourne tentatives + emails surveillants + email enseignant pour un examen.",
                "security": [{"AgentSecret": []}],
                "parameters": [{"name": "exam_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {
                        "description": "Données de surveillance",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "exam_id":        {"type": "integer"},
                                "title":          {"type": "string"},
                                "teacher_email":  {"type": "string"},
                                "proctor_emails": {"type": "array", "items": {"type": "string"}},
                                "attempts":       {"type": "array", "items": {"$ref": "#/components/schemas/ExamAttempt"}}
                            }
                        }}}
                    }
                }
            }
        },

        # ── INTELLIGENCE ARTIFICIELLE ─────────────────────────────────────────

        "/api/ai/generate-exam-suggestions": {
            "post": {
                "tags": ["Intelligence Artificielle"],
                "summary": "Générer des suggestions d'examens depuis un fichier cours",
                "description": (
                    "Upload d'un cours (PDF/DOCX/TXT). L'IA détecte la discipline, "
                    "analyse le contenu et génère 3 suggestions de sujets d'examen "
                    "adaptées au niveau et à la difficulté demandés."
                ),
                "requestBody": {
                    "required": True,
                    "content": {"multipart/form-data": {"schema": {
                        "type": "object",
                        "required": ["course_file"],
                        "properties": {
                            "course_file":   {"type": "string", "format": "binary"},
                            "difficulty":    {"type": "string", "enum": ["Facile","Moyen","Difficile"], "default": "Moyen"},
                            "student_level": {"type": "string", "example": "Licence 3"},
                            "exam_type":     {"type": "string", "example": "QCM", "description": "Optionnel"}
                        }
                    }}}
                },
                "responses": {
                    "200": {
                        "description": "Suggestions générées",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "course_summary":  {"type": "string"},
                                "detected_domain": {"type": "string", "example": "Réseaux informatiques"},
                                "main_topics":     {"type": "array", "items": {"type": "string"}},
                                "suggestions": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "title":             {"type": "string"},
                                            "description":       {"type": "string"},
                                            "exam_type":         {"type": "string"},
                                            "duration":          {"type": "integer", "description": "Minutes"},
                                            "difficulty":        {"type": "string"},
                                            "key_points":        {"type": "array", "items": {"type": "string"}},
                                            "questions_examples":{"type": "array", "items": {"type": "string"}},
                                            "grading_criteria":  {"type": "string"}
                                        }
                                    }
                                }
                            }
                        }}}
                    }
                }
            }
        },
        "/api/subjects/generate-full-exam": {
            "post": {
                "tags": ["Intelligence Artificielle"],
                "summary": "Générer un sujet d'examen complet depuis une suggestion",
                "description": "À partir d'une suggestion (obtenue via generate-exam-suggestions), génère un sujet complet avec questions numérotées et barème.",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["suggestion"],
                        "properties": {
                            "suggestion": {
                                "type": "object",
                                "description": "Objet suggestion retourné par /api/ai/generate-exam-suggestions"
                            }
                        }
                    }}}
                },
                "responses": {
                    "200": {
                        "description": "Sujet généré",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "title":    {"type": "string"},
                                "content":  {"type": "string", "description": "Texte complet du sujet"},
                                "rubric":   {"type": "string", "description": "Barème de notation"},
                                "full_text":{"type": "string"}
                            }
                        }}}
                    }
                }
            }
        },
        "/api/subjects/create-from-suggestion": {
            "post": {
                "tags": ["Intelligence Artificielle"],
                "summary": "Créer et sauvegarder un sujet généré par IA",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["title", "content"],
                        "properties": {
                            "title":   {"type": "string"},
                            "content": {"type": "string"},
                            "rubric":  {"type": "string"},
                            "ec_id":   {"type": "integer"}
                        }
                    }}}
                },
                "responses": {
                    "201": {"description": "Sujet sauvegardé", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Subject"}}}}
                }
            }
        },

        # ── RÉCLAMATIONS ──────────────────────────────────────────────────────

        "/api/reclamations": {
            "get": {
                "tags": ["Réclamations"],
                "summary": "Liste des réclamations (admin/prof : toutes ; étudiant : les siennes)",
                "responses": {"200": {"description": "Réclamations"}}
            },
            "post": {
                "tags": ["Réclamations"],
                "summary": "Déposer une réclamation (étudiant)",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["paper_id", "reason"],
                        "properties": {
                            "paper_id": {"type": "integer"},
                            "reason":   {"type": "string", "example": "La question 3 a été mal évaluée."}
                        }
                    }}}
                },
                "responses": {
                    "201": {"description": "Réclamation enregistrée"},
                    "400": {"description": "Fenêtre de réclamation expirée (7 jours après correction)"}
                }
            }
        },
        "/api/reclamations/{reclamation_id}/process_ia": {
            "post": {
                "tags": ["Réclamations"],
                "summary": "Traiter une réclamation par IA",
                "description": "L'IA re-corrige la copie en tenant compte de la contestation de l'étudiant et propose une note révisée.",
                "parameters": [{"name": "reclamation_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {
                        "description": "Proposition de l'IA",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "proposed_score": {"type": "number"},
                                "analysis":       {"type": "string"},
                                "decision":       {"type": "string", "enum": ["accepted","rejected","partial"]}
                            }
                        }}}
                    }
                }
            }
        },

        # ── RELEVÉS DE NOTES ──────────────────────────────────────────────────

        "/api/transcripts/generate/{student_id}/{semester_id}": {
            "post": {
                "tags": ["Relevés de notes"],
                "summary": "Générer un relevé de notes pour un étudiant",
                "parameters": [
                    {"name": "student_id",  "in": "path", "required": True, "schema": {"type": "integer"}},
                    {"name": "semester_id", "in": "path", "required": True, "schema": {"type": "integer"}}
                ],
                "responses": {
                    "200": {
                        "description": "Relevé généré",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "transcript_id": {"type": "integer"},
                                "gpa":           {"type": "number"},
                                "mention":       {"type": "string", "example": "Bien"},
                                "total_credits": {"type": "integer"}
                            }
                        }}}
                    }
                }
            }
        },
        "/api/transcripts/{transcript_id}/pdf": {
            "get": {
                "tags": ["Relevés de notes"],
                "summary": "Télécharger le relevé de notes en PDF",
                "parameters": [{"name": "transcript_id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {
                        "description": "Fichier PDF",
                        "content": {"application/pdf": {"schema": {"type": "string", "format": "binary"}}}
                    },
                    "404": {"$ref": "#/components/responses/NotFound"}
                }
            }
        },
        "/api/student/transcripts": {
            "get": {
                "tags": ["Relevés de notes"],
                "summary": "Relevés de notes de l'étudiant connecté",
                "responses": {"200": {"description": "Liste des relevés"}}
            }
        }
    }
}


# ── Routes Swagger ────────────────────────────────────────────────────────────

SWAGGER_UI_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CEI API — Documentation Swagger</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #0f172a; }
    .topbar { background: #1e3a8a !important; }
    .topbar-wrapper img { display: none; }
    .topbar-wrapper::after {
      content: "CEI — Centre d'Examen Intelligent · API v2.1";
      color: white; font-weight: 700; font-size: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .swagger-ui .info .title { color: #1e40af; }
    .swagger-ui { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  </style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({
    url:            '/api/docs/openapi.json',
    dom_id:         '#swagger-ui',
    presets:        [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    layout:         'BaseLayout',
    deepLinking:    true,
    filter:         true,
    tryItOutEnabled: true,
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    defaultModelsExpandDepth: 2,
  });
</script>
</body>
</html>"""

REDOC_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>CEI API — ReDoc</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
  <style>body { margin: 0; padding: 0; }</style>
</head>
<body>
  <redoc spec-url='/api/docs/openapi.json' expand-responses="200,201" hide-download-button></redoc>
  <script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script>
</body>
</html>"""


@swagger_bp.route('/api/docs')
def swagger_ui():
    """Interface Swagger UI interactive."""
    return SWAGGER_UI_HTML, 200, {'Content-Type': 'text/html; charset=utf-8'}


@swagger_bp.route('/api/docs/redoc')
def redoc_ui():
    """Interface ReDoc (alternative Swagger, plus lisible)."""
    return REDOC_HTML, 200, {'Content-Type': 'text/html; charset=utf-8'}


@swagger_bp.route('/api/docs/openapi.json')
def openapi_spec():
    """Spec OpenAPI 3.0 brute (JSON) — pour les outils et générateurs de clients."""
    return jsonify(OPENAPI_SPEC)
