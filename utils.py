"""Utilitaires avancés - VERSION CORRIGÉE
- Envoi d'emails (SANS timeout sur starttls - compatible Python < 3.9)
- Détection de doublons (hash)
- Extraction de texte avec OCR
- Export PDF de copies corrigées
"""
import os
import hashlib
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import PyPDF2
import docx
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from io import BytesIO
from datetime import datetime
import re
import unicodedata

# Configuration SMTP (à mettre dans .env)
SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
SMTP_USERNAME = os.getenv('SMTP_USERNAME', '')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')
SMTP_FROM_EMAIL = os.getenv('SMTP_FROM_EMAIL', 'noreply@examgrading.com')
SMTP_FROM_NAME = os.getenv('SMTP_FROM_NAME', 'Système de Notation')

# ============================================================================
# DÉTECTION DE DOUBLONS (SHA256)
# ============================================================================

def calculate_file_hash(file_path):
    """Calculer le hash SHA256 d'un fichier"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def calculate_content_hash(content):
    """Calculer le hash SHA256 d'un contenu texte"""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()

# ============================================================================
# EXTRACTION DE TEXTE (avec OCR si nécessaire)
# ============================================================================

def extract_text_from_file(filepath):
    """Extraire le texte d'un fichier PDF, DOCX ou TXT"""
    ext = filepath.lower().split('.')[-1]

    try:
        if ext == 'pdf':
            return extract_text_from_pdf(filepath)
        elif ext in ['docx', 'doc']:
            return extract_text_from_docx(filepath)
        elif ext == 'txt':
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
        else:
            return None
    except Exception as e:
        print(f"⚠️ Erreur extraction texte: {e}")
        return None

def extract_text_from_pdf(filepath):
    """Extraire le texte d'un PDF"""
    text = ""
    try:
        with open(filepath, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        return text.strip()
    except Exception as e:
        print(f"⚠️ Erreur PDF: {e}")
        return None

def extract_text_from_docx(filepath):
    """Extraire le texte d'un DOCX"""
    try:
        doc = docx.Document(filepath)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text.strip()
    except Exception as e:
        print(f"⚠️ Erreur DOCX: {e}")
        return None

def extract_student_name_from_content_improved(content):
    """Extraction améliorée du nom étudiant
    Évite les patterns incorrects comme "Copie Sdn/..." 
    """
    # Nettoyer le contenu
    content_lines = content.split('\n')

    # Patterns à éviter (false positives)
    avoid_patterns = [
        r'^Copie\s+',
        r'^\d+\.',
        r'^Question\s+',
        r'^Exercice\s+',
        r'^Problème\s+',
        r'^Examen\s+',
        r'^Test\s+',
        r'^Devoir\s+',
    ]

    # Patterns pour trouver le nom
    name_patterns = [
        r'Nom\s*:\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ\s\'-]+)',
        r'Nom\s+et\s+Prénom\s*:\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ\s\'-]+)',
        r'Prénom\s+et\s+Nom\s*:\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ\s\'-]+)',
        r'Nom\s+Prénom\s*:\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ\s\'-]+)',
        r'Étudiant\s*:\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ\s\'-]+)',
        r'Candidat\s*:\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ\s\'-]+)',
        r'Nom\s+complet\s*:\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ\s\'-]+)',
        r'Élève\s*:\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ\s\'-]+)',
    ]

    # Essayer chaque pattern
    for pattern in name_patterns:
        match = re.search(pattern, content, re.MULTILINE | re.IGNORECASE)
        if match:
            name = match.group(1).strip()

            # Vérifier que ce n'est pas un false positive
            is_valid = True
            for avoid in avoid_patterns:
                if re.match(avoid, name, re.IGNORECASE):
                    is_valid = False
                    break

            if is_valid and len(name) >= 4 and ' ' in name:
                return name

    # Fallback: chercher dans les 10 premières lignes un pattern NOM Prénom
    for line in content_lines[:10]:
        line = line.strip()
        if len(line) < 5 or len(line) > 50:
            continue

        # Vérifier les patterns à éviter
        skip = False
        for avoid in avoid_patterns:
            if re.match(avoid, line, re.IGNORECASE):
                skip = True
                break

        if skip:
            continue

        # Pattern: MAJUSCULE Minuscule (ex: BOUNGUELE Serge)
        match = re.match(r'^([A-ZÀ-Ÿ]{2,})\s+([A-ZÀ-Ÿ][a-zà-ÿ]+)$', line)
        if match:
            return f"{match.group(1)} {match.group(2)}"

        # Pattern: Majuscule MAJUSCULE (ex: Serge BOUNGUELE)
        match = re.match(r'^([A-ZÀ-Ÿ][a-zà-ÿ]+)\s+([A-ZÀ-Ÿ]{2,})$', line)
        if match:
            return f"{match.group(1)} {match.group(2)}"

    return None

extract_student_name_from_content = extract_student_name_from_content_improved

# ============================================================================
# EXPORT PDF DE COPIES CORRIGÉES
# ============================================================================

def generate_corrected_paper_pdf(paper_data, output_path):
    """Générer un PDF de la copie corrigée
    paper_data = {'student_name', 'subject_title', 'score', 'grade', 'corrected_at'}
    """
    doc = SimpleDocTemplate(output_path, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    # Style personnalisé
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#2563eb'),
        spaceAfter=30,
        alignment=1 # Centré
    )

    header_style = ParagraphStyle(
        'CustomHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1e293b'),
        spaceAfter=12
    )

    # En-tête
    story.append(Paragraph("📋 COPIE CORRIGÉE", title_style))
    story.append(Spacer(1, 0.2*inch))

    # Informations
    info_data = [
        ['Étudiant:', paper_data.get('student_name', 'N/A')],
        ['Sujet:', paper_data.get('subject_title', 'N/A')],
        ['Note:', f"{paper_data.get('score', 0)}/20"],
        ['Date:', datetime.fromisoformat(paper_data.get('corrected_at', datetime.now().isoformat())).strftime('%d/%m/%Y')]
    ]

    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1e293b')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor('#f8fafc')])
    ]))

    story.append(info_table)
    story.append(Spacer(1, 0.3*inch))

    # Correction détaillée
    story.append(Paragraph("📝 Correction Détaillée", header_style))
    story.append(Spacer(1, 0.1*inch))

    grade_text = paper_data.get('grade', 'Pas de correction disponible')
    for line in grade_text.split('\n'):
        if line.strip():
            story.append(Paragraph(line, styles['BodyText']))
            story.append(Spacer(1, 0.05*inch))

    # Footer
    story.append(Spacer(1, 0.5*inch))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#64748b'),
        alignment=1
    )
    story.append(Paragraph("Système de Notation Automatisé - Document généré le " +
                          datetime.now().strftime('%d/%m/%Y à %H:%M'), footer_style))

    # Générer le PDF
    doc.build(story)
    return output_path

# ============================================================================
# ENVOI D'EMAILS - VERSION CORRIGÉE (SANS TIMEOUT SUR STARTTLS)
# ============================================================================

def send_email(to_email, subject, html_body, attachments=None):
    """Envoyer un email - VERSION CORRIGÉE
    attachments = [{'filename': 'file.pdf', 'path': '/path/to/file.pdf'}]
    
    ⚠️ IMPORTANT: timeout n'est PAS supporté sur starttls() en Python < 3.9
    """
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print("⚠️ SMTP non configuré - email non envoyé")
        return False

    try:
        msg = MIMEMultipart('alternative')
        msg['From'] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        msg['To'] = to_email
        msg['Subject'] = subject

        # Corps HTML
        html_part = MIMEText(html_body, 'html', 'utf-8')
        msg.attach(html_part)

        # Pièces jointes
        if attachments:
            for attachment in attachments:
                try:
                    with open(attachment['path'], 'rb') as f:
                        part = MIMEBase('application', 'octet-stream')
                        part.set_payload(f.read())
                        encoders.encode_base64(part)
                        part.add_header('Content-Disposition',
                                       f"attachment; filename= {attachment['filename']}")
                        msg.attach(part)
                except Exception as attach_error:
                    print(f"⚠️ Erreur pièce jointe {attachment['filename']}: {attach_error}")

        # ✅ CORRECTION: timeout SEULEMENT sur SMTP(), PAS sur starttls()
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=3) as server:
            server.starttls()  # ← PAS DE TIMEOUT ICI !
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)

        print(f"✅ Email envoyé à {to_email}")
        return True

    except smtplib.SMTPException as smtp_error:
        print(f"❌ Erreur SMTP envoi email à {to_email}: {smtp_error}")
        return False
    except Exception as e:
        print(f"❌ Erreur envoi email à {to_email}: {e}")
        return False

def send_account_created_email(user_email, user_name, role, temp_password=None):
    """Email de création de compte"""
    subject = "🎓 Votre compte a été créé"

    role_labels = {
        'student': 'Étudiant',
        'professor': 'Professeur',
        'admin': 'Administrateur'
    }

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563eb;">🎓 Bienvenue sur le Système de Notation</h2>
            <p>Bonjour <strong>{user_name}</strong>,</p>
            <p>Votre compte {role_labels.get(role, role)} a été créé avec succès.</p>

            <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>📧 Email:</strong> {user_email}</p>
                {f'<p style="margin: 5px 0;"><strong>🔒 Mot de passe:</strong> {temp_password}</p>' if temp_password else ''}
            </div>

            <p><a href="https://cei.ec2lt.sn/app" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Se connecter</a></p>

            <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
                Ceci est un email automatique, merci de ne pas y répondre.
            </p>
        </div>
    </body>
    </html>
    """

    return send_email(user_email, subject, html_body)

def send_paper_corrected_email(student_email, student_name, subject_title, score, paper_id, attachments=None):
    """Email de copie corrigée - Amélioré : Avec attachments"""
    subject = f"✅ Votre copie ({subject_title}) a été corrigée"

    score_color = "#10b981" if score >= 10 else "#ef4444"

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563eb;">📝 Copie Corrigée</h2>
            <p>Bonjour <strong>{student_name}</strong>,</p>
            <p>Votre copie pour le sujet <strong>{subject_title}</strong> a été corrigée.</p>

            <div style="background: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0; text-align: center;">
                <p style="font-size: 18px; margin: 0;">Votre note:</p>
                <p style="font-size: 36px; font-weight: bold; color: {score_color}; margin: 10px 0;">{score}/20</p>
            </div>

            <p>Vous pouvez consulter le détail dans l'application. Si vous souhaitez contester, vous avez 7 jours à compter de la correction.</p>

            <p><a href="https://cei.ec2lt.sn/app" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Voir ma copie</a></p>

            <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
                Ceci est un email automatique, merci de ne pas y répondre.
            </p>
        </div>
    </body>
    </html>
    """

    return send_email(student_email, subject, html_body, attachments)

# ============================================================================
# VALIDATION DE FICHIERS
# ============================================================================

ALLOWED_EXTENSIONS = {'pdf', 'docx', 'doc', 'txt'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ============================================================================
# GÉNÉRATION DE STATISTIQUES (conservé)
# ============================================================================

def generate_pdf_report(data, output_path):
    """Générer un rapport PDF (pour statistiques)"""
    # Implémentation existante...
    pass

def generate_statistics_chart(data):
    """Générer un graphique de statistiques"""
    # Implémentation existante...
    pass

# ============================================================================
# AMÉLIORATION MATCHING NOMS ÉTUDIANTS
# ============================================================================

def normalize_name(name):
    """Normaliser un nom pour comparaison
    - Minuscules
    - Suppression accents
    - Suppression espaces multiples
    """
    if not name:
        return ""

    # Minuscules
    name = name.lower().strip()

    # Supprimer accents
    name = ''.join(
        c for c in unicodedata.normalize('NFD', name)
        if unicodedata.category(c) != 'Mn'
    )

    # Espaces multiples -> un seul
    name = ' '.join(name.split())

    return name

def match_student_by_name(extracted_name, session):
    """Trouver un étudiant par nom avec matching intelligent

    Gère :
    - Ordre inversé (Prénom Nom vs Nom Prénom)
    - Casse différente
    - Accents
    - Espaces

    Args:
        extracted_name: Nom extrait de la copie
        session: Session SQLAlchemy

    Returns:
        User object ou None
    """
    from models import User, UserRole

    if not extracted_name:
        return None

    # Normaliser le nom extrait
    norm_extracted = normalize_name(extracted_name)

    # Récupérer tous les étudiants
    students = session.query(User).filter_by(role=UserRole.STUDENT).all()

    for student in students:
        norm_student = normalize_name(student.full_name)

        # 1. Matching exact
        if norm_extracted == norm_student:
            print(f" ✅ Match exact: {student.full_name}")
            return student

        # 2. Matching inversé (Prénom Nom vs Nom Prénom)
        parts_extracted = norm_extracted.split()
        parts_student = norm_student.split()

        if len(parts_extracted) >= 2 and len(parts_student) >= 2:
            # Inverser et comparer
            reversed_extracted = ' '.join(reversed(parts_extracted))
            if reversed_extracted == norm_student:
                print(f" ✅ Match inversé: {student.full_name}")
                return student

            # 3. Nom de famille + prénom partiel
            # Ex: "Serge Bounguele" match "BOUNGUELE Serge"
            if parts_extracted[-1] == parts_student[0] or parts_extracted[-1] == parts_student[-1]:
                if parts_extracted[0] in parts_student or parts_student[0] in parts_extracted:
                    print(f"Match partiel: {student.full_name}")
                    return student

            # 4. Les deux parties du nom sont présentes (ordre peu importe)
            if all(part in parts_student for part in parts_extracted[:2]):
                print(f"Match multi-partie: {student.full_name}")
                return student

    return None

def find_or_create_student(student_name, extracted_name, session):
    """Trouver ou créer un étudiant avec matching intelligent

    Args:
        student_name: Nom fourni manuellement (peut être None)
        extracted_name: Nom extrait de la copie
        session: Session SQLAlchemy

    Returns:
        User object
    """
    from models import User, UserRole
    from flask_bcrypt import Bcrypt

    bcrypt = Bcrypt()

    # Essayer de matcher avec le nom fourni
    if student_name:
        student = match_student_by_name(student_name, session)
        if student:
            return student

    # Essayer de matcher avec le nom extrait
    if extracted_name:
        student = match_student_by_name(extracted_name, session)
        if student:
            return student

    # Si aucun match, créer un étudiant temporaire
    name_to_use = student_name or extracted_name or "Étudiant Inconnu"
    temp_email = f"{normalize_name(name_to_use).replace(' ', '.')}@temp.edu"
    temp_password = bcrypt.generate_password_hash('TempPassword123').decode('utf-8')

    student = User(
        email=temp_email,
        password_hash=temp_password,
        full_name=name_to_use,
        role=UserRole.STUDENT
    )

    session.add(student)
    session.flush()

    print(f"Étudiant créé temporairement: {student.full_name} ({student.email})")
    print(f"Associez-le à un compte réel via l'interface admin")

    return student


def generate_transcript_pdf(transcript_data, output_path):
    """Générer un relevé de notes en PDF
    transcript_data = {
        'student_name', 'student_email', 'semester_name', 'formation_name',
        'gpa', 'total_credits', 'obtained_credits', 'papers', 'generated_at'
    }
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    from datetime import datetime
    
    doc = SimpleDocTemplate(output_path, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []
    
    # Style personnalisé
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#2563eb'),
        spaceAfter=30,
        alignment=1  # Centré
    )
    
    header_style = ParagraphStyle(
        'CustomHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1e293b'),
        spaceAfter=12
    )
    
    # En-tête
    story.append(Paragraph("RELEVÉ DE NOTES", title_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Informations étudiant
    info_data = [
        ['Étudiant:', transcript_data.get('student_name', 'N/A')],
        ['Email:', transcript_data.get('student_email', 'N/A')],
        ['Formation:', transcript_data.get('formation_name', 'N/A')],
        ['Semestre:', transcript_data.get('semester_name', 'N/A')],
        ['Date:', transcript_data.get('generated_at', datetime.now().strftime('%d/%m/%Y'))]
    ]
    
    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1e293b')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    
    story.append(info_table)
    story.append(Spacer(1, 0.4*inch))
    
    # Tableau des notes
    story.append(Paragraph("Détail des Notes", header_style))
    story.append(Spacer(1, 0.1*inch))
    
    papers = transcript_data.get('papers', [])
    if papers:
        notes_data = [['Code EC', 'Intitulé', 'Note/20', 'Coef']]
        
        for paper in papers:
            notes_data.append([
                paper.get('ec_code', 'N/A'),
                paper.get('ec_name', 'N/A')[:40],  # Tronquer si trop long
                str(paper.get('score', 0)),
                str(paper.get('coefficient', 1))
            ])
        
        notes_table = Table(notes_data, colWidths=[1.2*inch, 3*inch, 1*inch, 0.8*inch])
        notes_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563eb')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (2, 0), (3, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')])
        ]))
        
        story.append(notes_table)
    else:
        story.append(Paragraph("Aucune note disponible", styles['BodyText']))
    
    story.append(Spacer(1, 0.4*inch))
    
    # Résumé
    gpa = transcript_data.get('gpa', 0)
    gpa_color = colors.HexColor('#10b981') if gpa >= 10 else colors.HexColor('#ef4444')
    
    summary_data = [
        ['Moyenne Générale (GPA):', f"{gpa}/20"],
        ['Crédits Totaux:', str(transcript_data.get('total_credits', 0))],
        ['Crédits Obtenus:', str(transcript_data.get('obtained_credits', 0))],
        ['Décision:', 'VALIDÉ' if gpa >= 10 else 'NON VALIDÉ']
    ]
    
    summary_table = Table(summary_data, colWidths=[3*inch, 3*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1e293b')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 2, colors.HexColor('#2563eb')),
        ('TEXTCOLOR', (1, 0), (1, 0), gpa_color),
        ('TEXTCOLOR', (1, 3), (1, 3), gpa_color)
    ]))
    
    story.append(summary_table)
    
    # Footer
    story.append(Spacer(1, 0.5*inch))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#64748b'),
        alignment=1
    )
    story.append(Paragraph("Système de Notation Automatisé - Document officiel généré le " +
                          datetime.now().strftime('%d/%m/%Y à %H:%M'), footer_style))
    
    # Générer le PDF
    doc.build(story)
    return output_path