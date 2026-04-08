"""
Application Flask - Système de Notation Avancé COMPLET
Avec CRUD Maquette + Gestion erreurs
"""
from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
from datetime import datetime, timedelta, timezone
from csv_import_routes import register_csv_routes
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required,
    get_jwt_identity, get_jwt
)
from flask_bcrypt import Bcrypt
import os
from pathlib import Path
from dotenv import load_dotenv
from anthropic import Anthropic
from werkzeug.utils import secure_filename
import PyPDF2
import docx
from sqlalchemy import func, desc
from sqlalchemy.orm import joinedload
import io
import re
import statistics
import json

from models import (
    User, Subject, StudentPaper, Reclamation, CorrectionHistory,
    UserRole, ReclamationStatus,
    Formation, Semester, UE, EC, ECAssignment, StudentUEEnrollment,
    OnlineExam, ExamAttempt, ExamActivityLog, GradeTranscript, CameraLog,
    ExamStatus, AttemptStatus,  
    get_session, init_db
)

from export_route import register_export_route
from utils import (
    send_account_created_email, send_paper_corrected_email,
    extract_text_from_file,
    generate_pdf_report,
    generate_corrected_paper_pdf,
    generate_statistics_chart,
    allowed_file, calculate_file_hash, extract_student_name_from_content,
    match_student_by_name  # Utilitaires améliorés
)
from proctoring_routes import proctoring_bp

# ... autres imports ...
from models import (
    User, Subject, StudentPaper, Reclamation, CorrectionHistory,
    UserRole, ReclamationStatus,
    Formation, Semester, UE, EC, ECAssignment, StudentUEEnrollment,
    OnlineExam, ExamAttempt, ExamActivityLog, GradeTranscript, 
    ExamStatus, AttemptStatus,  
    get_session, init_db
)

from export_route import register_export_route
from utils import (
    send_account_created_email, send_paper_corrected_email,
    extract_text_from_file,
    generate_pdf_report,
    generate_corrected_paper_pdf,
    generate_statistics_chart,
    allowed_file, calculate_file_hash, extract_student_name_from_content,
    match_student_by_name
)

# ✅ AJOUTEZ CETTE FONCTION ICI
def normalize_name(name):
    """Normaliser un nom pour créer un identifiant unique"""
    import unicodedata
    import re
    
    # Supprimer les accents
    name = unicodedata.normalize('NFKD', name)
    name = name.encode('ASCII', 'ignore').decode('ASCII')
    
    # Convertir en minuscules et remplacer espaces par points
    name = name.lower().strip()
    name = re.sub(r'[^\w\s-]', '', name)  # Supprimer caractères spéciaux
    name = re.sub(r'[\s]+', '.', name)     # Remplacer espaces par points
    
    return name

# Charger les variables d'environnement

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'dev-jwt-secret-key-change-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_FILE_SIZE', 16 * 1024 * 1024))
app.config['UPLOAD_FOLDER'] = os.getenv('UPLOAD_FOLDER', 'static/uploads')

jwt = JWTManager(app)
bcrypt = Bcrypt(app)
client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Enregistrement du blueprint proctoring
app.register_blueprint(proctoring_bp)

@jwt.unauthorized_loader
def unauthorized_callback(callback):
    return jsonify({'error': 'Token d\'authentification manquant'}), 401

@jwt.invalid_token_loader
def invalid_token_callback(callback):
    from flask import request
    print("=" * 80)
    print("JWT INVALID TOKEN CALLBACK")
    print(f"Route: {request.path}")
    print(f"Method: {request.method}")
    print(f"Error: {callback}")
    print(f"Headers: {dict(request.headers)}")
    auth_header = request.headers.get('Authorization', 'MISSING')
    print(f"Authorization Header: {auth_header[:100] if auth_header != 'MISSING' else 'MISSING'}...")
    print("=" * 80)
    return jsonify({'error': 'Token invalide ou mal formate'}), 422

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    print(f"🚨 JWT EXPIRED: header={jwt_header}, payload={jwt_payload}")
    return jsonify({'error': 'Token expire, veuillez vous reconnecter'}), 401

Path(app.config['UPLOAD_FOLDER']).mkdir(exist_ok=True, parents=True)
Path('exports').mkdir(exist_ok=True)

try:
    init_db()
    print("✅ Base de données initialisée")
except Exception as e:
    print(f"⚠️ Attention lors de l'initialisation de la base: {e}")

def call_claude(system_prompt: str, user_message: str, temperature: float = 0.2) -> str:
    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=8192,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}]
        )
        return message.content[0].text
    except Exception as e:
        raise Exception(f"Erreur API Claude: {str(e)}")

def extract_score_from_correction(correction_text: str) -> float:
    """Extraire la note de la correction avec de multiples patterns"""
    patterns = [
        r'Note totale\s*:\s*(\d+\.?\d*)\s*/\s*20',
        r'Note totale\s*:\s*(\d+\.?\d*)\s*/\s*(\d+)',
        r'Score\s*:\s*(\d+\.?\d*)\s*/\s*20',
        r'Total\s*:\s*(\d+\.?\d*)\s*/\s*20',
        r'Note finale\s*:\s*(\d+\.?\d*)\s*/\s*20',
        r'Note\s*:\s*(\d+\.?\d*)\s*/\s*20',
        r'(\d+\.?\d*)\s*/\s*20\s*points?',
        r'(\d+\.?\d*)\s*sur\s*20',
    ]

    for pattern in patterns:
        match = re.search(pattern, correction_text, re.IGNORECASE)
        if match:
            score = float(match.group(1))
            if len(match.groups()) > 1 and match.group(2):
                total = float(match.group(2))
                score = (score / total) * 20
            return round(score, 2)

    return 0.0

def utcnow():
    """Helper pour datetime UTC compatible Python 3.12+"""
    return datetime.now(timezone.utc)


def _strip_bareme_from_content(content):
    """Retirer la section barème du contenu (pour les étudiants).
    Ne jamais couper les lignes de séparateurs qui servent de décoration de titre.
    """
    if not content:
        return content
    # Pattern 1 : ligne de séparateurs (═══...) immédiatement suivie de "barème"
    m = re.search(r'\n[═=─]{5,}[^\n]*\n[^\n]*[Bb]ar[eè]me', content)
    if m:
        return content[:m.start()].rstrip()
    # Pattern 2 : "Barème de Notation" comme entête de section
    m = re.search(r'\n\s*[Bb]ar[eè]me\s+de\s+[Nn]otation', content, re.IGNORECASE)
    if m:
        return content[:m.start()].rstrip()
    # Pattern 3 : "BARÈME" seul sur sa ligne (tout en majuscules)
    m = re.search(r'\nBAR[ÈE]ME\s*\n', content)
    if m:
        return content[:m.start()].rstrip()
    # Pas de barème trouvé → retourner le contenu intact
    return content

# Anti-cache pour développement
@app.after_request
def add_no_cache_headers(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response

@app.route('/')
def landing():
    return render_template('landing.html')

@app.route('/app')
def app_page():
    return render_template('index.html')

@app.route('/guide-enseignant')
def guide_teacher():
    return render_template('guide_teacher.html')

@app.route('/guide-etudiant')
def guide_student():
    return render_template('guide_student.html')

@app.route('/conditions')
def terms():
    return render_template('terms.html')


# ============================================================================
# ROUTES AUTHENTIFICATION
# ============================================================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.json
        session = get_session()

        existing_user = session.query(User).filter_by(email=data['email']).first()
        if existing_user:
            session.close()
            return jsonify({'error': 'Cet email est déjà utilisé'}), 400

        hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
        role = UserRole.STUDENT

        new_user = User(
            email=data['email'],
            password_hash=hashed_password,
            full_name=data['full_name'],
            role=role
        )

        session.add(new_user)
        session.commit()
        user_dict = new_user.to_dict()
        session.close()

        # Envoi email
        send_account_created_email(data['email'], data['full_name'], 'student', data['password'])

        return jsonify({'success': True, 'message': 'Inscription réussie', 'user': user_dict}), 201
    except Exception as e:
        print(f"❌ Erreur register: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.json
        session = get_session()

        user = session.query(User).filter_by(email=data['email']).first()

        if not user or not bcrypt.check_password_hash(user.password_hash, data['password']):
            session.close()
            return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

        if not user.is_active:
            session.close()
            return jsonify({'error': 'Compte désactivé'}), 403

        user.last_login = utcnow()
        session.commit()

        access_token = create_access_token(
            identity=str(user.id),
            additional_claims={'role': user.role.value, 'email': user.email}
        )

        user_dict = user.to_dict()
        session.close()

        return jsonify({'success': True, 'access_token': access_token, 'user': user_dict})
    except Exception as e:
        print(f"❌ Erreur login: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if not user:
            session.close()
            return jsonify({'error': 'Utilisateur non trouvé'}), 404

        user_dict = user.to_dict()
        session.close()
        return jsonify(user_dict)
    except Exception as e:
        print(f"❌ Erreur get_current_user: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES FORMATIONS, UE, EC (LECTURE)
# ============================================================================

@app.route('/api/formations', methods=['GET'])
@jwt_required()
def get_formations():
    """Récupérer toutes les formations"""
    try:
        session = get_session()
        formations = session.query(Formation).filter_by(is_active=True).all()
        formations_list = [f.to_dict() for f in formations]
        session.close()
        return jsonify(formations_list)
    except Exception as e:
        print(f"❌ Erreur get_formations: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/formations/<int:formation_id>/semesters', methods=['GET'])
@jwt_required()
def get_formation_semesters(formation_id):
    """Récupérer les semestres d'une formation"""
    try:
        session = get_session()
        semesters = session.query(Semester).filter_by(formation_id=formation_id, is_active=True).all()
        semesters_list = [s.to_dict() for s in semesters]
        session.close()
        return jsonify(semesters_list)
    except Exception as e:
        print(f"❌ Erreur get_formation_semesters: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/semesters/<int:semester_id>/ues', methods=['GET'])
@jwt_required()
def get_semester_ues(semester_id):
    """Récupérer les UEs d'un semestre"""
    try:
        session = get_session()
        ues = session.query(UE).filter_by(semester_id=semester_id, is_active=True).all()
        ues_list = [ue.to_dict() for ue in ues]
        session.close()
        return jsonify(ues_list)
    except Exception as e:
        print(f"❌ Erreur get_semester_ues: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ues/<int:ue_id>/ecs', methods=['GET'])
@jwt_required()
def get_ue_ecs(ue_id):
    """Récupérer les ECs d'une UE - Amélioré : Filtrer par professeur si rôle professor"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        user = session.query(User).filter_by(id=user_id).first()
        
        query = session.query(EC).filter_by(ue_id=ue_id, is_active=True)
        
        if user.role == UserRole.PROFESSOR:
            # Filtrer seulement les ECs affectés au professeur
            query = query.join(ECAssignment).filter(ECAssignment.professor_id == user_id)
        
        ecs = query.all()
        ecs_list = [ec.to_dict() for ec in ecs]
        session.close()
        return jsonify(ecs_list)
    except Exception as e:
        print(f"❌ Erreur get_ue_ecs: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ecs', methods=['GET'])
@jwt_required()
def get_all_ecs():
    """Récupérer tous les ECs (pour les sélecteurs) - Amélioré : Filtrer par professeur"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        user = session.query(User).filter_by(id=user_id).first()
        
        query = session.query(EC).filter_by(is_active=True).options(joinedload(EC.ue))
        
        if user.role == UserRole.PROFESSOR:
            # Seulement les ECs affectés
            query = query.join(ECAssignment).filter(ECAssignment.professor_id == user_id)
        
        ecs = query.all()
        ecs_list = [ec.to_dict() for ec in ecs]
        session.close()
        return jsonify(ecs_list)
    except Exception as e:
        print(f"❌ Erreur get_all_ecs: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES CRUD FORMATIONS (ADMIN ONLY)
# ============================================================================

@app.route('/api/admin/formations', methods=['POST'])
@jwt_required()
def create_formation():
    """Créer une formation"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        data = request.json

        # Vérifier si le code existe déjà
        existing = session.query(Formation).filter_by(code=data['code']).first()
        if existing:
            session.close()
            return jsonify({'error': 'Code formation déjà utilisé'}), 400

        formation = Formation(
            code=data['code'],
            name=data['name'],
            level=data.get('level', ''),
            department=data.get('department', ''),
            description=data.get('description', '')
        )

        session.add(formation)
        session.commit()
        formation_dict = formation.to_dict()
        session.close()

        return jsonify({'success': True, 'formation': formation_dict}), 201
    except Exception as e:
        print(f"❌ Erreur create_formation: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/formations/<int:formation_id>', methods=['PUT'])
@jwt_required()
def update_formation(formation_id):
    """Modifier une formation"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        formation = session.query(Formation).filter_by(id=formation_id).first()
        if not formation:
            session.close()
            return jsonify({'error': 'Formation non trouvée'}), 404

        data = request.json

        if 'code' in data and data['code'] != formation.code:
            existing = session.query(Formation).filter_by(code=data['code']).first()
            if existing:
                session.close()
                return jsonify({'error': 'Code déjà utilisé'}), 400
            formation.code = data['code']

        if 'name' in data:
            formation.name = data['name']
        if 'level' in data:
            formation.level = data['level']
        if 'department' in data:
            formation.department = data['department']
        if 'description' in data:
            formation.description = data['description']
        if 'is_active' in data:
            formation.is_active = data['is_active']

        session.commit()
        formation_dict = formation.to_dict()
        session.close()

        return jsonify({'success': True, 'formation': formation_dict})
    except Exception as e:
        print(f"❌ Erreur update_formation: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/formations/<int:formation_id>', methods=['DELETE'])
@jwt_required()
def delete_formation(formation_id):
    """Supprimer une formation"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        formation = session.query(Formation).filter_by(id=formation_id).first()
        if not formation:
            session.close()
            return jsonify({'error': 'Formation non trouvée'}), 404

        session.delete(formation)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'Formation supprimée'})
    except Exception as e:
        print(f"❌ Erreur delete_formation: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES CRUD SEMESTRES (ADMIN ONLY)
# ============================================================================

@app.route('/api/admin/semesters', methods=['POST'])
@jwt_required()
def create_semester():
    """Créer un semestre"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        data = request.json

        formation = session.query(Formation).filter_by(id=data['formation_id']).first()
        if not formation:
            session.close()
            return jsonify({'error': 'Formation non trouvée'}), 404

        semester = Semester(
            formation_id=data['formation_id'],
            number=data['number'],
            name=data['name'],
            total_credits=data.get('total_credits', 30)
        )

        session.add(semester)
        session.commit()
        semester_dict = semester.to_dict()
        session.close()

        return jsonify({'success': True, 'semester': semester_dict}), 201
    except Exception as e:
        print(f"❌ Erreur create_semester: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/semesters/<int:semester_id>', methods=['PUT'])
@jwt_required()
def update_semester(semester_id):
    """Modifier un semestre"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        semester = session.query(Semester).filter_by(id=semester_id).first()
        if not semester:
            session.close()
            return jsonify({'error': 'Semestre non trouvé'}), 404

        data = request.json

        if 'number' in data:
            semester.number = data['number']
        if 'name' in data:
            semester.name = data['name']
        if 'total_credits' in data:
            semester.total_credits = data['total_credits']
        if 'is_active' in data:
            semester.is_active = data['is_active']

        session.commit()
        semester_dict = semester.to_dict()
        session.close()

        return jsonify({'success': True, 'semester': semester_dict})
    except Exception as e:
        print(f"❌ Erreur update_semester: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/semesters/<int:semester_id>', methods=['DELETE'])
@jwt_required()
def delete_semester(semester_id):
    """Supprimer un semestre"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        semester = session.query(Semester).filter_by(id=semester_id).first()
        if not semester:
            session.close()
            return jsonify({'error': 'Semestre non trouvé'}), 404

        session.delete(semester)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'Semestre supprimé'})
    except Exception as e:
        print(f"❌ Erreur delete_semester: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES CRUD UEs (ADMIN ONLY)
# ============================================================================

@app.route('/api/admin/ues', methods=['POST'])
@jwt_required()
def create_ue():
    """Créer une UE"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        data = request.json

        # Vérifier si le code existe déjà
        existing = session.query(UE).filter_by(code=data['code']).first()
        if existing:
            session.close()
            return jsonify({'error': 'Code UE déjà utilisé'}), 400

        semester = session.query(Semester).filter_by(id=data['semester_id']).first()
        if not semester:
            session.close()
            return jsonify({'error': 'Semestre non trouvé'}), 404

        ue = UE(
            semester_id=data['semester_id'],
            code=data['code'],
            name=data['name'],
            credits=data.get('credits', 6)
        )

        session.add(ue)
        session.commit()
        ue_dict = ue.to_dict()
        session.close()

        return jsonify({'success': True, 'ue': ue_dict}), 201
    except Exception as e:
        print(f"❌ Erreur create_ue: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/ues/<int:ue_id>', methods=['PUT'])
@jwt_required()
def update_ue(ue_id):
    """Modifier une UE"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        ue = session.query(UE).filter_by(id=ue_id).first()
        if not ue:
            session.close()
            return jsonify({'error': 'UE non trouvée'}), 404

        data = request.json

        if 'code' in data and data['code'] != ue.code:
            existing = session.query(UE).filter_by(code=data['code']).first()
            if existing:
                session.close()
                return jsonify({'error': 'Code déjà utilisé'}), 400
            ue.code = data['code']

        if 'name' in data:
            ue.name = data['name']
        if 'credits' in data:
            ue.credits = data['credits']
        if 'is_active' in data:
            ue.is_active = data['is_active']

        session.commit()
        ue_dict = ue.to_dict()
        session.close()

        return jsonify({'success': True, 'ue': ue_dict})
    except Exception as e:
        print(f"❌ Erreur update_ue: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/ues/<int:ue_id>', methods=['DELETE'])
@jwt_required()
def delete_ue(ue_id):
    """Supprimer une UE"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        ue = session.query(UE).filter_by(id=ue_id).first()
        if not ue:
            session.close()
            return jsonify({'error': 'UE non trouvée'}), 404

        session.delete(ue)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'UE supprimée'})
    except Exception as e:
        print(f"❌ Erreur delete_ue: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES CRUD ECs (ADMIN ONLY)
# ============================================================================

@app.route('/api/admin/ecs', methods=['POST'])
@jwt_required()
def create_ec():
    """Créer un EC"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        data = request.json

        # Vérifier si le code existe déjà
        existing = session.query(EC).filter_by(code=data['code']).first()
        if existing:
            session.close()
            return jsonify({'error': 'Code EC déjà utilisé'}), 400

        ue = session.query(UE).filter_by(id=data['ue_id']).first()
        if not ue:
            session.close()
            return jsonify({'error': 'UE non trouvée'}), 404

        ec = EC(
            ue_id=data['ue_id'],
            code=data['code'],
            name=data['name'],
            cm=data.get('cm', 0),
            td=data.get('td', 0),
            tp=data.get('tp', 0),
            tpe=data.get('tpe', 0),
            vht=data.get('vht', 0),
            coefficient=data.get('coefficient', 1)
        )

        session.add(ec)
        session.commit()
        ec_dict = ec.to_dict()
        session.close()

        return jsonify({'success': True, 'ec': ec_dict}), 201
    except Exception as e:
        print(f"❌ Erreur create_ec: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/ecs/<int:ec_id>', methods=['PUT'])
@jwt_required()
def update_ec(ec_id):
    """Modifier un EC"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        ec = session.query(EC).filter_by(id=ec_id).first()
        if not ec:
            session.close()
            return jsonify({'error': 'EC non trouvé'}), 404

        data = request.json

        if 'code' in data and data['code'] != ec.code:
            existing = session.query(EC).filter_by(code=data['code']).first()
            if existing:
                session.close()
                return jsonify({'error': 'Code déjà utilisé'}), 400
            ec.code = data['code']

        if 'name' in data:
            ec.name = data['name']
        if 'cm' in data:
            ec.cm = data['cm']
        if 'td' in data:
            ec.td = data['td']
        if 'tp' in data:
            ec.tp = data['tp']
        if 'tpe' in data:
            ec.tpe = data['tpe']
        if 'vht' in data:
            ec.vht = data['vht']
        if 'coefficient' in data:
            ec.coefficient = data['coefficient']
        if 'is_active' in data:
            ec.is_active = data['is_active']

        session.commit()
        ec_dict = ec.to_dict()
        session.close()

        return jsonify({'success': True, 'ec': ec_dict})
    except Exception as e:
        print(f"❌ Erreur update_ec: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/ecs/<int:ec_id>', methods=['DELETE'])
@jwt_required()
def delete_ec(ec_id):
    """Supprimer un EC"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        ec = session.query(EC).filter_by(id=ec_id).first()
        if not ec:
            session.close()
            return jsonify({'error': 'EC non trouvé'}), 404

        session.delete(ec)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'EC supprimé'})
    except Exception as e:
        print(f"❌ Erreur delete_ec: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# NOUVEAU : ROUTES AFFECTATION EC-PROFESSEUR (ADMIN ONLY)
# ============================================================================

@app.route('/api/admin/ec_assignments', methods=['POST'])
@jwt_required()
def assign_ec_to_professor():
    """Affecter un EC à un professeur - Refuse si déjà affecté"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        data = request.json
        ec_id = data.get('ec_id')
        professor_id = data.get('professor_id')

        if not ec_id or not professor_id:
            session.close()
            return jsonify({'error': 'EC et professeur requis'}), 400

        ec = session.query(EC).filter_by(id=ec_id).first()
        if not ec:
            session.close()
            return jsonify({'error': 'EC non trouvé'}), 404

        professor = session.query(User).filter_by(id=professor_id, role=UserRole.PROFESSOR).first()
        if not professor:
            session.close()
            return jsonify({'error': 'Professeur non trouvé'}), 404

        # Vérifier si déjà affecté
        existing_assignment = session.query(ECAssignment).filter_by(ec_id=ec_id).first()
        if existing_assignment:
            session.close()
            return jsonify({'error': 'Cet EC est déjà affecté à un professeur'}), 400

        assignment = ECAssignment(
            ec_id=ec_id,
            professor_id=professor_id
        )

        session.add(assignment)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'EC affecté avec succès'}), 201
    except Exception as e:
        print(f"❌ Erreur assign_ec_to_professor: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/ecs/<int:ec_id>/assign', methods=['POST'])
@jwt_required()
def assign_ec_by_id(ec_id):
    """Affecter un EC à un professeur par ID EC (endpoint alternatif pour le frontend)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        data = request.json
        professor_id = data.get('professor_id')

        if not professor_id:
            session.close()
            return jsonify({'error': 'Professeur requis'}), 400

        ec = session.query(EC).filter_by(id=ec_id).first()
        if not ec:
            session.close()
            return jsonify({'error': 'EC non trouvé'}), 404

        professor = session.query(User).filter_by(id=professor_id, role=UserRole.PROFESSOR).first()
        if not professor:
            session.close()
            return jsonify({'error': 'Professeur non trouvé'}), 404

        # Vérifier si déjà affecté
        existing_assignment = session.query(ECAssignment).filter_by(ec_id=ec_id).first()
        if existing_assignment:
            existing_assignment.professor_id = professor_id
            session.commit()
            session.close()
            return jsonify({'success': True, 'message': 'Affectation mise à jour'}), 200

        assignment = ECAssignment(
            ec_id=ec_id,
            professor_id=professor_id
        )

        session.add(assignment)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'EC affecté avec succès'}), 201
    except Exception as e:
        print(f"❌ Erreur assign_ec_by_id: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/ec_assignments/<int:assignment_id>', methods=['DELETE'])
@jwt_required()
def remove_ec_assignment(assignment_id):
    """Retirer l'affectation d'un EC"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        assignment = session.query(ECAssignment).filter_by(id=assignment_id).first()
        if not assignment:
            session.close()
            return jsonify({'error': 'Affectation non trouvée'}), 404

        session.delete(assignment)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'Affectation supprimée'})
    except Exception as e:
        print(f"❌ Erreur remove_ec_assignment: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# NOUVEAU : ROUTES INSCRIPTION ÉTUDIANT-UE (ADMIN ONLY)
# ============================================================================

@app.route('/api/admin/student_enrollments', methods=['POST'])
@jwt_required()
def enroll_student_to_ue():
    """Inscrire un étudiant à une UE"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        data = request.json
        student_id = data.get('student_id')
        ue_id = data.get('ue_id')

        if not student_id or not ue_id:
            session.close()
            return jsonify({'error': 'Étudiant et UE requis'}), 400

        student = session.query(User).filter_by(id=student_id, role=UserRole.STUDENT).first()
        if not student:
            session.close()
            return jsonify({'error': 'Étudiant non trouvé'}), 404

        ue = session.query(UE).filter_by(id=ue_id).first()
        if not ue:
            session.close()
            return jsonify({'error': 'UE non trouvée'}), 404

        # Vérifier si déjà inscrit
        existing_enrollment = session.query(StudentUEEnrollment).filter_by(student_id=student_id, ue_id=ue_id).first()
        if existing_enrollment:
            session.close()
            return jsonify({'error': 'Étudiant déjà inscrit à cette UE'}), 400

        enrollment = StudentUEEnrollment(
            student_id=student_id,
            ue_id=ue_id
        )

        session.add(enrollment)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'Étudiant inscrit avec succès'}), 201
    except Exception as e:
        print(f"❌ Erreur enroll_student_to_ue: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/students/<int:student_id>/enroll', methods=['POST'])
@jwt_required()
def enroll_student_by_id(student_id):
    """Inscrire un étudiant à une UE par ID (endpoint alternatif pour le frontend)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        print("=" * 80)
        print("🔍 DEBUG enroll_student_by_id:")
        print(f"   student_id: {student_id}")
        print(f"   user_id (admin): {user_id}")
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            print("❌ ERREUR: Utilisateur non admin")
            return jsonify({'error': 'Accès non autorisé'}), 403

        data = request.json
        print(f"   data reçue: {data}")
        print(f"   type(data): {type(data)}")
        
        ue_id = data.get('ue_id') if data else None
        print(f"   ue_id extrait: {ue_id}")
        print(f"   type(ue_id): {type(ue_id)}")

        if not ue_id:
            session.close()
            print("❌ ERREUR: ue_id manquant ou vide")
            return jsonify({'error': 'UE requis (ue_id manquant)'}), 400

        # Vérification étudiant
        student = session.query(User).filter_by(id=student_id, role=UserRole.STUDENT).first()
        if not student:
            session.close()
            print(f"❌ ERREUR: Étudiant {student_id} non trouvé")
            return jsonify({'error': 'Étudiant non trouvé'}), 404

        # Vérification UE
        ue = session.query(UE).filter_by(id=ue_id).first()
        if not ue:
            session.close()
            print(f"❌ ERREUR: UE {ue_id} non trouvée")
            return jsonify({'error': 'UE non trouvée'}), 404

        # Vérifier si déjà inscrit
        existing_enrollment = session.query(StudentUEEnrollment).filter_by(
            student_id=student_id, ue_id=ue_id
        ).first()
        
        if existing_enrollment:
            session.close()
            print(f"⚠️ AVERTISSEMENT: Étudiant {student_id} déjà inscrit à UE {ue_id}")
            return jsonify({'error': 'Étudiant déjà inscrit à cette UE'}), 400

        # Créer l'inscription
        enrollment = StudentUEEnrollment(
            student_id=student_id,
            ue_id=ue_id
        )

        session.add(enrollment)
        session.commit()
        session.close()

        print(f"✅ SUCCESS: Étudiant {student_id} inscrit à UE {ue_id}")
        print("=" * 80)

        return jsonify({'success': True, 'message': 'Étudiant inscrit avec succès'}), 201
        
    except Exception as e:
        print(f"❌ EXCEPTION enroll_student_by_id: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/student_enrollments/<int:enrollment_id>', methods=['DELETE'])
@jwt_required()
def remove_student_enrollment(enrollment_id):
    """Retirer l'inscription d'un étudiant à une UE"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        enrollment = session.query(StudentUEEnrollment).filter_by(id=enrollment_id).first()
        if not enrollment:
            session.close()
            return jsonify({'error': 'Inscription non trouvée'}), 404

        session.delete(enrollment)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'Inscription supprimée'})
    except Exception as e:
        print(f"❌ Erreur remove_student_enrollment: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES ADMIN - Dashboard et Utilisateurs
# ============================================================================

@app.route('/api/admin/dashboard', methods=['GET'])
@jwt_required()
def admin_dashboard():
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if not user or user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        total_users = session.query(User).count()
        total_students = session.query(User).filter_by(role=UserRole.STUDENT).count()
        total_professors = session.query(User).filter_by(role=UserRole.PROFESSOR).count()
        total_subjects = session.query(Subject).count()
        total_papers = session.query(StudentPaper).count()
        pending_reclamations = session.query(Reclamation).filter_by(status=ReclamationStatus.PENDING).count()
        total_corrected_papers = session.query(StudentPaper).filter(StudentPaper.corrected_at != None).count()

        dashboard_data = {
            'total_users': total_users,
            'total_students': total_students,
            'total_professors': total_professors,
            'total_subjects': total_subjects,
            'total_papers': total_papers,
            'pending_reclamations': pending_reclamations,
            'total_corrected_papers': total_corrected_papers
        }

        session.close()
        return jsonify(dashboard_data)
    except Exception as e:
        print(f"❌ Erreur admin_dashboard: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/corrected_papers', methods=['GET'])
@jwt_required()
def admin_corrected_papers():
    """Renvoie la liste des copies corrigées récentes (ADMIN ONLY)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if not user or user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        papers = session.query(StudentPaper).options(
            joinedload(StudentPaper.student),
            joinedload(StudentPaper.subject)
        ).filter(StudentPaper.corrected_at != None).order_by(StudentPaper.corrected_at.desc()).limit(50).all()

        papers_list = []
        for p in papers:
            papers_list.append({
                'id': p.id,
                'student_name': p.student.full_name if p.student else 'Inconnu',
                'student_email': p.student.email if p.student else 'N/A',
                'subject_title': p.subject.title if p.subject else 'N/A',
                'score': p.score,
                'corrected_at': p.corrected_at.isoformat() if p.corrected_at else None,
                'filename': p.filename
            })

        session.close()
        return jsonify({'papers': papers_list})
    except Exception as e:
        print(f"❌ Erreur admin_corrected_papers: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/users', methods=['GET'])
@jwt_required()
def get_all_users():
    """Liste tous les utilisateurs - ADMIN ONLY"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if not user or user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Acces non autorise'}), 403

        users = session.query(User).order_by(User.created_at.desc()).all()
        users_list = [u.to_dict() for u in users]
        session.close()

        return jsonify(users_list)
    except Exception as e:
        print(f'Erreur get_all_users: {e}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users', methods=['POST'])
@jwt_required()
def create_user():
    try:
        admin_id = int(get_jwt_identity())
        session = get_session()

        admin = session.query(User).filter_by(id=admin_id).first()
        if admin.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        data = request.json
        existing = session.query(User).filter_by(email=data['email']).first()
        if existing:
            session.close()
            return jsonify({'error': 'Cet email est déjà utilisé'}), 400

        role_str = data.get('role', 'student').upper()
        if role_str not in ['STUDENT', 'PROFESSOR', 'ADMIN']:
            session.close()
            return jsonify({'error': 'Rôle invalide'}), 400

        hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')

        new_user = User(
            email=data['email'],
            password_hash=hashed_password,
            full_name=data['full_name'],
            role=UserRole[role_str]
        )

        session.add(new_user)
        session.commit()
        user_dict = new_user.to_dict()

        # Envoyer email avec identifiants
        try:
            email_sent = send_account_created_email(
                user_email=data['email'],
                user_name=data['full_name'],
                role=data.get('role', 'student'),
                temp_password=data['password']
            )
            if email_sent:
                print(f"✅ Email envoyé avec succès à {data['email']}")
            else:
                print(f"⚠️ Échec envoi email à {data['email']}")
        except Exception as email_error:
            print(f"⚠️ Erreur envoi email: {email_error}")

        session.close()

        return jsonify({'success': True, 'message': 'Utilisateur créé avec succès', 'user': user_dict}), 201
    except Exception as e:
        print(f"❌ Erreur create_user: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users/<int:target_user_id>', methods=['PUT'])
@jwt_required()
def update_user(target_user_id):
    try:
        admin_id = int(get_jwt_identity())
        session = get_session()

        admin = session.query(User).filter_by(id=admin_id).first()
        if admin.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        user = session.query(User).filter_by(id=target_user_id).first()
        if not user:
            session.close()
            return jsonify({'error': 'Utilisateur non trouvé'}), 404

        data = request.json

        if 'full_name' in data:
            user.full_name = data['full_name']
        if 'email' in data and data['email'] != user.email:
            existing = session.query(User).filter_by(email=data['email']).first()
            if existing:
                session.close()
                return jsonify({'error': 'Cet email est déjà utilisé'}), 400
            user.email = data['email']
        if 'password' in data and data['password']:
            user.password_hash = bcrypt.generate_password_hash(data['password']).decode('utf-8')
        if 'role' in data:
            role_str = data['role'].upper()
            if role_str in ['STUDENT', 'PROFESSOR', 'ADMIN']:
                user.role = UserRole[role_str]
        if 'is_active' in data:
            user.is_active = data['is_active']

        session.commit()
        user_dict = user.to_dict()
        session.close()

        return jsonify({'success': True, 'message': 'Utilisateur modifié avec succès', 'user': user_dict})
    except Exception as e:
        print(f"❌ Erreur update_user: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users/<int:target_user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(target_user_id):
    """✅ CORRECTION FINALE: Supprimer utilisateur avec TOUTES les dépendances CASCADE"""
    try:
        admin_id = int(get_jwt_identity())
        session = get_session()

        admin = session.query(User).filter_by(id=admin_id).first()
        if admin.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        if admin_id == target_user_id:
            session.close()
            return jsonify({'error': 'Impossible de supprimer votre propre compte'}), 400

        user = session.query(User).filter_by(id=target_user_id).first()
        if not user:
            session.close()
            return jsonify({'error': 'Utilisateur non trouvé'}), 404

        # ✅ ORDRE CORRECT: Réclamations → Historique → Copies → Sujets → User

        # 1. Récupérer les IDs des copies de l'étudiant
        papers_ids = [p.id for p in session.query(StudentPaper).filter_by(student_id=target_user_id).all()]

        if papers_ids:
            from sqlalchemy import or_

            # 2. Supprimer TOUTES les réclamations liées à ces copies
            session.query(Reclamation).filter(
                or_(
                    Reclamation.paper_id.in_(papers_ids),
                    Reclamation.student_id == target_user_id
                )
            ).delete(synchronize_session=False)

            # 3. ✅ NOUVEAU: Supprimer l'historique de correction lié à ces copies
            session.query(CorrectionHistory).filter(
                CorrectionHistory.paper_id.in_(papers_ids)
            ).delete(synchronize_session=False)
        else:
            # Supprimer les réclamations de l'étudiant même s'il n'a pas de copies
            session.query(Reclamation).filter_by(student_id=target_user_id).delete()

        # 4. Mettre à NULL responded_by_id dans les réclamations répondues par cet utilisateur
        reclamations_responded = session.query(Reclamation).filter_by(responded_by_id=target_user_id).all()
        for reclamation in reclamations_responded:
            reclamation.responded_by_id = None

        # 5. ✅ NOUVEAU: Mettre à NULL corrector_id dans l'historique
        histories_corrected = session.query(CorrectionHistory).filter_by(corrector_id=target_user_id).all()
        for history in histories_corrected:
            history.corrector_id = None

        # 6. Maintenant supprimer les copies de l'étudiant
        session.query(StudentPaper).filter_by(student_id=target_user_id).delete()

        # 7. Mettre à NULL corrected_by_id dans les copies corrigées par cet utilisateur
        papers_corrected = session.query(StudentPaper).filter_by(corrected_by_id=target_user_id).all()
        for paper in papers_corrected:
            paper.corrected_by_id = None

        # 8. Supprimer les sujets créés par l'utilisateur
        session.query(Subject).filter_by(creator_id=target_user_id).delete()

        # Nouveau: Supprimer les affectations EC pour professeurs
        session.query(ECAssignment).filter_by(professor_id=target_user_id).delete()

        # Nouveau: Supprimer les inscriptions UE pour étudiants
        session.query(StudentUEEnrollment).filter_by(student_id=target_user_id).delete()

        # 9. Enfin, supprimer l'utilisateur
        session.delete(user)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'Utilisateur supprimé avec succès'})
    except Exception as e:
        print(f"❌ Erreur delete_user: {e}")
        import traceback
        traceback.print_exc()
        session.rollback()
        session.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/students/list', methods=['GET'])
@jwt_required()
def get_students_list():
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        students = session.query(User).filter_by(role=UserRole.STUDENT).order_by(User.full_name).all()
        students_list = [{'id': s.id, 'full_name': s.full_name, 'email': s.email} for s in students]
        session.close()

        return jsonify(students_list)
    except Exception as e:
        print(f"❌ Erreur get_students_list: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES SUJETS
# ============================================================================

@app.route('/api/subjects', methods=['GET'])
@jwt_required()
def get_subjects():
    """Récupérer les sujets - FILTRÉS par professeur"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()

        query = session.query(Subject).options(
            joinedload(Subject.ec).joinedload(EC.ue),
            joinedload(Subject.creator)
        )

        if user.role == UserRole.STUDENT:
            subjects = query.filter_by(is_active=True).order_by(desc(Subject.created_at)).all()
        elif user.role == UserRole.PROFESSOR:
            # Montrer uniquement les sujets créés par ce professeur
            subjects = query.filter(Subject.creator_id == user_id).order_by(desc(Subject.created_at)).all()
        else:
            subjects = query.order_by(desc(Subject.created_at)).all()

        subjects_list = [subject.to_dict() for subject in subjects]
        session.close()
        return jsonify(subjects_list)
    except Exception as e:
        print(f"❌ Erreur get_subjects: {e}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/subjects/<int:subject_id>', methods=['GET'])
@jwt_required()
def get_subject_detail(subject_id):
    """Récupérer les détails d'un sujet spécifique"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()

        subject = session.query(Subject).options(
            joinedload(Subject.ec).joinedload(EC.ue),
            joinedload(Subject.creator)
        ).filter_by(id=subject_id).first()

        if not subject:
            session.close()
            return jsonify({'error': 'Sujet non trouvé'}), 404

        # Vérifier les permissions
        if user.role == UserRole.STUDENT and not subject.is_active:
            session.close()
            return jsonify({'error': 'Sujet non accessible'}), 403

        if user.role == UserRole.PROFESSOR and subject.creator_id != user_id:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        subject_dict = subject.to_dict()
        session.close()

        return jsonify(subject_dict)

    except Exception as e:
        print(f"❌ Erreur get_subject_detail: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/subjects/<int:subject_id>', methods=['DELETE'])
@jwt_required()
def delete_subject(subject_id):
    """✅ CORRECTION COMPLÈTE : Supprimer sujet avec SQLAlchemy pur + gestion cascade"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if not user or user.role not in [UserRole.ADMIN, UserRole.PROFESSOR]:
            session.close()
            return jsonify({'success': False, 'error': 'Non autorisé'}), 403
        
        subject = session.query(Subject).filter_by(id=subject_id).first()
        if not subject:
            session.close()
            return jsonify({'success': False, 'error': 'Sujet non trouvé'}), 404
        
        # Vérifier les permissions (admin ou créateur)
        if user.role == UserRole.PROFESSOR and subject.creator_id != user_id:
            session.close()
            return jsonify({'success': False, 'error': 'Vous ne pouvez supprimer que vos propres sujets'}), 403
        
        # ✅ Supprimer les dépendances dans l'ordre inverse
        
        # 1. Récupérer tous les examens en ligne liés au sujet
        online_exams = session.query(OnlineExam).filter_by(subject_id=subject_id).all()
        
        for exam in online_exams:
            # 2. Pour chaque examen, récupérer les tentatives
            attempts = session.query(ExamAttempt).filter_by(exam_id=exam.id).all()
            
            for attempt in attempts:
                # 3. Supprimer les camera_logs liés à chaque tentative
                session.query(CameraLog).filter_by(attempt_id=attempt.id).delete(synchronize_session=False)
                
                # 4. Supprimer les activity logs
                session.query(ExamActivityLog).filter_by(attempt_id=attempt.id).delete(synchronize_session=False)
            
            # 5. Supprimer les tentatives
            session.query(ExamAttempt).filter_by(exam_id=exam.id).delete(synchronize_session=False)
            
            # 6. Supprimer l'examen
            session.delete(exam)
        
        # 7. Supprimer les copies corrigées liées au sujet
        # Ordre : réclamations → historique → copies
        papers = session.query(StudentPaper).filter_by(subject_id=subject_id).all()
        for paper in papers:
            # Supprimer réclamations
            session.query(Reclamation).filter_by(paper_id=paper.id).delete(synchronize_session=False)
            # Supprimer historique
            session.query(CorrectionHistory).filter_by(paper_id=paper.id).delete(synchronize_session=False)
            # Supprimer la copie
            session.delete(paper)
        
        # 8. Enfin, supprimer le sujet
        session.delete(subject)
        session.commit()
        session.close()
        
        return jsonify({
            'success': True,
            'message': 'Sujet et toutes ses dépendances supprimés avec succès'
        })
        
    except Exception as e:
        session.rollback()
        session.close()
        print(f"❌ Erreur delete_subject: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Erreur lors de la suppression: {str(e)}'
        }), 500

@app.route('/api/subjects/upload', methods=['POST'])
@jwt_required()
def upload_subject():
    """Créer un sujet - maintenant lié à un EC - Amélioré : Vérifier affectation pour prof"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        if 'file' not in request.files:
            session.close()
            return jsonify({'error': 'Aucun fichier fourni'}), 400

        file = request.files['file']
        title = request.form.get('title', 'Sans titre')
        ec_id = request.form.get('ec_id')

        if file.filename == '':
            session.close()
            return jsonify({'error': 'Aucun fichier sélectionné'}), 400

        if not allowed_file(file.filename):
            session.close()
            return jsonify({'error': 'Type de fichier non autorisé. Utilisez PDF, DOCX ou TXT'}), 400

        # Amélioré : Vérifier si prof a droit à cet EC
        if ec_id and user.role == UserRole.PROFESSOR:
            assignment = session.query(ECAssignment).filter_by(ec_id=ec_id, professor_id=user_id).first()
            if not assignment:
                session.close()
                return jsonify({'error': 'Vous n\'êtes pas responsable de cet EC'}), 403

        if ec_id:
            ec = session.query(EC).filter_by(id=ec_id).first()
            if not ec:
                session.close()
                return jsonify({'error': 'EC non trouvé'}), 404

        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"subject_{timestamp}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        content = extract_text_from_file(filepath)

        if not content:
            os.remove(filepath)
            session.close()
            return jsonify({'error': 'Impossible d\'extraire le texte du fichier'}), 400

        system_prompt = """Tu es un expert en évaluation pédagogique.

Ton rôle: Analyser un sujet d'examen et créer un barème de notation détaillé et précis.

Format de sortie OBLIGATOIRE:
=== BARÈME DE NOTATION ===
Question 1 (X points):
- Critère 1: Y points - [description précise]
...
Total: 20 points"""

        rubric = call_claude(system_prompt, content, temperature=0.1)

        new_subject = Subject(
            title=title,
            content=content,
            rubric=rubric,
            filename=filename,
            creator_id=user_id,
            ec_id=int(ec_id) if ec_id else None
        )

        session.add(new_subject)
        session.commit()

        subject_dict = new_subject.to_dict()
        session.close()

        return jsonify({
            'success': True,
            'subject': subject_dict
        })

    except Exception as e:
        print(f"❌ Erreur upload_subject: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES CORRECTION DE COPIES
# ============================================================================

@app.route('/api/papers/upload', methods=['POST'])
@jwt_required()
def upload_paper():
    """Upload et correction de copie avec hash + email - Amélioré : Liée à EC via subject, fenêtre réclamation"""
    try:
        from utils import calculate_file_hash, extract_student_name_from_content

        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()

        if 'file' not in request.files:
            session.close()
            return jsonify({'error': 'Aucun fichier fourni'}), 400

        file = request.files['file']
        subject_id = request.form.get('subject_id')
        student_id = request.form.get('student_id')
        student_name = request.form.get('student_name')

        if not subject_id:
            session.close()
            return jsonify({'error': 'ID du sujet requis'}), 400

        if not student_id and not student_name:
            session.close()
            return jsonify({'error': 'ID ou nom de l\'étudiant requis'}), 400

        subject = session.query(Subject).filter_by(id=subject_id).first()
        if not subject:
            session.close()
            return jsonify({'error': 'Sujet non trouvé'}), 404

        if user.role == UserRole.PROFESSOR and subject.creator_id != user_id:
            session.close()
            return jsonify({'error': 'Vous ne pouvez corriger que vos propres sujets'}), 403

        # ✅ MATCHING INTELLIGENT OBLIGATOIRE
        if student_name and not student_id:
            from utils import match_student_by_name

            # Essayer de matcher avec un étudiant existant
            matched_student = match_student_by_name(student_name, session)

            if matched_student:
                student_id = matched_student.id
                print(f"✅ Étudiant matché: {matched_student.full_name} ({matched_student.email})")
            else:
                # Si aucun match, rejeter la copie avec message clair
                session.close()
                return jsonify({
                    'error': f'Étudiant "{student_name}" non trouvé dans le système',
                    "suggestion": "Veuillez creer cet etudiant via interface Admin",
                    'extracted_name': student_name
                }), 404

        if file.filename == '':
            session.close()
            return jsonify({'error': 'Aucun fichier sélectionné'}), 400

        if not allowed_file(file.filename):
            session.close()
            return jsonify({'error': 'Type de fichier non autorisé'}), 400

        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"paper_{timestamp}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # ✅ CALCUL HASH POUR DÉTECTION DOUBLONS
        file_hash = calculate_file_hash(filepath)

        if file_hash:
            # Vérifier si ce fichier a déjà été uploadé
            existing_paper = session.query(StudentPaper).filter_by(file_hash=file_hash).first()
            if existing_paper:
                os.remove(filepath) # Supprimer le fichier dupliqué
                session.close()
                return jsonify({
                    'error': 'Cette copie a déjà été corrigée',
                    'duplicate': True,
                    'existing_paper_id': existing_paper.id,
                    'student_name': existing_paper.student.full_name if existing_paper.student else 'Inconnu',
                    'score': existing_paper.score
                }), 400

        paper_content = extract_text_from_file(filepath)

        if not paper_content:
            os.remove(filepath)
            session.close()
            return jsonify({'error': 'Impossible d\'extraire le texte du fichier'}), 400

        # ✅ EXTRACTION NOM ÉTUDIANT
        extracted_name = extract_student_name_from_content(paper_content)

        # ✅ MATCHING AUTOMATIQUE SI NOM EXTRAIT
        if extracted_name and not student_id:
            from utils import match_student_by_name
            matched_student = match_student_by_name(extracted_name, session)

            if matched_student:
                student_id = matched_student.id
                print(f"✅ Étudiant auto-matché via extraction: {matched_student.full_name} ({matched_student.email})")
            else:
                print(f"⚠️ Nom extrait '{extracted_name}' non matché - copie rejetée")
                os.remove(filepath)
                session.close()
                return jsonify({
                    'error': f'Étudiant "{extracted_name}" non trouvé',
                    'suggestion': 'Créez d\'abord cet étudiant via Admin -> Utilisateurs',
                    'extracted_name': extracted_name
                }), 404

        system_prompt = """Tu es un correcteur d'examen EXTRÊMEMENT rigoureux.

IMPORTANT: Tu DOIS terminer ta correction par une ligne contenant EXACTEMENT:
Note totale: XX.XX/20

Format de correction:
=== CORRECTION DÉTAILLÉE ===
[Évaluation détaillée de chaque question]

=== RÉSUMÉ ===
Points forts: [...]
Points à améliorer: [...]

Note totale: XX.XX/20
"""

        user_message = f"""SUJET D'EXAMEN:
{subject.content}

BARÈME DE NOTATION:
{subject.rubric}

COPIE À CORRIGER:
{paper_content}

RAPPEL: Tu DOIS finir par "Note totale: XX.XX/20" """

        result = call_claude(system_prompt, user_message, temperature=0.15)
        score = extract_score_from_correction(result)

        corrected_at = utcnow()
        new_paper = StudentPaper(
            subject_id=subject_id,
            student_id=student_id,
            content=paper_content,
            grade=result,
            score=score,
            filename=filename,
            file_hash=file_hash,
            extracted_student_name=extracted_name,
            corrected_by_id=user_id if user.role in [UserRole.PROFESSOR, UserRole.ADMIN] else None,
            corrected_at=corrected_at,
            reclamation_window_end=corrected_at + timedelta(days=7)  # Nouveau: Fenêtre de 7 jours
        )

        session.add(new_paper)
        session.commit()

        # ✅ ENVOI EMAIL AUTOMATIQUE APRÈS CORRECTION AVEC PDF EN PIÈCE JOINTE
        try:
            student_obj = session.query(User).filter_by(id=student_id).first()
            if student_obj and student_obj.email and '@temp.edu' not in student_obj.email:
                # Générer PDF de la copie corrigée
                paper_data = {
                    'student_name': student_obj.full_name,
                    'subject_title': subject.title,
                    'score': score,
                    'grade': result,
                    'corrected_at': corrected_at.isoformat()
                }
                pdf_path = f"exports/copie_{new_paper.id}.pdf"
                generate_corrected_paper_pdf(paper_data, pdf_path)

                # Envoi email avec PDF attaché
                attachments = [{'filename': f'copie_{new_paper.id}.pdf', 'path': pdf_path}]
                email_sent = send_paper_corrected_email(
                    student_email=student_obj.email,
                    student_name=student_obj.full_name,
                    subject_title=subject.title,
                    score=score,
                    paper_id=new_paper.id,
                    attachments=attachments  # Nouveau: Pièce jointe
                )
                if email_sent:
                    new_paper.email_sent = True
                    session.commit()
                    print(f"✅ Email avec PDF envoyé à {student_obj.email}")
                else:
                    print(f"⚠️ Échec envoi email à {student_obj.email}")
                # Supprimer PDF temporaire si besoin
                os.remove(pdf_path)
        except Exception as email_error:
            print(f"⚠️ Erreur envoi email: {email_error}")

        paper_dict = new_paper.to_dict()
        session.close()

        return jsonify({
            'success': True,
            'paper': paper_dict,
            'duplicate_check': 'passed',
            'extracted_name': extracted_name,
            'email_sent': new_paper.email_sent
        })

    except Exception as e:
        print(f"❌ Erreur upload_paper: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/papers/upload-batch', methods=['POST'])
@jwt_required()
def upload_papers_batch():
    """Correction en lot avec accès dossier - Amélioré : Fenêtre réclamation, PDF en email"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        subject_id = request.form.get('subject_id')
        if not subject_id:
            session.close()
            return jsonify({'error': 'ID du sujet requis'}), 400

        subject = session.query(Subject).filter_by(id=subject_id).first()
        if not subject:
            session.close()
            return jsonify({'error': 'Sujet non trouvé'}), 404

        if user.role == UserRole.PROFESSOR and subject.creator_id != user_id:
            session.close()
            return jsonify({'error': 'Vous ne pouvez corriger que vos propres sujets'}), 403

        files = request.files.getlist('files')
        if not files:
            session.close()
            return jsonify({'error': 'Aucun fichier fourni'}), 400

        results = []
        errors = []

        system_prompt = """Tu es un correcteur d'examen EXTRÊMEMENT rigoureux.

IMPORTANT: Tu DOIS terminer ta correction par:
Note totale: XX.XX/20

Format:
=== CORRECTION DÉTAILLÉE ===
[Évaluation]

Note totale: XX.XX/20"""

        for idx, file in enumerate(files):
            try:
                if file.filename == '':
                    errors.append(f"Fichier {idx+1}: Nom vide")
                    continue

                if not allowed_file(file.filename):
                    errors.append(f"Fichier {idx+1}: Type non autorisé")
                    continue

                filename = secure_filename(file.filename)
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                filename_saved = f"paper_{timestamp}_{idx}_{filename}"
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename_saved)
                file.save(filepath)

                # Calculer hash pour éviter doublons
                file_hash = calculate_file_hash(filepath)
                if file_hash:
                    existing = session.query(StudentPaper).filter_by(file_hash=file_hash).first()
                    if existing:
                        # Fichier déjà corrigé -> ignorer
                        os.remove(filepath)
                        results.append({
                            'filename': file.filename,
                            'student_name': existing.student.full_name if existing.student else 'Inconnu',
                            'score': existing.score,
                            'success': False,
                            'duplicate': True,
                            'message': 'Copie déjà corrigée (hash trouvé)'
                        })
                        continue

                paper_content = extract_text_from_file(filepath)

                if not paper_content:
                    os.remove(filepath)
                    errors.append(f"Fichier {idx+1}: Extraction impossible")
                    continue

                # Essayer d'abord d'extraire le nom depuis le contenu (meilleure précision)
                extracted_name = extract_student_name_from_content(paper_content)
                student = None
                student_name = None

                if extracted_name:
                    student = match_student_by_name(extracted_name, session)
                    student_name = extracted_name

                # Si pas de match via extraction, tenter via nom fichier
                if not student:
                    guessed_name = os.path.splitext(file.filename)[0].replace('copie_', '').replace('_', ' ').title()
                    student = match_student_by_name(guessed_name, session)
                    student_name = student_name or guessed_name

                # Si toujours pas de match, créer étudiant temporaire (adresse @temp.edu)
                if not student:
                    temp_email = f"{student_name.lower().replace(' ', '.')}@temp.edu"
                    temp_password = bcrypt.generate_password_hash('TempPassword123').decode('utf-8')
                    student = User(
                        email=temp_email,
                        password_hash=temp_password,
                        full_name=student_name,
                        role=UserRole.STUDENT
                    )
                    session.add(student)
                    session.flush()

                # Préparer prompt et corriger
                user_message = f"""SUJET: {subject.content}
BARÈME: {subject.rubric}
COPIE: {paper_content}

RAPPEL: Termine par "Note totale: XX.XX/20" """

                result = call_claude(system_prompt, user_message, temperature=0.15)
                score = extract_score_from_correction(result)

                corrected_at = utcnow()
                new_paper = StudentPaper(
                    subject_id=subject_id,
                    student_id=student.id,
                    content=paper_content,
                    grade=result,
                    score=score,
                    filename=filename_saved,
                    file_hash=file_hash,
                    corrected_by_id=user_id,
                    corrected_at=corrected_at,
                    reclamation_window_end=corrected_at + timedelta(days=7)
                )

                session.add(new_paper)
                session.flush()  # Pour avoir l'ID

                # Envoi email avec PDF si adresse valide
                if student.email and '@temp.edu' not in student.email and '@noemail.local' not in student.email and student.has_email:
                    paper_data = {
                        'student_name': student.full_name,
                        'subject_title': subject.title,
                        'score': score,
                        'grade': result,
                        'corrected_at': corrected_at.isoformat()
                    }
                    pdf_path = f"exports/copie_{new_paper.id}.pdf"
                    generate_corrected_paper_pdf(paper_data, pdf_path)

                    attachments = [{'filename': f'copie_{new_paper.id}.pdf', 'path': pdf_path}]
                    email_sent = send_paper_corrected_email(
                        student_email=student.email,
                        student_name=student.full_name,
                        subject_title=subject.title,
                        score=score,
                        paper_id=new_paper.id,
                        attachments=attachments
                    )
                    if email_sent:
                        new_paper.email_sent = True
                    os.remove(pdf_path)

                results.append({
                    'filename': file.filename,
                    'student_name': student_name,
                    'score': score,
                    'success': True
                })

            except Exception as e:
                errors.append(f"Fichier {idx+1}: {str(e)}")

        session.commit()
        session.close()

        return jsonify({
            'success': True,
            'corrected': len(results),
            'errors': len(errors),
            'results': results,
            'error_details': errors
        })

    except Exception as e:
        print(f"❌ Erreur batch: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/papers/subject/<int:subject_id>', methods=['GET'])
@jwt_required()
def get_papers_by_subject(subject_id):
    """Récupérer les copies d'un sujet"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        subject = session.query(Subject).filter_by(id=subject_id).first()
        if not subject:
            session.close()
            return jsonify({'error': 'Sujet non trouvé'}), 404

        if user.role == UserRole.PROFESSOR and subject.creator_id != user_id:
            session.close()
            return jsonify({'error': 'Vous ne pouvez voir que les copies de vos propres sujets'}), 403

        papers = session.query(StudentPaper).options(
            joinedload(StudentPaper.student)
        ).filter_by(subject_id=subject_id).all()

        papers_list = []
        for paper in papers:
            papers_list.append({
                'id': paper.id,
                'student_id': paper.student_id,
                'student_name': paper.student.full_name if paper.student else 'Inconnu',
                'student_email': paper.student.email if paper.student else 'N/A',
                'score': paper.score,
                'grade': paper.grade,
                'content': paper.content,
                'filename': paper.filename,
                'corrected_at': paper.corrected_at.isoformat() if paper.corrected_at else None,
                'created_at': paper.created_at.isoformat() if paper.created_at else None
            })

        session.close()
        return jsonify(papers_list)

    except Exception as e:
        print(f"❌ Erreur get_papers_by_subject: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/papers/detail/<int:paper_id>', methods=['GET'])
@jwt_required()
def get_paper_detail(paper_id):
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()

        paper = session.query(StudentPaper).options(
            joinedload(StudentPaper.subject),
            joinedload(StudentPaper.student)
        ).filter_by(id=paper_id).first()

        if not paper:
            session.close()
            return jsonify({'error': 'Copie non trouvée'}), 404

        if user.role == UserRole.STUDENT and paper.student_id != user_id:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        if user.role == UserRole.PROFESSOR and paper.subject.creator_id != user_id:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        paper_dict = paper.to_dict()
        session.close()

        return jsonify(paper_dict)

    except Exception as e:
        print(f"❌ Erreur get_paper_detail: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES STATISTIQUES
# ============================================================================

@app.route('/api/statistics/<int:subject_id>', methods=['GET'])
@jwt_required()
def get_subject_statistics(subject_id):
    """Statistiques d'un sujet"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        subject = session.query(Subject).filter_by(id=subject_id).first()
        if not subject:
            session.close()
            return jsonify({'error': 'Sujet non trouvé'}), 404

        if user.role == UserRole.PROFESSOR and subject.creator_id != user_id:
            session.close()
            return jsonify({'error': 'Vous ne pouvez voir que les statistiques de vos propres sujets'}), 403

        papers = session.query(StudentPaper).options(
            joinedload(StudentPaper.student)
        ).filter_by(subject_id=subject_id).all()

        if not papers:
            session.close()
            return jsonify({
                'subject_id': subject_id,
                'subject_title': subject.title,
                'totalStudents': 0,
                'averageScore': 0,
                'medianScore': 0,
                'minScore': 0,
                'maxScore': 0,
                'stdDeviation': 0,
                'passRate': 0,
                'scoreDistribution': {'0-5': 0, '5-10': 0, '10-15': 0, '15-20': 0},
                'papers': []
            })

        scores = [p.score for p in papers if p.score is not None]

        if not scores:
            session.close()
            return jsonify({
                'subject_id': subject_id,
                'subject_title': subject.title,
                'totalStudents': len(papers),
                'averageScore': 0,
                'medianScore': 0,
                'minScore': 0,
                'maxScore': 0,
                'stdDeviation': 0,
                'passRate': 0,
                'scoreDistribution': {'0-5': 0, '5-10': 0, '10-15': 0, '15-20': 0},
                'papers': []
            })

        scores_sorted = sorted(scores)
        average = sum(scores) / len(scores)
        median = scores_sorted[len(scores_sorted) // 2] if len(scores_sorted) % 2 == 1 else (scores_sorted[len(scores_sorted) // 2 - 1] + scores_sorted[len(scores_sorted) // 2]) / 2
        min_score = min(scores)
        max_score = max(scores)
        std_dev = statistics.stdev(scores) if len(scores) > 1 else 0
        pass_rate = (sum(1 for s in scores if s >= 10) / len(scores)) * 100

        distribution = {
            '0-5': sum(1 for s in scores if 0 <= s < 5),
            '5-10': sum(1 for s in scores if 5 <= s < 10),
            '10-15': sum(1 for s in scores if 10 <= s < 15),
            '15-20': sum(1 for s in scores if 15 <= s <= 20)
        }

        papers_details = []
        for paper in papers:
            papers_details.append({
                'id': paper.id,
                'student_name': paper.student.full_name if paper.student else 'Inconnu',
                'student_email': paper.student.email if paper.student else 'N/A',
                'score': paper.score,
                'corrected_at': paper.corrected_at.isoformat() if paper.corrected_at else None,
                'filename': paper.filename
            })

        session.close()

        return jsonify({
            'subject_id': subject_id,
            'subject_title': subject.title,
            'totalStudents': len(papers),
            'averageScore': round(average, 2),
            'medianScore': round(median, 2),
            'minScore': min_score,
            'maxScore': max_score,
            'stdDeviation': round(std_dev, 2),
            'passRate': round(pass_rate, 2),
            'scoreDistribution': distribution,
            'papers': papers_details
        })

    except Exception as e:
        print(f"❌ Erreur get_subject_statistics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES RÉCLAMATIONS - Amélioré : Limite 1 semaine, traitement IA
# ============================================================================

@app.route('/api/reclamations', methods=['GET'])
@jwt_required()
def get_reclamations():
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()

        query = session.query(Reclamation).options(
            joinedload(Reclamation.student),
            joinedload(Reclamation.paper).joinedload(StudentPaper.subject)
        )

        if user.role == UserRole.STUDENT:
            reclamations = query.filter_by(student_id=user_id).order_by(desc(Reclamation.created_at)).all()
        else:
            reclamations = query.order_by(desc(Reclamation.created_at)).all()

        reclamations_list = []
        for r in reclamations:
            reclamations_list.append({
                'id': r.id,
                'paper_id': r.paper_id,
                'student_id': r.student_id,
                'student_name': r.student.full_name if r.student else 'Inconnu',
                'subject_title': r.paper.subject.title if r.paper and r.paper.subject else 'Sujet supprimé',
                'reason': r.reason,
                'status': r.status.value,
                'response': r.response,
                'ia_decision': r.ia_decision,
                'ia_proposed_status': r.ia_proposed_status,
                'ia_proposed_score': r.ia_proposed_score,
                'ia_proposed_grade': r.ia_proposed_grade,
                'ia_proposed_reason': r.ia_proposed_reason,
                'ia_processed_at': r.ia_processed_at.isoformat() if r.ia_processed_at else None,
                'responded_by_id': r.responded_by_id,
                'responder_name': r.responder.full_name if r.responder else None,
                'created_at': r.created_at.isoformat() if r.created_at else None,
                'updated_at': r.updated_at.isoformat() if r.updated_at else None
            })

        session.close()
        return jsonify(reclamations_list)
    except Exception as e:
        print(f"❌ Erreur get_reclamations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/reclamations', methods=['POST'])
@jwt_required()
def create_reclamation():
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.STUDENT:
            session.close()
            return jsonify({'error': 'Seuls les étudiants peuvent créer des réclamations'}), 403

        data = request.json
        paper_id = data.get('paper_id')
        reason = data.get('reason')

        if not paper_id or not reason:
            session.close()
            return jsonify({'error': 'Données manquantes'}), 400

        paper = session.query(StudentPaper).filter_by(id=paper_id).first()
        if not paper:
            session.close()
            return jsonify({'error': 'Copie non trouvée'}), 404

        if paper.student_id != user_id:
            session.close()
            return jsonify({'error': 'Cette copie ne vous appartient pas'}), 403

        # Nouveau : Vérifier fenêtre de réclamation (1 semaine)
        if paper.reclamation_window_end < utcnow():
            session.close()
            return jsonify({'error': 'Période de réclamation expirée (7 jours après correction)'}), 400

        existing = session.query(Reclamation).filter_by(paper_id=paper_id, status=ReclamationStatus.PENDING).first()
        if existing:
            session.close()
            return jsonify({'error': 'Une réclamation est déjà en cours'}), 400

        reclamation = Reclamation(paper_id=paper_id, student_id=user_id, reason=reason)
        session.add(reclamation)
        session.commit()

        reclamation_dict = {
            'id': reclamation.id,
            'paper_id': reclamation.paper_id,
            'student_id': reclamation.student_id,
            'reason': reclamation.reason,
            'status': reclamation.status.value,
            'created_at': reclamation.created_at.isoformat() if reclamation.created_at else None
        }
        session.close()

        return jsonify({'success': True, 'reclamation': reclamation_dict}), 201
    except Exception as e:
        print(f"❌ Erreur create_reclamation: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/reclamations/<int:reclamation_id>', methods=['PUT'])
@jwt_required()
def respond_reclamation(reclamation_id):
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        reclamation = session.query(Reclamation).filter_by(id=reclamation_id).first()
        if not reclamation:
            session.close()
            return jsonify({'error': 'Réclamation non trouvée'}), 404

        data = request.json
        status = data.get('status')
        response = data.get('response')
        new_score = data.get('new_score')

        if not status or status not in ['resolved', 'rejected']:
            session.close()
            return jsonify({'error': 'Statut invalide'}), 400

        reclamation.status = ReclamationStatus[status.upper()]
        reclamation.response = response
        reclamation.responded_by_id = user_id
        reclamation.updated_at = utcnow()

        if status == 'resolved' and new_score is not None:
            paper = session.query(StudentPaper).filter_by(id=reclamation.paper_id).first()
            if paper:
                history = CorrectionHistory(
                    paper_id=paper.id,
                    corrector_id=user_id,
                    old_score=paper.score,
                    new_score=new_score,
                    old_grade=paper.grade,
                    new_grade=f"Note modifiée suite à réclamation: {new_score}/20",
                    reason=f"Réclamation acceptée: {response}"
                )
                session.add(history)
                paper.score = new_score
                paper.corrected_at = utcnow()

        session.commit()

        reclamation_dict = {
            'id': reclamation.id,
            'status': reclamation.status.value,
            'response': reclamation.response,
            'updated_at': reclamation.updated_at.isoformat() if reclamation.updated_at else None
        }
        session.close()

        return jsonify({'success': True, 'reclamation': reclamation_dict})
    except Exception as e:
        print(f"❌ Erreur respond_reclamation: {e}")
        return jsonify({'error': str(e)}), 500

# NOUVEAU : Traitement IA des réclamations
@app.route('/api/reclamations/<int:reclamation_id>/process_ia', methods=['POST'])
@jwt_required()
def process_reclamation_ia(reclamation_id):
    """Traiter une réclamation avec IA - Accepter/Rejeter + Recalcul note si acceptée"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        reclamation = session.query(Reclamation).filter_by(id=reclamation_id).first()
        if not reclamation:
            session.close()
            return jsonify({'error': 'Réclamation non trouvée'}), 404

        if reclamation.status != ReclamationStatus.PENDING:
            session.close()
            return jsonify({'error': 'Réclamation déjà traitée'}), 400

        paper = reclamation.paper
        subject = paper.subject

        system_prompt = """Tu es un arbitre impartial pour les réclamations de notes d'examen.

Analyse la réclamation de l'étudiant, la copie originale, la correction originale et le barème.
Décide si la réclamation est valide.

Format de sortie OBLIGATOIRE:
=== DÉCISION ===
[RESOLVED ou REJECTED]

=== RAISON ===
[Explication détaillée]

=== NOUVELLE NOTE ===
Si RESOLVED: XX.XX/20
Si REJECTED: Note originale inchangée

=== NOUVELLE CORRECTION ===
Si RESOLVED: Correction révisée complète
Si REJECTED: Correction originale inchangée"""

        user_message = f"""SUJET: {subject.content}

BARÈME: {subject.rubric}

COPIE ÉTUDIANT: {paper.content}

CORRECTION ORIGINALE: {paper.grade} (Note: {paper.score}/20)

RÉCLAMATION ÉTUDIANT: {reclamation.reason}

Analyse et décide."""

        ia_response = call_claude(system_prompt, user_message, temperature=0.1)

        # Extraire décision de l'IA
        decision_match = re.search(r'=== DÉCISION ===\n(RESOLVED|REJECTED)', ia_response)
        reason_match = re.search(r'=== RAISON ===\n(.*?)=== NOUVELLE NOTE ===', ia_response, re.DOTALL)
        new_score_match = re.search(r'=== NOUVELLE NOTE ===\n(.*?)=== NOUVELLE CORRECTION ===', ia_response, re.DOTALL)
        new_grade_match = re.search(r'=== NOUVELLE CORRECTION ===\n(.*)', ia_response, re.DOTALL)

        if not decision_match:
            session.close()
            return jsonify({'error': 'Réponse IA invalide'}), 500

        decision = decision_match.group(1)
        reason = reason_match.group(1).strip() if reason_match else ''
        new_grade = new_grade_match.group(1).strip() if new_grade_match else paper.grade

        new_score = paper.score
        if decision == 'RESOLVED' and new_score_match:
            new_score_str = new_score_match.group(1).strip()
            new_score = extract_score_from_correction(new_score_str)

        # Stocker la proposition de l'IA sans appliquer automatiquement la décision
        reclamation.ia_decision = ia_response
        reclamation.ia_proposed_status = 'resolved' if decision == 'RESOLVED' else 'rejected'
        reclamation.ia_proposed_reason = reason
        reclamation.ia_proposed_grade = new_grade if decision == 'RESOLVED' else None
        reclamation.ia_proposed_score = new_score if decision == 'RESOLVED' else paper.score
        reclamation.ia_processed_at = utcnow()
        # Ne change pas le statut (reste PENDING) — la décision finale doit être approuvée par un professeur
        reclamation.updated_at = utcnow()

        session.commit()
        session.close()

        return jsonify({'success': True, 'decision': decision, 'ia_response': ia_response})
    except Exception as e:
        print(f"❌ Erreur process_reclamation_ia: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES PROFESSEUR
# ============================================================================

# Endpoint: Appliquer la proposition IA (doit être approuvé par le professeur propriétaire du sujet)
@app.route('/api/reclamations/<int:reclamation_id>/apply_proposal', methods=['POST'])
@jwt_required()
def apply_ai_proposal(reclamation_id):
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        reclamation = session.query(Reclamation).options(joinedload(Reclamation.paper).joinedload(StudentPaper.subject)).filter_by(id=reclamation_id).first()
        if not reclamation:
            session.close()
            return jsonify({'error': 'Réclamation introuvable'}), 404

        paper = reclamation.paper
        subject = paper.subject

        # Permissions: admin or professeur propriétaire du sujet
        if user.role != UserRole.ADMIN and not (user.role == UserRole.PROFESSOR and subject and subject.creator_id == user_id):
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        # Vérifier qu'il existe une proposition IA
        if not reclamation.ia_proposed_status:
            session.close()
            return jsonify({'error': 'Aucune proposition IA disponible pour cette réclamation'}), 400

        # Appliquer la proposition IA
        old_score = paper.score
        old_grade = paper.grade
        new_score = reclamation.ia_proposed_score or old_score
        new_grade = reclamation.ia_proposed_grade or old_grade

        history = CorrectionHistory(
            paper_id=paper.id,
            corrector_id=user_id,
            old_score=old_score,
            new_score=new_score,
            old_grade=old_grade,
            new_grade=new_grade,
            reason=f"Application de la proposition IA: {reclamation.ia_proposed_reason or 'N/A'}"
        )
        session.add(history)

        paper.score = new_score
        paper.grade = new_grade
        paper.corrected_at = utcnow()

        reclamation.status = ReclamationStatus.RESOLVED
        reclamation.response = reclamation.ia_proposed_reason or 'Proposition IA acceptée'
        reclamation.responded_by_id = user_id
        reclamation.updated_at = utcnow()

        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'Proposition IA appliquée'})

    except Exception as e:
        print(f"❌ Erreur apply_ai_proposal: {e}")
        return jsonify({'error': str(e)}), 500


# Endpoint: Rejeter la proposition IA (professeur)
@app.route('/api/reclamations/<int:reclamation_id>/reject_proposal', methods=['POST'])
@jwt_required()
def reject_ai_proposal(reclamation_id):
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        reclamation = session.query(Reclamation).options(joinedload(Reclamation.paper).joinedload(StudentPaper.subject)).filter_by(id=reclamation_id).first()
        if not reclamation:
            session.close()
            return jsonify({'error': 'Réclamation introuvable'}), 404

        paper = reclamation.paper
        subject = paper.subject

        # Permissions: admin or professeur propriétaire du sujet
        if user.role != UserRole.ADMIN and not (user.role == UserRole.PROFESSOR and subject and subject.creator_id == user_id):
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        # Rejeter la proposition IA
        reclamation.status = ReclamationStatus.REJECTED
        payload = request.get_json() or {}
        reclamation.response = payload.get('response', 'Proposition IA rejetée par le professeur')
        reclamation.responded_by_id = user_id
        reclamation.updated_at = utcnow()

        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'Proposition IA rejetée'})

    except Exception as e:
        print(f"❌ Erreur reject_ai_proposal: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/professor/dashboard', methods=['GET'])
@jwt_required()
def professor_dashboard():
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.PROFESSOR:
            session.close()
            return jsonify({'error': 'Accès réservé aux professeurs'}), 403

        my_subjects = session.query(Subject).filter_by(creator_id=user_id).count()
        papers_corrected = session.query(StudentPaper).filter_by(corrected_by_id=user_id).count()

        dashboard_data = {
            'my_subjects': my_subjects,
            'papers_corrected': papers_corrected
        }

        session.close()
        return jsonify(dashboard_data)
    except Exception as e:
        print(f"❌ Erreur professor_dashboard: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES ÉTUDIANT
# ============================================================================

@app.route('/api/student/papers', methods=['GET'])
@jwt_required()
def get_student_papers():
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.STUDENT:
            session.close()
            return jsonify({'error': 'Accès réservé aux étudiants'}), 403

        papers = session.query(StudentPaper).options(
            joinedload(StudentPaper.subject)
        ).filter_by(student_id=user_id).order_by(desc(StudentPaper.created_at)).all()

        papers_list = [paper.to_dict() for paper in papers]
        session.close()
        return jsonify(papers_list)
    except Exception as e:
        print(f"❌ Erreur get_student_papers: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# MAIN
# ============================================================================

# Enregistrer route export PDF
register_export_route(app)
register_csv_routes(app)

@app.route('/api/online_exams', methods=['GET'])
@jwt_required()
def get_online_exams():
    """Liste des examens en ligne"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        user = session.query(User).filter_by(id=user_id).first()
        
        query = session.query(OnlineExam).options(
            joinedload(OnlineExam.subject),
            joinedload(OnlineExam.creator)
        )
        
        if user.role == UserRole.STUDENT:
            # Étudiants : seulement les examens actifs/planifiés
            exams = query.filter(OnlineExam.status.in_([ExamStatus.SCHEDULED, ExamStatus.ACTIVE])).all()
        elif user.role == UserRole.PROFESSOR:
            # Professeurs : leurs propres examens
            exams = query.filter_by(created_by_id=user_id).all()
        else:
            # Admin : tous
            exams = query.all()
        
        exams_list = [exam.to_dict() for exam in exams]
        session.close()
        return jsonify(exams_list)
    except Exception as e:
        print(f"❌ Erreur get_online_exams: {e}")
        return jsonify({'error': str(e)}), 500

# Exemple pour l'endpoint create_online_exam (ligne ~1570)
@app.route('/api/online_exams', methods=['POST'])
@jwt_required()
def create_online_exam():
    """Créer un examen en ligne — le frontend envoie déjà du UTC via toISOString()"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès réservé aux professeurs et administrateurs'}), 403

        data = request.json

        # Validation
        required_fields = ['subject_id', 'title', 'start_time', 'end_time']
        for field in required_fields:
            if field not in data:
                session.close()
                return jsonify({'error': f'Le champ "{field}" est requis'}), 400

        # Vérifier le sujet
        subject = session.query(Subject).filter_by(id=data['subject_id']).first()
        if not subject:
            session.close()
            return jsonify({'error': 'Le sujet sélectionné n\'existe pas'}), 404

        # Le frontend envoie la valeur brute du datetime-local + "Z"
        # (ex: "2026-03-30T18:05:00Z"). Dakar = UTC+0, donc la valeur
        # saisie EST déjà l'heure UTC. On parse puis on stocke naïf (sans tzinfo)
        # pour éviter que psycopg2 ne convertisse en Europe/Berlin avant stockage.
        try:
            raw_start = data['start_time'].strip().replace('Z', '+00:00')
            raw_end   = data['end_time'].strip().replace('Z', '+00:00')
            if '+' not in raw_start and raw_start[-6:] != '+00:00':
                raw_start += '+00:00'
            if '+' not in raw_end and raw_end[-6:] != '+00:00':
                raw_end += '+00:00'
            # Convertir en UTC puis supprimer tzinfo → stockage naïf UTC dans PG
            start_time = datetime.fromisoformat(raw_start).astimezone(timezone.utc).replace(tzinfo=None)
            end_time   = datetime.fromisoformat(raw_end).astimezone(timezone.utc).replace(tzinfo=None)

            # Validation : Fin > Début
            if end_time <= start_time:
                session.close()
                return jsonify({'error': 'La date de fin doit être après la date de début'}), 400

            # Calcul durée auto en minutes
            duration_minutes = int((end_time - start_time).total_seconds() / 60)
            if duration_minutes <= 0 or duration_minutes > 1440:  # Max 24h
                session.close()
                return jsonify({'error': 'Durée invalide (doit être entre 1 min et 24h)'}), 400

        except ValueError as ve:
            session.close()
            return jsonify({'error': f'Format de date invalide: {str(ve)}'}), 400
       
        # Créer l'examen avec durée calculée
        exam = OnlineExam(
            subject_id=data['subject_id'],
            title=data['title'],
            instructions=data.get('instructions', ''),
            duration_minutes=duration_minutes,  # Auto-calculé
            start_time=start_time,
            end_time=end_time,
            max_tab_switches=data.get('max_tab_switches', 2),
            enable_copy_paste=data.get('enable_copy_paste', False),
            enable_right_click=data.get('enable_right_click', False),
            randomize_questions=data.get('randomize_questions', False),
            max_no_face_count=data.get('max_no_face_count', 10),
            ban_on_devtools=data.get('ban_on_devtools', True),
            status=ExamStatus.SCHEDULED,
            created_by_id=user_id
        )
       
        session.add(exam)
        session.commit()
        exam_dict = exam.to_dict()
        print(f"✅ Examen créé: {exam.title} stocké de {start_time} à {end_time} UTC (durée: {duration_minutes} min)")
        session.close()
       
        return jsonify({'success': True, 'exam': exam_dict}), 201
    except Exception as e:
        print(f"❌ Erreur create_online_exam: {e}")
        return jsonify({'error': 'Erreur lors de la création de l\'examen'}), 500

@app.route('/api/online_exams/<int:exam_id>/activate', methods=['POST'])
@jwt_required()
def activate_online_exam(exam_id):
    """Activer un examen (le rendre disponible aux étudiants)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        exam = session.query(OnlineExam).filter_by(id=exam_id).first()
        if not exam:
            session.close()
            return jsonify({'error': 'Examen non trouvé'}), 404
        
        # Vérifier propriété (prof) ou admin
        if user.role == UserRole.PROFESSOR and exam.created_by_id != user_id:
            session.close()
            return jsonify({'error': 'Vous ne pouvez activer que vos propres examens'}), 403
        
        # Passer en statut ACTIVE
        exam.status = ExamStatus.ACTIVE
        session.commit()
        
        exam_dict = exam.to_dict()
        session.close()
        
        return jsonify({'success': True, 'exam': exam_dict})
    except Exception as e:
        print(f"❌ Erreur activate_online_exam: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/online_exams/<int:exam_id>/close', methods=['POST'])
@jwt_required()
def close_online_exam(exam_id):
    """Fermer un examen (terminer)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        exam = session.query(OnlineExam).filter_by(id=exam_id).first()
        if not exam:
            session.close()
            return jsonify({'error': 'Examen non trouvé'}), 404
        
        if user.role == UserRole.PROFESSOR and exam.created_by_id != user_id:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        # Passer en statut CLOSED
        exam.status = ExamStatus.CLOSED
        session.commit()
        
        exam_dict = exam.to_dict()
        session.close()
        
        return jsonify({'success': True, 'exam': exam_dict})
    except Exception as e:
        print(f"❌ Erreur close_online_exam: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/online_exams/<int:exam_id>', methods=['DELETE'])
@jwt_required()
def delete_online_exam(exam_id):
    """Supprimer un examen en ligne (admin/professeur propriétaire uniquement)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        exam = session.query(OnlineExam).filter_by(id=exam_id).first()
        if not exam:
            session.close()
            return jsonify({'error': 'Examen non trouvé'}), 404
        
        # Vérifier propriété (prof) ou admin
        if user.role == UserRole.PROFESSOR and exam.created_by_id != user_id:
            session.close()
            return jsonify({'error': 'Vous ne pouvez supprimer que vos propres examens'}), 403

        # Suppression explicite dans l'ordre pour éviter les erreurs SQLAlchemy de cascade
        attempt_ids = [a.id for a in session.query(ExamAttempt.id).filter_by(exam_id=exam_id).all()]
        if attempt_ids:
            session.query(CameraLog).filter(CameraLog.attempt_id.in_(attempt_ids)).delete(synchronize_session=False)
            session.query(ExamActivityLog).filter(ExamActivityLog.attempt_id.in_(attempt_ids)).delete(synchronize_session=False)
            session.query(ExamAttempt).filter(ExamAttempt.id.in_(attempt_ids)).delete(synchronize_session=False)

        session.delete(exam)
        session.commit()
        session.close()

        return jsonify({'success': True, 'message': 'Examen supprimé avec succès'})
    except Exception as e:
        print(f"❌ Erreur delete_online_exam: {e}")
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/online_exams/<int:exam_id>/details', methods=['GET'])
@jwt_required()
def get_online_exam_details(exam_id):
    """Récupérer les détails complets d'un examen (avec contenu du sujet) - Pour composition étudiants"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        
        exam = session.query(OnlineExam).options(
            joinedload(OnlineExam.subject),
            joinedload(OnlineExam.creator)
        ).filter_by(id=exam_id).first()
        
        if not exam:
            session.close()
            return jsonify({'error': 'Examen non trouvé'}), 404
        
        # Vérifier les permissions
        if user.role == UserRole.STUDENT:
            # Étudiants : seulement les examens actifs dans la plage horaire
            now = utcnow()
            start_time = exam.start_time if exam.start_time.tzinfo else exam.start_time.replace(tzinfo=timezone.utc)
            end_time = exam.end_time if exam.end_time.tzinfo else exam.end_time.replace(tzinfo=timezone.utc)
            
            if exam.status != ExamStatus.ACTIVE or now < start_time or now > end_time:
                session.close()
                return jsonify({'error': 'Examen non disponible actuellement'}), 403
        
        elif user.role == UserRole.PROFESSOR:
            # Professeurs : seulement leurs propres examens
            if exam.created_by_id != user_id:
                session.close()
                return jsonify({'error': 'Accès non autorisé'}), 403
        
        # Préparer la réponse avec les détails complets
        exam_dict = exam.to_dict()
        
        # Ajouter le contenu du sujet (sans le barème pour les étudiants)
        if exam.subject:
            content = exam.subject.content or ''
            # Pour les étudiants, retirer la section barème si elle est incluse dans content
            if user.role == UserRole.STUDENT:
                content = _strip_bareme_from_content(content)
            subject_content = {
                'id': exam.subject.id,
                'title': exam.subject.title,
                'content': content,
            }
            # Barème (contient les réponses) réservé aux professeurs/admins
            if user.role in [UserRole.PROFESSOR, UserRole.ADMIN]:
                subject_content['rubric'] = exam.subject.rubric
            exam_dict['subject_content'] = subject_content
        
        session.close()
        return jsonify(exam_dict)
        
    except Exception as e:
        print(f"❌ Erreur get_online_exam_details: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/online_exams/<int:exam_id>/start', methods=['POST'])
@jwt_required()
def start_exam_attempt(exam_id):
    """Démarrer une tentative d'examen (étudiant)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.STUDENT:
            session.close()
            return jsonify({'error': 'Accès réservé aux étudiants'}), 403
        
        exam = session.query(OnlineExam).filter_by(id=exam_id).first()
        if not exam:
            session.close()
            return jsonify({'error': 'Examen non trouvé'}), 404
        
        # ✅ CORRECTION: Gestion correcte des timezones
        now = utcnow()
        
        # S'assurer que les datetime sont timezone-aware pour la comparaison
        start_time = exam.start_time if exam.start_time.tzinfo else exam.start_time.replace(tzinfo=timezone.utc)
        end_time = exam.end_time if exam.end_time.tzinfo else exam.end_time.replace(tzinfo=timezone.utc)
        
        # Vérifier si l'examen est actif ET dans la plage horaire
        if exam.status != ExamStatus.ACTIVE:
            session.close()
            return jsonify({'error': 'Examen non disponible actuellement'}), 400
        if now < start_time:
            start_str = start_time.strftime('%d/%m/%Y à %H:%M') + ' UTC'
            session.close()
            return jsonify({
                'error': f"L'examen n'a pas encore commencé. Il débutera le {start_str}.",
                'starts_at': start_time.isoformat()
            }), 400
        if now > end_time:
            session.close()
            return jsonify({'error': 'Cet examen est terminé'}), 400
        
        # Vérifier tentative existante
        existing = session.query(ExamAttempt).filter_by(
            exam_id=exam_id,
            student_id=user_id
        ).first()
        
        if existing:
            if existing.status == AttemptStatus.BANNED:
                session.close()
                return jsonify({'error': 'Vous êtes banni de cet examen', 'banned': True}), 403
            if existing.status in [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]:
                session.close()
                return jsonify({'error': 'Vous avez déjà soumis cet examen'}), 400
            # Si IN_PROGRESS, continuer
            attempt_dict = existing.to_dict()
            session.close()
            return jsonify({'success': True, 'attempt': attempt_dict, 'continuing': True})
        
        # Créer nouvelle tentative
        attempt = ExamAttempt(
            exam_id=exam_id,
            student_id=user_id,
            status=AttemptStatus.IN_PROGRESS,
            answers='{}'  # JSON vide au départ
        )
        
        session.add(attempt)
        session.commit()
        attempt_dict = attempt.to_dict()
        session.close()
        
        return jsonify({'success': True, 'attempt': attempt_dict}), 201
    except Exception as e:
        print(f"❌ Erreur start_exam_attempt: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/exam_attempts/<int:attempt_id>/save', methods=['POST'])
@jwt_required()
def save_exam_answers(attempt_id):
    """Sauvegarder les réponses en temps réel"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        attempt = session.query(ExamAttempt).filter_by(id=attempt_id, student_id=user_id).first()
        if not attempt:
            session.close()
            return jsonify({'error': 'Tentative non trouvée'}), 404
        
        if attempt.status != AttemptStatus.IN_PROGRESS:
            session.close()
            return jsonify({'error': 'Impossible de modifier une tentative terminée'}), 400
        
        data = request.json
        attempt.answers = data.get('answers', '{}')
        
        session.commit()
        session.close()
        
        return jsonify({'success': True, 'message': 'Réponses sauvegardées'})
    except Exception as e:
        print(f"❌ Erreur save_exam_answers: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/exam_attempts/<int:attempt_id>/log_activity', methods=['POST'])
@jwt_required()
def log_exam_activity(attempt_id):
    """Logger une activité suspecte avec gestion améliorée des violations"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        attempt = session.query(ExamAttempt).filter_by(id=attempt_id, student_id=user_id).first()
        if not attempt:
            session.close()
            return jsonify({'error': 'Tentative non trouvée'}), 404
        
        data = request.json
        event_type = data.get('event_type', 'unknown')
        event_data = data.get('event_data', '')
        
        # Logger l'activité
        log = ExamActivityLog(
            attempt_id=attempt_id,
            event_type=event_type,
            event_data=event_data
        )
        session.add(log)
        
        exam = attempt.exam
        severity_tab_events   = ['tab_switch', 'fullscreen_exit', 'window_blur']
        severity_medium_events = ['right_click', 'copy_attempt', 'paste_attempt', 'f12_attempt']

        ban_reason = None

        # ── 1. Outils développeur ─────────────────────────────────────────────
        if event_type == 'devtools_attempt':
            ban_on_dev = exam.ban_on_devtools if exam.ban_on_devtools is not None else True
            attempt.tab_switches += 1
            attempt.warnings_count += 2
            if ban_on_dev:
                ban_reason = "Ouverture des outils développeur détectée"

        # ── 2. Changements de fenêtre / onglet / plein écran ──────────────────
        elif event_type in severity_tab_events:
            attempt.tab_switches += 1
            attempt.warnings_count += 2
            max_sw = exam.max_tab_switches if exam.max_tab_switches is not None else 2
            if max_sw >= 0 and attempt.tab_switches > max_sw:
                ban_reason = f"Trop de changements de contexte : {attempt.tab_switches} (seuil : {max_sw})"

        # ── 3. Visage non détecté ─────────────────────────────────────────────
        elif event_type == 'no_face_detected':
            no_face_count = (attempt.no_face_count or 0) + 1
            attempt.no_face_count = no_face_count
            attempt.warnings_count += 1
            max_nf = exam.max_no_face_count if exam.max_no_face_count is not None else 10
            if max_nf >= 0 and no_face_count >= max_nf:
                ban_reason = f"Visage absent trop souvent : {no_face_count} fois (seuil : {max_nf})"

        # ── 4. Violations mineures ────────────────────────────────────────────
        elif event_type in severity_medium_events:
            attempt.warnings_count += 1

        # ── Appliquer le bannissement si nécessaire ───────────────────────────
        if ban_reason:
            attempt.status = AttemptStatus.BANNED
            attempt.banned_at = utcnow()
            attempt.ban_reason = ban_reason
            session.commit()
            session.close()
            return jsonify({
                'success': True,
                'banned': True,
                'ban_reason': ban_reason,
                'severity': 'high',
                'message': f"Vous avez été exclu de cet examen : {ban_reason}"
            })

        session.commit()

        response_data = {
            'success': True,
            'warnings_count': attempt.warnings_count,
            'tab_switches': attempt.tab_switches,
            'no_face_count': attempt.no_face_count or 0,
            'max_tab_switches': exam.max_tab_switches,
            'max_no_face_count': exam.max_no_face_count if exam.max_no_face_count is not None else 10,
            'severity': 'high' if event_type in (severity_tab_events + ['devtools_attempt', 'no_face_detected']) else 'medium',
            'banned': False
        }

        session.close()
        return jsonify(response_data)
        
    except Exception as e:
        print(f"❌ Erreur log_exam_activity: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/exam_attempts/<int:attempt_id>/subject', methods=['GET'])
@jwt_required()
def get_exam_attempt_subject(attempt_id):
    """Récupérer le contenu du sujet pour une tentative en cours"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        attempt = session.query(ExamAttempt).options(
            joinedload(ExamAttempt.exam).joinedload(OnlineExam.subject)
        ).filter_by(id=attempt_id, student_id=user_id).first()
        
        if not attempt:
            session.close()
            return jsonify({'error': 'Tentative non trouvée'}), 404
        
        if attempt.status != AttemptStatus.IN_PROGRESS:
            session.close()
            return jsonify({'error': 'Cette tentative n\'est plus active'}), 400
        
        subject = attempt.exam.subject
        if not subject:
            session.close()
            return jsonify({'error': 'Sujet non trouvé'}), 404
        
        # Extraire la réponse actuelle si elle existe
        current_answer = ''
        if attempt.answers:
            try:
                saved = json.loads(attempt.answers)
                current_answer = saved.get('reponse', '')
            except Exception:
                current_answer = attempt.answers

        subject_data = {
            'id': subject.id,
            'title': subject.title,
            # Retirer la section barème du contenu (elle contient les réponses)
            'content': _strip_bareme_from_content(subject.content or ''),
            # Barème NON transmis aux étudiants — contient les réponses
            # Infos exam/tentative pour la page proctorée
            'exam_title': attempt.exam.title,
            'duration_minutes': attempt.exam.duration_minutes,
            'started_at': attempt.started_at.isoformat() if attempt.started_at else None,
            'current_answer': current_answer,
        }

        session.close()
        return jsonify(subject_data)
        
    except Exception as e:
        print(f"❌ Erreur get_exam_attempt_subject: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/exam_attempts/<int:attempt_id>/submit', methods=['POST'])
@jwt_required()
def submit_exam_attempt(attempt_id):
    """Soumettre l'examen (étudiant)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        attempt = session.query(ExamAttempt).filter_by(id=attempt_id, student_id=user_id).first()
        if not attempt:
            session.close()
            return jsonify({'error': 'Tentative non trouvée'}), 404
        
        if attempt.status != AttemptStatus.IN_PROGRESS:
            session.close()
            return jsonify({'error': 'Tentative déjà soumise ou bannie'}), 400
        
        # Sauvegarder les dernières réponses
        data = request.json
        if 'answers' in data:
            attempt.answers = data['answers']
        
        attempt.status = AttemptStatus.SUBMITTED
        attempt.submitted_at = utcnow()
        
        session.commit()
        
        # Correction automatique (basique - peut être améliorée)
        # TODO: Implémenter correction IA si nécessaire
        
        session.close()
        return jsonify({'success': True, 'message': 'Examen soumis avec succès'})
    except Exception as e:
        print(f"Erreur submit_exam_attempt: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES RELEVÉS DE NOTES
# ============================================================================

@app.route('/api/transcripts/generate/<int:student_id>/<int:semester_id>', methods=['POST'])
@jwt_required()
def generate_transcript(student_id, semester_id):
    """Générer un relevé de notes (admin/professeur)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.ADMIN, UserRole.PROFESSOR]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        # Récupérer l'étudiant
        student = session.query(User).filter_by(id=student_id, role=UserRole.STUDENT).first()
        if not student:
            session.close()
            return jsonify({'error': 'Étudiant non trouvé'}), 404
        
        # Récupérer le semestre
        semester = session.query(Semester).filter_by(id=semester_id).first()
        if not semester:
            session.close()
            return jsonify({'error': 'Semestre non trouvé'}), 404
        
        # Calculer les notes
        # Récupérer toutes les copies corrigées de l'étudiant pour ce semestre
        papers = session.query(StudentPaper).join(Subject).join(EC).join(UE).filter(
            StudentPaper.student_id == student_id,
            UE.semester_id == semester_id,
            StudentPaper.score != None
        ).all()
        
        if not papers:
            session.close()
            return jsonify({'error': 'Aucune note disponible pour ce semestre'}), 404
        
        # Calculer moyennes
        total_weighted_score = 0
        total_coefficient = 0
        
        for paper in papers:
            ec = paper.subject.ec
            if ec:
                total_weighted_score += paper.score * ec.coefficient
                total_coefficient += ec.coefficient
        
        gpa = (total_weighted_score / total_coefficient) if total_coefficient > 0 else 0
        
        # Créer/mettre à jour le relevé
        transcript = session.query(GradeTranscript).filter_by(
            student_id=student_id,
            semester_id=semester_id
        ).first()
        
        if not transcript:
            transcript = GradeTranscript(
                student_id=student_id,
                semester_id=semester_id,
                generated_by_id=user_id
            )
            session.add(transcript)
        
        transcript.total_credits = semester.total_credits
        transcript.obtained_credits = semester.total_credits if gpa >= 10 else 0
        transcript.gpa = round(gpa, 2)
        transcript.generated_at = utcnow()
        
        session.commit()
        transcript_dict = transcript.to_dict()
        session.close()
        
        return jsonify({'success': True, 'transcript': transcript_dict})
    except Exception as e:
        print(f"Erreur generate_transcript: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/transcripts', methods=['GET'])
@jwt_required()
def get_all_transcripts():
    """Liste de tous les relevés générés (admin/prof)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.ADMIN, UserRole.PROFESSOR]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        # ✅ CORRECTION : Ne pas utiliser joinedload sur generated_by (relation manquante)
        transcripts = session.query(GradeTranscript).options(
            joinedload(GradeTranscript.student),
            joinedload(GradeTranscript.semester).joinedload(Semester.formation)
            # RETIRÉ : joinedload(GradeTranscript.generated_by)
        ).order_by(GradeTranscript.generated_at.desc()).all()
        
        transcripts_list = []
        for t in transcripts:
            # ✅ Récupérer manuellement le générateur si nécessaire
            generator_name = 'Système'
            if t.generated_by_id:
                generator = session.query(User).filter_by(id=t.generated_by_id).first()
                if generator:
                    generator_name = generator.full_name
            
            transcripts_list.append({
                'id': t.id,
                'student_id': t.student_id,
                'student_name': t.student.full_name if t.student else 'Inconnu',
                'student_email': t.student.email if t.student else 'N/A',
                'semester_id': t.semester_id,
                'semester_name': t.semester.name if t.semester else 'N/A',
                'formation_name': t.semester.formation.name if t.semester and t.semester.formation else 'N/A',
                'gpa': t.gpa,
                'total_credits': t.total_credits,
                'obtained_credits': t.obtained_credits,
                'validated': t.gpa >= 10,
                'generated_by': generator_name,  # ✅ CORRIGÉ
                'generated_at': t.generated_at.isoformat() if t.generated_at else None
            })
        
        session.close()
        return jsonify(transcripts_list)
    except Exception as e:
        print(f"Erreur get_all_transcripts: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/student/transcripts', methods=['GET'])
@jwt_required()
def get_student_transcripts():
    """Relevés de l'étudiant connecté"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.STUDENT:
            session.close()
            return jsonify({'error': 'Accès réservé aux étudiants'}), 403
        
        # ✅ CORRECTION : Ne pas utiliser joinedload sur generated_by
        transcripts = session.query(GradeTranscript).options(
            joinedload(GradeTranscript.semester).joinedload(Semester.formation)
            # RETIRÉ : joinedload(GradeTranscript.generated_by)
        ).filter_by(student_id=user_id).order_by(GradeTranscript.generated_at.desc()).all()
        
        transcripts_list = []
        for t in transcripts:
            # ✅ Récupérer manuellement le générateur
            generator_name = 'Système'
            if t.generated_by_id:
                generator = session.query(User).filter_by(id=t.generated_by_id).first()
                if generator:
                    generator_name = generator.full_name
            
            transcripts_list.append({
                'id': t.id,
                'semester_name': t.semester.name if t.semester else 'N/A',
                'semester_number': t.semester.number if t.semester else None,
                'formation_name': t.semester.formation.name if t.semester and t.semester.formation else 'N/A',
                'gpa': t.gpa,
                'total_credits': t.total_credits,
                'obtained_credits': t.obtained_credits,
                'validated': t.gpa >= 10,
                'generated_by': generator_name,  # ✅ CORRIGÉ
                'generated_at': t.generated_at.isoformat() if t.generated_at else None
            })
        
        session.close()
        return jsonify(transcripts_list)
    except Exception as e:
        print(f"❌ Erreur get_student_transcripts: {e}")
        return jsonify({'error': str(e)}), 500   

@app.route('/api/transcripts/<int:transcript_id>/pdf', methods=['GET'])
@jwt_required()
def export_transcript_pdf(transcript_id):
    """Exporter un relevé en PDF"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        transcript = session.query(GradeTranscript).filter_by(id=transcript_id).first()
        if not transcript:
            session.close()
            return jsonify({'error': 'Relevé non trouvé'}), 404
        
        # Vérifier permissions
        user = session.query(User).filter_by(id=user_id).first()
        if user.role == UserRole.STUDENT and transcript.student_id != user_id:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        # Récupérer les notes détaillées
        papers = session.query(StudentPaper).join(Subject).join(EC).join(UE).filter(
            StudentPaper.student_id == transcript.student_id,
            UE.semester_id == transcript.semester_id,
            StudentPaper.score != None
        ).all()
        
        # Générer PDF
        from utils import generate_transcript_pdf
        
        transcript_data = {
            'student_name': transcript.student.full_name,
            'student_email': transcript.student.email,
            'semester_name': transcript.semester.name,
            'formation_name': transcript.semester.formation.name if transcript.semester.formation else 'N/A',
            'gpa': transcript.gpa,
            'total_credits': transcript.total_credits,
            'obtained_credits': transcript.obtained_credits,
            'papers': [{
                'ec_code': p.subject.ec.code if p.subject.ec else 'N/A',
                'ec_name': p.subject.ec.name if p.subject.ec else p.subject.title,
                'score': p.score,
                'coefficient': p.subject.ec.coefficient if p.subject.ec else 1
            } for p in papers],
            'generated_at': transcript.generated_at.strftime('%d/%m/%Y')
        }
        
        pdf_path = f"exports/releve_{transcript.id}.pdf"
        generate_transcript_pdf(transcript_data, pdf_path)
        
        session.close()
        
        return send_file(pdf_path, as_attachment=True, download_name=f"releve_notes_{transcript.student.full_name}.pdf")
    except Exception as e:
        print(f"Erreur export_transcript_pdf: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# CORRECTION AUTOMATIQUE DES EXAMENS EN LIGNE AVEC IA
# ============================================================================

@app.route('/api/exam_attempts/<int:attempt_id>/correct', methods=['POST'])
@jwt_required()
def correct_exam_attempt(attempt_id):
    """Corriger automatiquement une tentative d'examen avec IA"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        # Récupérer la tentative
        attempt = session.query(ExamAttempt).options(
            joinedload(ExamAttempt.exam).joinedload(OnlineExam.subject),
            joinedload(ExamAttempt.student)
        ).filter_by(id=attempt_id).first()
        
        if not attempt:
            session.close()
            return jsonify({'error': 'Tentative non trouvée'}), 404
        
        # Vérifier que la tentative est soumise
        if attempt.status not in [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]:
            session.close()
            return jsonify({'error': 'Cette tentative n\'est pas encore soumise'}), 400
        
        # Vérifier que le professeur est propriétaire de l'examen
        if user.role == UserRole.PROFESSOR and attempt.exam.created_by_id != user_id:
            session.close()
            return jsonify({'error': 'Vous ne pouvez corriger que vos propres examens'}), 403
        
        exam = attempt.exam
        subject = exam.subject
        
        # Extraire les réponses de l'étudiant
        try:
            answers_data = json.loads(attempt.answers) if attempt.answers else {}
            student_answers = answers_data.get('content', '')
        except:
            student_answers = attempt.answers or ''
        
        if not student_answers or student_answers.strip() == '':
            session.close()
            return jsonify({'error': 'Aucune réponse à corriger'}), 400
        
        # Préparer le prompt pour Claude
        system_prompt = """Tu es un correcteur d'examen EXTRÊMEMENT rigoureux.

IMPORTANT: Tu DOIS terminer ta correction par une ligne contenant EXACTEMENT:
Note totale: XX.XX/20

Format de correction:
=== CORRECTION DÉTAILLÉE ===
[Évaluation détaillée de chaque question]

=== RÉSUMÉ ===
Points forts: [...]
Points à améliorer: [...]

Note totale: XX.XX/20
"""

        user_message = f"""SUJET D'EXAMEN:
{subject.content}

BARÈME DE NOTATION:
{subject.rubric}

COPIE À CORRIGER (Examen en ligne):
Étudiant: {attempt.student.full_name}
Durée de l'examen: {exam.duration_minutes} minutes

RÉPONSES DE L'ÉTUDIANT:
{student_answers}

RAPPEL: Tu DOIS finir par "Note totale: XX.XX/20" """

        # Appeler Claude pour la correction
        result = call_claude(system_prompt, user_message, temperature=0.15)
        score = extract_score_from_correction(result)
        
        # Stocker les résultats
        attempt.score = score
        attempt.feedback = result
        attempt.corrected_at = utcnow()
        attempt.corrected_by_id = user_id
        
        session.commit()
        
        # Envoyer email à l'étudiant si adresse valide
        try:
            if attempt.student.email and '@temp.edu' not in attempt.student.email:
                email_sent = send_paper_corrected_email(
                    student_email=attempt.student.email,
                    student_name=attempt.student.full_name,
                    subject_title=f"{exam.title} (Examen en ligne)",
                    score=score,
                    paper_id=attempt.id
                )
                if email_sent:
                    print(f"✅ Email envoyé à {attempt.student.email}")
        except Exception as email_error:
            print(f"⚠️ Erreur envoi email: {email_error}")
        
        attempt_dict = attempt.to_dict()
        session.close()
        
        return jsonify({
            'success': True,
            'attempt': attempt_dict,
            'message': f'Correction terminée: {score}/20'
        })
        
    except Exception as e:
        print(f"❌ Erreur correct_exam_attempt: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/online_exams/<int:exam_id>/attempts', methods=['GET'])
@jwt_required()
def get_exam_attempts(exam_id):
    """Récupérer toutes les tentatives d'un examen (professeur/admin)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        exam = session.query(OnlineExam).filter_by(id=exam_id).first()
        if not exam:
            session.close()
            return jsonify({'error': 'Examen non trouvé'}), 404
        
        # Vérifier propriété pour professeur
        if user.role == UserRole.PROFESSOR and exam.created_by_id != user_id:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        attempts = session.query(ExamAttempt).options(
            joinedload(ExamAttempt.student)
        ).filter_by(exam_id=exam_id).order_by(ExamAttempt.started_at.desc()).all()
        
        attempts_list = []
        for attempt in attempts:
            attempt_dict = attempt.to_dict()
            # Ajouter info incidents
            attempt_dict['has_incidents'] = attempt.warnings_count > 0 or attempt.tab_switches > 0
            attempt_dict['needs_correction'] = attempt.status in [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] and attempt.score is None
            attempts_list.append(attempt_dict)
        
        session.close()
        return jsonify(attempts_list)
        
    except Exception as e:
        print(f"❌ Erreur get_exam_attempts: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# LOGS ET INCIDENTS DES EXAMENS
# ============================================================================

@app.route('/api/online_exams/<int:exam_id>/incidents', methods=['GET'])
@jwt_required()
def get_exam_incidents(exam_id):
    """Récupérer tous les incidents/logs d'un examen (professeur/admin)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        exam = session.query(OnlineExam).filter_by(id=exam_id).first()
        if not exam:
            session.close()
            return jsonify({'error': 'Examen non trouvé'}), 404
        
        if user.role == UserRole.PROFESSOR and exam.created_by_id != user_id:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403
        
        # Récupérer tous les logs via les tentatives
        logs = session.query(ExamActivityLog).join(ExamAttempt).filter(
            ExamAttempt.exam_id == exam_id
        ).order_by(ExamActivityLog.timestamp.desc()).all()
        
        incidents_list = []
        for log in logs:
            log_dict = log.to_dict()
            log_dict['student_name'] = log.attempt.student.full_name if log.attempt.student else 'Inconnu'
            log_dict['student_id'] = log.attempt.student_id
            log_dict['severity'] = 'high' if log.event_type in ['tab_switch', 'devtools_attempt'] else 'medium'
            incidents_list.append(log_dict)
        
        # Statistiques
        total_incidents = len(logs)
        tab_switches = len([l for l in logs if l.event_type == 'tab_switch'])
        banned_students = session.query(ExamAttempt).filter_by(
            exam_id=exam_id,
            status=AttemptStatus.BANNED
        ).count()
        
        session.close()
        
        return jsonify({
            'incidents': incidents_list,
            'statistics': {
                'total_incidents': total_incidents,
                'tab_switches': tab_switches,
                'banned_students': banned_students
            }
        })
        
    except Exception as e:
        print(f"❌ Erreur get_exam_incidents: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/professor/recent_incidents', methods=['GET'])
@jwt_required()
def get_professor_recent_incidents():
    """Récupérer les incidents récents pour le professeur connecté"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.PROFESSOR:
            session.close()
            return jsonify({'error': 'Accès réservé aux professeurs'}), 403
        
        # Récupérer les examens actifs du professeur
        active_exams = session.query(OnlineExam).filter_by(
            created_by_id=user_id,
            status=ExamStatus.ACTIVE
        ).all()
        
        exam_ids = [e.id for e in active_exams]
        
        if not exam_ids:
            session.close()
            return jsonify({'incidents': [], 'unread_count': 0})
        
        # Incidents des dernières 24h
        since = utcnow() - timedelta(hours=24)
        
        incidents = session.query(ExamActivityLog).join(ExamAttempt).filter(
            ExamAttempt.exam_id.in_(exam_ids),
            ExamActivityLog.timestamp >= since
        ).order_by(ExamActivityLog.timestamp.desc()).limit(50).all()
        
        incidents_list = []
        for incident in incidents:
            incident_dict = incident.to_dict()
            incident_dict['student_name'] = incident.attempt.student.full_name
            incident_dict['exam_title'] = incident.attempt.exam.title
            incident_dict['severity'] = 'high' if incident.event_type in ['tab_switch', 'devtools_attempt'] else 'medium'
            incidents_list.append(incident_dict)
        
        session.close()
        
        return jsonify({
            'incidents': incidents_list,
            'unread_count': len(incidents_list)
        })
        
    except Exception as e:
        print(f"❌ Erreur get_professor_recent_incidents: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# HISTORIQUE DES EXAMENS (ADMIN)
# ============================================================================

@app.route('/api/admin/exams_history', methods=['GET'])
@jwt_required()
def get_exams_history():
    """Historique des examens terminés avec statistiques (admin only)"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()
        
        user = session.query(User).filter_by(id=user_id).first()
        if user.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès réservé aux administrateurs'}), 403
        
        # Récupérer tous les examens terminés
        closed_exams = session.query(OnlineExam).filter_by(
            status=ExamStatus.CLOSED
        ).order_by(OnlineExam.end_time.desc()).all()
        
        history_list = []
        for exam in closed_exams:
            attempts = session.query(ExamAttempt).filter_by(exam_id=exam.id).all()
            
            submitted_count = len([a for a in attempts if a.status in [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]])
            banned_count = len([a for a in attempts if a.status == AttemptStatus.BANNED])
            corrected_count = len([a for a in attempts if a.score is not None])
            
            # Moyenne des notes
            scores = [a.score for a in attempts if a.score is not None]
            average_score = round(sum(scores) / len(scores), 2) if scores else 0
            
            # Incidents totaux
            incidents_count = session.query(ExamActivityLog).join(ExamAttempt).filter(
                ExamAttempt.exam_id == exam.id
            ).count()
            
            history_list.append({
                'id': exam.id,
                'title': exam.title,
                'subject_title': exam.subject.title if exam.subject else None,
                'creator_name': exam.creator.full_name if exam.creator else None,
                'start_time': exam.start_time.isoformat(),
                'end_time': exam.end_time.isoformat(),
                'duration_minutes': exam.duration_minutes,
                'total_attempts': len(attempts),
                'submitted_count': submitted_count,
                'banned_count': banned_count,
                'corrected_count': corrected_count,
                'average_score': average_score,
                'incidents_count': incidents_count,
                'created_at': exam.created_at.isoformat()
            })
        
        session.close()
        return jsonify(history_list)
        
    except Exception as e:
        print(f" Erreur get_exams_history: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# NOUVEAU : CRÉATION ÉTUDIANT SANS EMAIL
# ============================================================================

@app.route('/api/admin/users/student-no-email', methods=['POST'])
@jwt_required()
def create_student_no_email():
    """Créer un étudiant sans adresse email"""
    try:
        admin_id = int(get_jwt_identity())
        session = get_session()

        admin = session.query(User).filter_by(id=admin_id).first()
        if admin.role != UserRole.ADMIN:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        data = request.json
        full_name = data.get('full_name')
        
        if not full_name:
            session.close()
            return jsonify({'error': 'Nom complet requis'}), 400

        # Vérifier si un étudiant avec ce nom existe déjà
        existing = session.query(User).filter_by(
            full_name=full_name,
            role=UserRole.STUDENT
        ).first()
        
        if existing:
            session.close()
            return jsonify({'error': 'Un étudiant avec ce nom existe déjà'}), 400

        # Générer un email temporaire unique basé sur le nom
        safe_name = normalize_name(full_name).replace(' ', '.')
        temp_email = f"{safe_name}.{datetime.now().strftime('%Y%m%d%H%M%S')}@noemail.local"
        
        # Mot de passe par défaut
        temp_password = f"Student{datetime.now().year}"
        hashed_password = bcrypt.generate_password_hash(temp_password).decode('utf-8')

        new_user = User(
            email=temp_email,
            password_hash=hashed_password,
            full_name=full_name,
            role=UserRole.STUDENT,
            has_email=False  # ✅ Marquer comme sans email
        )

        session.add(new_user)
        session.commit()
        user_dict = new_user.to_dict()
        session.close()

        return jsonify({
            'success': True,
            'message': 'Étudiant créé sans email',
            'user': user_dict,
            'temp_password': temp_password
        }), 201
        
    except Exception as e:
        print(f"❌ Erreur create_student_no_email: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# NOUVEAU : LISTE DES COPIES CORRIGÉES (PROFESSEUR)
# ============================================================================

@app.route('/api/professor/corrected_papers', methods=['GET'])
@jwt_required()
def professor_corrected_papers():
    """Liste des copies corrigées par le professeur connecté"""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        # Filtrer par professeur si pas admin
        query = session.query(StudentPaper).options(
            joinedload(StudentPaper.student),
            joinedload(StudentPaper.subject)
        ).filter(StudentPaper.corrected_at != None)

        if user.role == UserRole.PROFESSOR:
            query = query.filter(StudentPaper.corrected_by_id == user_id)

        papers = query.order_by(StudentPaper.corrected_at.desc()).limit(100).all()

        papers_list = []
        for p in papers:
            papers_list.append({
                'id': p.id,
                'student_name': p.student.full_name if p.student else 'Inconnu',
                'student_email': p.student.email if p.student and p.student.has_email else 'Pas d\'email',
                'subject_title': p.subject.title if p.subject else 'N/A',
                'score': p.score,
                'corrected_at': p.corrected_at.isoformat() if p.corrected_at else None,
                'email_sent': p.email_sent,
                'filename': p.filename
            })

        session.close()
        return jsonify({'papers': papers_list})
        
    except Exception as e:
        print(f"❌ Erreur professor_corrected_papers: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/generate-exam-suggestions', methods=['POST'])
@jwt_required()
def generate_exam_suggestions():
    """Génère des suggestions de sujets d'examen à partir d'un cours uploadé"""
    current_user_id = get_jwt_identity()
    session = get_session()
    
    user = session.query(User).filter_by(id=int(current_user_id)).first()
    
    if not user or user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
        session.close()
        return jsonify({'success': False, 'error': 'Accès non autorisé'}), 403
    
    try:
        # ✅ NOUVELLE VERSION : Upload du fichier cours
        if 'course_file' not in request.files:
            session.close()
            return jsonify({'success': False, 'error': 'Fichier cours requis'}), 400
        
        file = request.files['course_file']
        
        if file.filename == '':
            session.close()
            return jsonify({'success': False, 'error': 'Aucun fichier sélectionné'}), 400
        
        if not allowed_file(file.filename):
            session.close()
            return jsonify({'success': False, 'error': 'Type de fichier non autorisé (PDF, DOCX, TXT uniquement)'}), 400
        
        # Sauvegarder temporairement le fichier
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        temp_filename = f"course_{timestamp}_{filename}"
        temp_filepath = os.path.join(app.config['UPLOAD_FOLDER'], temp_filename)
        file.save(temp_filepath)
        
        # Extraire le contenu du cours
        course_content = extract_text_from_file(temp_filepath)
        
        if not course_content or len(course_content.strip()) < 100:
            os.remove(temp_filepath)
            session.close()
            return jsonify({
                'success': False, 
                'error': 'Le contenu du cours est trop court ou illisible (minimum 100 caractères)'
            }), 400
        
        # Récupérer les paramètres additionnels du formulaire
        difficulty = request.form.get('difficulty', 'Moyen')
        student_level = request.form.get('student_level', 'Licence')
        exam_type = request.form.get('exam_type', '')  # Type souhaité (optionnel)
        
        # ✅ PROMPT AMÉLIORÉ : Basé sur le contenu réel du cours
        prompt = f"""
Tu es un expert en pédagogie et en création de sujets d'examen. 

CONTENU DU COURS UPLOADÉ:
{course_content[:8000]}  
{"[... contenu tronqué pour limites API ...]" if len(course_content) > 8000 else ""}

PARAMÈTRES DE L'EXAMEN:
- Niveau de difficulté souhaité: {difficulty}
- Niveau des étudiants: {student_level}
{f"- Type d'examen préféré: {exam_type}" if exam_type else ""}

MISSION:
Analyse le contenu du cours ci-dessus et génère 3 suggestions de sujets d'examen **directement basées sur les concepts, théories et exercices présents dans ce cours**.

Pour chaque suggestion, fournis:
1. Un titre accrocheur et pertinent au contenu du cours
2. Une description détaillée (2-3 phrases) expliquant ce qui sera évalué
3. Le type d'examen (QCM, Dissertation, Exercices pratiques, Étude de cas, Projet, Examen mixte)
4. La durée recommandée en minutes
5. 4-6 points clés à évaluer **extraits du cours**
6. 3-5 exemples de questions concrètes **basées sur le contenu du cours**
7. Les critères d'évaluation principaux avec barème suggéré

IMPORTANT:
- Base-toi UNIQUEMENT sur le contenu fourni
- Cite des concepts/théories/exemples présents dans le cours
- Adapte le niveau au paramètre "{student_level}"
- Assure-toi que les questions testent la compréhension réelle du cours

Réponds UNIQUEMENT avec un JSON valide dans ce format:
{{
    "course_summary": "Résumé du cours en 2-3 phrases",
    "main_topics": ["Thème 1", "Thème 2", "Thème 3"],
    "suggestions": [
        {{
            "title": "...",
            "description": "...",
            "exam_type": "...",
            "duration": 120,
            "difficulty": "{difficulty}",
            "key_points": ["point1 du cours", "point2 du cours", ...],
            "questions_examples": ["question basée sur concept X", "exercice sur théorème Y", ...],
            "grading_criteria": "Barème: Q1 (5pts) - ..., Q2 (8pts) - ..., Q3 (7pts) - ..."
        }},
        ...
    ]
}}
"""
        
        # Appel à Claude API
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )
        
        response_text = response.content[0].text
        
        # Parser la réponse JSON
        import json
        import re
        
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            suggestions_data = json.loads(json_match.group())
            
            # ✅ OPTIONNEL : Stocker le fichier cours pour référence future
            # On peut l'associer aux suggestions ou le laisser temporaire
            
            session.close()
            return jsonify({
                'success': True,
                'course_summary': suggestions_data.get('course_summary', ''),
                'main_topics': suggestions_data.get('main_topics', []),
                'suggestions': suggestions_data.get('suggestions', []),
                'course_filename': filename  # Pour affichage dans le frontend
            })
        else:
            os.remove(temp_filepath)
            session.close()
            return jsonify({'success': False, 'error': 'Format de réponse IA invalide'}), 500
            
    except Exception as e:
        print(f" Erreur génération suggestions: {e}")
        import traceback
        traceback.print_exc()
        if 'temp_filepath' in locals() and os.path.exists(temp_filepath):
            os.remove(temp_filepath)
        session.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/subjects/generate-full-exam', methods=['POST'])
@jwt_required()
def generate_full_exam_from_suggestion():
    """Génère un sujet d'examen complet avec questions numérotées et barème (sans sauvegarder)"""
    user_id = get_jwt_identity()
    session = get_session()
    user = session.query(User).filter_by(id=int(user_id)).first()
    session.close()

    if not user or user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
        return jsonify({'error': 'Accès non autorisé'}), 403

    data = request.get_json()
    suggestion = data.get('suggestion', {})

    title = suggestion.get('title', 'Examen')
    exam_type = suggestion.get('exam_type', 'Examen écrit')
    difficulty = suggestion.get('difficulty', 'Moyen')
    duration = suggestion.get('duration', 120)
    description = suggestion.get('description', '')
    key_points = suggestion.get('key_points', [])
    student_level = suggestion.get('student_level', 'Licence 3')
    questions_examples = suggestion.get('questions_examples', [])

    key_points_str = '\n'.join(f'- {p}' for p in key_points)
    examples_str = '\n'.join(f'{i+1}. {q}' for i, q in enumerate(questions_examples)) if questions_examples else ''

    prompt = f"""Tu es un expert en création d'examens universitaires francophones.

Crée un sujet d'examen COMPLET et DÉTAILLÉ avec ces informations:
- Titre: {title}
- Type: {exam_type}
- Niveau: {student_level}
- Difficulté: {difficulty}
- Durée: {duration} minutes
- Description: {description}
- Thèmes à couvrir:
{key_points_str}
{('- Exemples de questions de base:\\n' + examples_str) if examples_str else ''}

GÉNÈRE le sujet en respectant EXACTEMENT ce format:

══════════════════════════════════════
{title.upper()}
══════════════════════════════════════
Type d'examen : {exam_type}
Niveau : {student_level} | Difficulté : {difficulty}
Durée : {duration} minutes | Note totale : 20 points
══════════════════════════════════════

INSTRUCTIONS AUX ÉTUDIANTS
──────────────────────────
[2-3 phrases d'instructions claires et précises]

══════════════════════════════════════
QUESTIONS
══════════════════════════════════════

Question 1 — [Titre court] ............. (X pts)
[Énoncé complet, précis et détaillé de la question]

Question 2 — [Titre court] ............. (Y pts)
[Énoncé complet, précis et détaillé de la question]

[Continuer selon la durée et difficulté. Total = 20 pts]

══════════════════════════════════════
BARÈME DE NOTATION
══════════════════════════════════════

Question 1 — [Titre] ({'{X}'} pts)
  • Sous-critère a : Z pts — [Ce qui est attendu précisément]
  • Sous-critère b : Z pts — [Ce qui est attendu précisément]

Question 2 — [Titre] ({'{Y}'} pts)
  • Sous-critère a : Z pts — [Ce qui est attendu précisément]
  • Sous-critère b : Z pts — [Ce qui est attendu précisément]

──────────────────────────
TOTAL : 20 / 20 points
══════════════════════════════════════

Règles importantes:
- Les points des questions doivent sommer exactement à 20
- Les questions doivent être adaptées à {duration} minutes de composition
- Langage académique et rigoureux
- Chaque question doit être suffisamment détaillée pour que l'étudiant comprenne exactement ce qui est attendu"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )
        full_exam_text = response.content[0].text

        # Séparer contenu et barème
        bareme_markers = ['BARÈME DE NOTATION', 'BAREME DE NOTATION', 'BARÈME', 'Barème']
        rubric_start = -1
        for marker in bareme_markers:
            idx = full_exam_text.find(marker)
            if idx != -1:
                # Remonter jusqu'à la ligne de séparation
                line_start = full_exam_text.rfind('\n', 0, idx)
                rubric_start = line_start if line_start != -1 else idx
                break

        if rubric_start != -1:
            content = full_exam_text[:rubric_start].strip()
            rubric = full_exam_text[rubric_start:].strip()
        else:
            content = full_exam_text
            rubric = full_exam_text

        return jsonify({
            'success': True,
            'title': title,
            'content': content,
            'rubric': rubric,
            'full_text': full_exam_text
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/subjects/create-from-suggestion', methods=['POST'])
@jwt_required()
def create_subject_from_suggestion():
    """Crée un sujet à partir d'une suggestion IA"""
    current_user_id = get_jwt_identity()
    session = get_session()  # ✅ Créer session
    
    user = session.query(User).filter_by(id=int(current_user_id)).first()  # ✅ CORRECT
    
    if not user or user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
        session.close()
        return jsonify({'success': False, 'error': 'Accès non autorisé'}), 403
    
    data = request.get_json()

    try:
        # Utiliser le barème fourni si disponible, sinon le générer avec Claude
        rubric = data.get('rubric_override')
        if not rubric:
            rubric_prompt = f"""
Voici un sujet d'examen:

{data['content']}

Génère un barème de notation détaillé pour ce sujet.
Répartis les points sur 20 en fonction des différentes parties/questions.
Sois précis sur ce qui est attendu pour chaque point.
"""
            rubric_response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                messages=[{"role": "user", "content": rubric_prompt}]
            )
            rubric = rubric_response.content[0].text

        # Créer le sujet
        new_subject = Subject(
            title=data['title'],
            content=data['content'],
            rubric=rubric,
            creator_id=int(current_user_id),
            ec_id=data.get('ec_id'),
            is_active=True
        )
        
        session.add(new_subject) 
        session.commit()
        
        subject_dict = new_subject.to_dict()
        session.close()
        
        return jsonify({
            'success': True,
            'subject': subject_dict
        })
        
    except Exception as e:
        session.rollback()
        session.close()
        print(f"❌ Erreur création sujet: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print("\n" + "="*60)
    print("SYSTÈME DE NOTATION AVANCÉ - VERSION COMPLÈTE")
    print("="*60)
    print("\n📱 URLs:")
    print(" Landing Page: http://localhost:7000")
    print(" Application: http://localhost:7000/app")
    print("\n Fonctionnalités:")
    print(" Authentification multi-rôles")
    print(" CRUD Maquette pédagogique COMPLET")
    print(" CRUD Utilisateurs (Admin)")
    print(" Upload et création de sujets")
    print(" Correction de copies unique et en lot")
    print(" Gestion des réclamations")
    print(" Statistiques détaillées")
    print("\n Créer un admin: python create_admin.py\n")

    app.run(debug=True, host='0.0.0.0', port=7000)

# Note: export_paper_pdf route is registered from export_route.py via register_export_route(app)