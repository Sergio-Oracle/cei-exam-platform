"""
Routes de proctoring LiveKit
Surveillance en temps réel des examens en ligne
"""
from flask import Blueprint, jsonify, request, render_template, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
import jwt as pyjwt
import time
import json
import os
import urllib.request as urlreq
import urllib.error
from datetime import datetime, timezone, timedelta
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

from models import (
    get_session, ExamAttempt, OnlineExam, ExamActivityLog, User,
    AttemptStatus, UserRole, ExamStatus, CameraLog
)

proctoring_bp = Blueprint('proctoring', __name__)


# ============================================================================
# TOKEN LIVEKIT
# ============================================================================

def generate_livekit_token(api_key, api_secret, identity, room_name,
                            can_publish=True, can_subscribe=True, ttl=3600):
    """Générer un token JWT LiveKit"""
    now = int(time.time())
    payload = {
        'exp': now + ttl,
        'iss': api_key,
        'nbf': now,
        'sub': identity,
        'video': {
            'room': room_name,
            'roomJoin': True,
            'canPublish': can_publish,
            'canSubscribe': can_subscribe,
            'canPublishData': True,
        }
    }
    return pyjwt.encode(payload, api_secret, algorithm='HS256')


def get_livekit_config():
    """Récupérer la configuration LiveKit depuis les variables d'environnement"""
    return {
        'url': os.environ.get('LIVEKIT_URL', ''),
        'api_key': os.environ.get('LIVEKIT_API_KEY', ''),
        'api_secret': os.environ.get('LIVEKIT_API_SECRET', ''),
    }


def compute_risk_score(attempt):
    """Calculer le score de risque basé sur les événements de l'attempt (0-100)"""
    base = 0
    base += min(attempt.tab_switches * 15, 60)
    base += min(attempt.warnings_count * 5, 40)
    return min(base, 100)


# ============================================================================
# PAGES HTML (rendu templates)
# ============================================================================

@proctoring_bp.route('/proctor/exam/<int:attempt_id>')
def proctor_exam_page(attempt_id):
    """Page d'examen surveillée pour l'étudiant (authentification côté JS)"""
    return render_template('proctor_exam.html', attempt_id=attempt_id)


@proctoring_bp.route('/proctor/monitor/<int:exam_id>')
def proctor_monitor_page(exam_id):
    """Dashboard de surveillance pour le professeur (authentification côté JS)"""
    return render_template('proctor_dashboard.html', exam_id=exam_id)


# ============================================================================
# API : TOKEN LIVEKIT ÉTUDIANT
# ============================================================================

@proctoring_bp.route('/api/exam_attempts/<int:attempt_id>/livekit_token', methods=['GET'])
@jwt_required()
def get_student_livekit_token(attempt_id):
    """Retourner le token LiveKit pour l'étudiant qui passe l'examen"""
    user_id = int(get_jwt_identity())
    claims = get_jwt()
    role = claims.get('role')

    config = get_livekit_config()
    if not all([config['url'], config['api_key'], config['api_secret']]):
        return jsonify({'error': 'LiveKit non configuré sur le serveur'}), 503

    session = get_session()
    try:
        attempt = session.query(ExamAttempt).filter_by(id=attempt_id).first()
        if not attempt:
            return jsonify({'error': 'Tentative introuvable'}), 404

        # Seul l'étudiant concerné ou un prof/admin peut appeler cet endpoint
        if role == 'student' and attempt.student_id != user_id:
            return jsonify({'error': 'Accès refusé'}), 403

        room_name = f'exam-{attempt.exam_id}'

        if role == 'student':
            identity = f'student-{user_id}'
            ttl = attempt.exam.duration_minutes * 60 + 600  # durée + 10 min tampon
            token = generate_livekit_token(
                config['api_key'], config['api_secret'],
                identity, room_name,
                can_publish=True, can_subscribe=True,
                ttl=ttl
            )
        else:
            identity = f'teacher-{user_id}'
            token = generate_livekit_token(
                config['api_key'], config['api_secret'],
                identity, room_name,
                can_publish=True, can_subscribe=True,
                ttl=7200
            )

        return jsonify({
            'token': token,
            'ws_url': config['url'],
            'room': room_name,
            'identity': identity
        })
    finally:
        session.close()


# ============================================================================
# API : TOKEN LIVEKIT PROFESSEUR (accès monitoring d'un examen complet)
# ============================================================================

@proctoring_bp.route('/api/online_exams/<int:exam_id>/proctor_token', methods=['GET'])
@jwt_required()
def get_teacher_proctor_token(exam_id):
    """Token LiveKit pour le professeur/admin qui monitore un examen"""
    user_id = int(get_jwt_identity())
    claims = get_jwt()
    role = claims.get('role')

    if role not in ['professor', 'admin']:
        return jsonify({'error': 'Accès réservé aux enseignants'}), 403

    config = get_livekit_config()
    if not all([config['url'], config['api_key'], config['api_secret']]):
        return jsonify({'error': 'LiveKit non configuré sur le serveur'}), 503

    session = get_session()
    try:
        exam = session.query(OnlineExam).filter_by(id=exam_id).first()
        if not exam:
            return jsonify({'error': 'Examen introuvable'}), 404

        room_name = f'exam-{exam_id}'
        identity = f'teacher-{user_id}'
        token = generate_livekit_token(
            config['api_key'], config['api_secret'],
            identity, room_name,
            can_publish=True, can_subscribe=True,
            ttl=7200
        )

        return jsonify({
            'token': token,
            'ws_url': config['url'],
            'room': room_name,
            'identity': identity,
            'exam_title': exam.title
        })
    finally:
        session.close()


# ============================================================================
# API : ÉVÉNEMENTS PROCTORING (caméra / détection visage)
# ============================================================================

@proctoring_bp.route('/api/exam_attempts/<int:attempt_id>/proctoring_event', methods=['POST'])
@jwt_required()
def log_proctoring_event(attempt_id):
    """Logger un événement de proctoring (détection visage, caméra, etc.)"""
    user_id = int(get_jwt_identity())

    session = get_session()
    try:
        attempt = session.query(ExamAttempt).filter_by(
            id=attempt_id, student_id=user_id
        ).first()
        if not attempt:
            return jsonify({'error': 'Tentative introuvable'}), 404

        if attempt.status != AttemptStatus.IN_PROGRESS:
            return jsonify({'error': 'Tentative non active'}), 400

        data = request.get_json() or {}
        event_type = data.get('event_type', 'proctoring_event')
        event_data = data.get('event_data', '')

        # Enregistrer dans les logs d'activité
        log = ExamActivityLog(
            attempt_id=attempt_id,
            event_type=event_type,
            event_data=event_data if isinstance(event_data, str) else json.dumps(event_data)
        )
        session.add(log)

        # Augmenter le score de risque selon le type d'événement
        proctoring_risk_map = {
            'no_face_detected': 10,
            'multiple_faces': 20,
            'face_covered': 15,
            'camera_blocked': 25,
            'audio_suspicious': 10,
            'session_end': 0,
        }
        risk_increment = proctoring_risk_map.get(event_type, 5)

        if event_type != 'session_end':
            attempt.risk_score = min((attempt.risk_score or 0) + risk_increment, 100)

        session.commit()

        return jsonify({
            'success': True,
            'risk_score': attempt.risk_score,
            'banned': attempt.status == AttemptStatus.BANNED
        })
    finally:
        session.close()


# ============================================================================
# API : STATUT DE RISQUE EN TEMPS RÉEL
# ============================================================================

@proctoring_bp.route('/api/exam_attempts/<int:attempt_id>/risk_status', methods=['GET'])
@jwt_required()
def get_risk_status(attempt_id):
    """Retourner le score de risque et le statut de bannissement de l'étudiant"""
    user_id = int(get_jwt_identity())
    claims = get_jwt()
    role = claims.get('role')

    session = get_session()
    try:
        attempt = session.query(ExamAttempt).filter_by(id=attempt_id).first()
        if not attempt:
            return jsonify({'error': 'Tentative introuvable'}), 404

        if role == 'student' and attempt.student_id != user_id:
            return jsonify({'error': 'Accès refusé'}), 403

        return jsonify({
            'success': True,
            'risk_score': attempt.risk_score or 0,
            'warnings_count': attempt.warnings_count,
            'tab_switches': attempt.tab_switches,
            'banned': attempt.status == AttemptStatus.BANNED,
            'ban_reason': attempt.ban_reason
        })
    finally:
        session.close()


# ============================================================================
# API : ENVOYER UN AVERTISSEMENT (prof → étudiant via réponse polling)
# ============================================================================

@proctoring_bp.route('/api/exam_attempts/<int:attempt_id>/send_warning', methods=['POST'])
@jwt_required()
def send_proctoring_warning(attempt_id):
    """Prof envoie un avertissement à un étudiant (stocké en BDD, récupéré par polling)"""
    claims = get_jwt()
    role = claims.get('role')

    if role not in ['professor', 'admin']:
        return jsonify({'error': 'Accès réservé aux enseignants'}), 403

    session = get_session()
    try:
        attempt = session.query(ExamAttempt).filter_by(id=attempt_id).first()
        if not attempt:
            return jsonify({'error': 'Tentative introuvable'}), 404

        data = request.get_json() or {}
        message = data.get('message', 'Avertissement de l\'enseignant')
        warning_type = data.get('type', 'warning')  # 'warning' ou 'message'

        # Stocker le message comme log d'activité (lu par l'étudiant en polling)
        log = ExamActivityLog(
            attempt_id=attempt_id,
            event_type=f'teacher_{warning_type}',
            event_data=json.dumps({'message': message, 'from_teacher': True,
                                   'timestamp': datetime.utcnow().isoformat()})
        )
        session.add(log)
        attempt.warnings_count += 1
        session.commit()

        return jsonify({'success': True, 'message': 'Avertissement envoyé'})
    finally:
        session.close()


# ============================================================================
# API : BANNIR UN ÉTUDIANT (prof)
# ============================================================================

@proctoring_bp.route('/api/exam_attempts/<int:attempt_id>/proctor_ban', methods=['POST'])
@jwt_required()
def proctor_ban_student(attempt_id):
    """Prof bannit un étudiant depuis le dashboard"""
    claims = get_jwt()
    role = claims.get('role')

    if role not in ['professor', 'admin']:
        return jsonify({'error': 'Accès réservé aux enseignants'}), 403

    session = get_session()
    try:
        attempt = session.query(ExamAttempt).filter_by(id=attempt_id).first()
        if not attempt:
            return jsonify({'error': 'Tentative introuvable'}), 404

        data = request.get_json() or {}
        reason = data.get('reason', 'Exclu par l\'enseignant')

        attempt.status = AttemptStatus.BANNED
        attempt.banned_at = datetime.utcnow()
        attempt.ban_reason = reason

        log = ExamActivityLog(
            attempt_id=attempt_id,
            event_type='teacher_ban',
            event_data=json.dumps({'reason': reason, 'from_teacher': True,
                                   'timestamp': datetime.utcnow().isoformat()})
        )
        session.add(log)
        session.commit()

        return jsonify({'success': True, 'message': f'Étudiant banni: {reason}'})
    finally:
        session.close()


# ============================================================================
# API : LISTE DES ÉTUDIANTS ACTIFS (pour dashboard prof)
# ============================================================================

@proctoring_bp.route('/api/online_exams/<int:exam_id>/active_proctoring', methods=['GET'])
@jwt_required()
def get_active_proctoring(exam_id):
    """Liste des tentatives actives pour un examen (polling dashboard prof)"""
    claims = get_jwt()
    role = claims.get('role')

    if role not in ['professor', 'admin']:
        return jsonify({'error': 'Accès réservé aux enseignants'}), 403

    session = get_session()
    try:
        exam = session.query(OnlineExam).filter_by(id=exam_id).first()
        if not exam:
            return jsonify({'error': 'Examen introuvable'}), 404

        attempts = session.query(ExamAttempt).filter_by(exam_id=exam_id).all()

        result = []
        for a in attempts:
            result.append({
                'attempt_id': a.id,
                'student_id': a.student_id,
                'student_name': a.student.full_name if a.student else '?',
                'student_email': a.student.email if a.student else '',
                'status': a.status.value,
                'risk_score': a.risk_score or 0,
                'warnings_count': a.warnings_count,
                'tab_switches': a.tab_switches,
                'started_at': a.started_at.isoformat() if a.started_at else None,
                'banned': a.status == AttemptStatus.BANNED,
                'livekit_identity': f'student-{a.student_id}'
            })

        return jsonify({
            'success': True,
            'exam_title': exam.title,
            'exam_status': exam.status.value,
            'attempts': result,
            'total': len(result)
        })
    finally:
        session.close()


# ============================================================================
# API : MESSAGES PROF EN ATTENTE (polling côté étudiant)
# ============================================================================

@proctoring_bp.route('/api/exam_attempts/<int:attempt_id>/pending_messages', methods=['GET'])
@jwt_required()
def get_pending_messages(attempt_id):
    """Récupérer les messages/avertissements prof non encore lus (polling étudiant)"""
    user_id = int(get_jwt_identity())

    session = get_session()
    try:
        attempt = session.query(ExamAttempt).filter_by(
            id=attempt_id, student_id=user_id
        ).first()
        if not attempt:
            return jsonify({'error': 'Tentative introuvable'}), 404

        # Lire les messages depuis les logs (depuis un timestamp donné)
        since_str = request.args.get('since')
        query = session.query(ExamActivityLog).filter(
            ExamActivityLog.attempt_id == attempt_id,
            ExamActivityLog.event_type.in_(['teacher_warning', 'teacher_message', 'teacher_ban'])
        )
        if since_str:
            try:
                since = datetime.fromisoformat(since_str)
                query = query.filter(ExamActivityLog.timestamp > since)
            except ValueError:
                pass

        logs = query.order_by(ExamActivityLog.timestamp.asc()).all()
        messages = []
        for log in logs:
            try:
                data = json.loads(log.event_data)
                messages.append({
                    'type': log.event_type.replace('teacher_', ''),
                    'message': data.get('message', ''),
                    'timestamp': log.timestamp.isoformat() if log.timestamp else None
                })
            except Exception:
                pass

        return jsonify({
            'success': True,
            'messages': messages,
            'banned': attempt.status == AttemptStatus.BANNED,
            'risk_score': attempt.risk_score or 0
        })
    finally:
        session.close()


# ============================================================================
# API : MESSAGE ÉTUDIANT → ENSEIGNANT
# ============================================================================

@proctoring_bp.route('/api/exam_attempts/<int:attempt_id>/student_message', methods=['POST'])
@jwt_required()
def send_student_message(attempt_id):
    """Étudiant envoie un message à l'enseignant pendant l'examen"""
    user_id = int(get_jwt_identity())
    session = get_session()
    try:
        attempt = session.query(ExamAttempt).filter_by(
            id=attempt_id, student_id=user_id
        ).first()
        if not attempt:
            return jsonify({'error': 'Tentative introuvable'}), 404

        if attempt.status.value not in ['in_progress']:
            return jsonify({'error': 'Examen non actif'}), 400

        data = request.get_json() or {}
        message = (data.get('message', '') or '').strip()
        if not message:
            return jsonify({'error': 'Message vide'}), 400

        log = ExamActivityLog(
            attempt_id=attempt_id,
            event_type='student_message',
            event_data=json.dumps({
                'message': message,
                'student_name': attempt.student.full_name if attempt.student else '?',
                'timestamp': datetime.utcnow().isoformat()
            })
        )
        session.add(log)
        session.commit()
        return jsonify({'success': True})
    finally:
        session.close()


@proctoring_bp.route('/api/online_exams/<int:exam_id>/student_messages', methods=['GET'])
@jwt_required()
def get_student_messages(exam_id):
    """Professeur récupère les messages envoyés par les étudiants pour un examen"""
    claims = get_jwt()
    role = claims.get('role')
    if role not in ['professor', 'admin']:
        return jsonify({'error': 'Accès réservé aux enseignants'}), 403

    session = get_session()
    try:
        since_str = request.args.get('since')
        query = session.query(ExamActivityLog).join(
            ExamAttempt, ExamActivityLog.attempt_id == ExamAttempt.id
        ).filter(
            ExamAttempt.exam_id == exam_id,
            ExamActivityLog.event_type == 'student_message'
        )
        if since_str:
            try:
                since = datetime.fromisoformat(since_str)
                query = query.filter(ExamActivityLog.timestamp > since)
            except ValueError:
                pass

        logs = query.order_by(ExamActivityLog.timestamp.desc()).limit(50).all()
        messages = []
        for log in logs:
            try:
                d = json.loads(log.event_data)
                messages.append({
                    'attempt_id': log.attempt_id,
                    'student_name': d.get('student_name', '?'),
                    'message': d.get('message', ''),
                    'timestamp': log.timestamp.isoformat() if log.timestamp else None,
                    'log_id': log.id
                })
            except Exception:
                pass
        return jsonify({'success': True, 'messages': messages})
    finally:
        session.close()


# ============================================================================
# API : ENREGISTREMENT VIDÉO (LiveKit Egress → S3)
# ============================================================================

@proctoring_bp.route('/api/exam_attempts/<int:attempt_id>/recording', methods=['POST'])
@jwt_required()
def toggle_recording(attempt_id):
    """Démarrer ou arrêter l'enregistrement vidéo d'un étudiant via LiveKit Egress"""
    claims = get_jwt()
    role = claims.get('role')
    if role not in ['professor', 'admin']:
        return jsonify({'error': 'Accès réservé aux enseignants'}), 403

    data = request.get_json() or {}
    action = data.get('action', 'start')

    config = get_livekit_config()
    if not all([config['url'], config['api_key'], config['api_secret']]):
        return jsonify({'error': 'LiveKit non configuré'}), 503

    # URL HTTP du serveur LiveKit (pour l'API Twirp)
    lk_http = config['url'].replace('wss://', 'https://').replace('ws://', 'http://')

    session = get_session()
    try:
        attempt = session.query(ExamAttempt).filter_by(id=attempt_id).first()
        if not attempt:
            return jsonify({'error': 'Tentative introuvable'}), 404

        # Token Egress
        now = int(time.time())
        egress_payload = {
            'exp': now + 3600, 'iss': config['api_key'], 'nbf': now,
            'sub': f'recorder-{attempt_id}',
            'video': {'room': f'exam-{attempt.exam_id}', 'roomRecord': True}
        }
        egress_token = pyjwt.encode(egress_payload, config['api_secret'], algorithm='HS256')

        headers = {
            'Authorization': f'Bearer {egress_token}',
            'Content-Type': 'application/json'
        }

        if action == 'start':
            s3_cfg = {
                'access_key': os.environ.get('S3_KEY_ID', ''),
                'secret':     os.environ.get('S3_KEY_SECRET', ''),
                'region':     os.environ.get('S3_REGION', 'us-east-1'),
                'endpoint':   os.environ.get('S3_ENDPOINT', ''),
                'bucket':     os.environ.get('S3_BUCKET', 'livekit-recordings'),
                'force_path_style': True
            }
            filepath = f'recordings/exam-{attempt.exam_id}/student-{attempt.student_id}-attempt-{attempt_id}.mp4'
            body = json.dumps({
                'room_name': f'exam-{attempt.exam_id}',
                'identity':  f'student-{attempt.student_id}',
                'file_outputs': [{'filepath': filepath, 's3': s3_cfg}]
            }).encode()

            req = urlreq.Request(
                f'{lk_http}/twirp/livekit.Egress/StartParticipantEgress',
                data=body, headers=headers
            )
            try:
                with urlreq.urlopen(req, timeout=10) as resp:
                    result = json.loads(resp.read())
                    return jsonify({'success': True, 'egress_id': result.get('egress_id'), 'filepath': filepath})
            except urllib.error.HTTPError as e:
                err_body = e.read().decode()
                return jsonify({'error': f'Egress error: {err_body}'}), 500

        elif action == 'stop':
            egress_id = data.get('egress_id')
            if not egress_id:
                return jsonify({'error': 'egress_id requis'}), 400
            body = json.dumps({'egress_id': egress_id}).encode()
            req = urlreq.Request(
                f'{lk_http}/twirp/livekit.Egress/StopEgress',
                data=body, headers=headers
            )
            try:
                with urlreq.urlopen(req, timeout=10) as resp:
                    return jsonify({'success': True})
            except urllib.error.HTTPError as e:
                err_body = e.read().decode()
                return jsonify({'error': f'Stop egress error: {err_body}'}), 500

        return jsonify({'error': 'action invalide (start|stop)'}), 400
    finally:
        session.close()


# ============================================================================
# ENREGISTREMENTS CAMÉRA (snapshots + métadonnées)
# ============================================================================

@proctoring_bp.route('/api/online_exams/<int:exam_id>/recordings', methods=['GET'])
@jwt_required()
def get_exam_recordings(exam_id):
    """Récupérer les snapshots caméra et informations d'enregistrement pour un examen."""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if not user or user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès réservé aux enseignants'}), 403

        exam = session.query(OnlineExam).filter_by(id=exam_id).first()
        if not exam:
            session.close()
            return jsonify({'error': 'Examen non trouvé'}), 404

        if user.role == UserRole.PROFESSOR and exam.created_by_id != user_id:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        # Récupérer toutes les tentatives avec leurs snapshots
        attempts = session.query(ExamAttempt).filter_by(exam_id=exam_id).all()

        result = []
        for attempt in attempts:
            student = session.query(User).filter_by(id=attempt.student_id).first()
            student_name = student.full_name if student else f'Étudiant #{attempt.student_id}'
            student_email = student.email if student else ''

            # Récupérer les snapshots caméra (image_data = base64)
            snapshots = session.query(CameraLog).filter_by(
                attempt_id=attempt.id
            ).order_by(CameraLog.timestamp.asc()).all()

            snaps_list = []
            for snap in snapshots:
                snaps_list.append({
                    'id': snap.id,
                    'timestamp': snap.timestamp.isoformat() if snap.timestamp else None,
                    'event_type': snap.event_type or snap.violation_type,
                    'image_data': snap.image_data,
                    'face_detected': snap.face_detected,
                    'faces_count': snap.faces_count,
                })

            result.append({
                'attempt_id': attempt.id,
                'student_name': student_name,
                'student_email': student_email,
                'status': attempt.status.value if attempt.status else attempt.status,
                'started_at': attempt.started_at.isoformat() if attempt.started_at else None,
                'submitted_at': attempt.submitted_at.isoformat() if attempt.submitted_at else None,
                'snapshots_count': len(snaps_list),
                'snapshots': snaps_list,
            })

        session.close()
        return jsonify({'exam_id': exam_id, 'students': result})

    except Exception as e:
        print(f"❌ Erreur get_exam_recordings: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ============================================================================
# VIDÉOS D'ENREGISTREMENT S3 (LiveKit Egress)
# ============================================================================

def _get_s3_client():
    """Créer un client boto3 configuré pour le MinIO/S3 de l'application."""
    return boto3.client(
        's3',
        endpoint_url=os.environ.get('S3_ENDPOINT', ''),
        aws_access_key_id=os.environ.get('S3_KEY_ID', ''),
        aws_secret_access_key=os.environ.get('S3_KEY_SECRET', ''),
        region_name=os.environ.get('S3_REGION', 'us-east-1'),
        config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
    )


@proctoring_bp.route('/api/online_exams/<int:exam_id>/video_recordings', methods=['GET'])
@jwt_required()
def get_video_recordings(exam_id):
    """Lister les vidéos d'enregistrement LiveKit (S3) pour un examen."""
    try:
        user_id = int(get_jwt_identity())
        session = get_session()

        user = session.query(User).filter_by(id=user_id).first()
        if not user or user.role not in [UserRole.PROFESSOR, UserRole.ADMIN]:
            session.close()
            return jsonify({'error': 'Accès réservé aux enseignants'}), 403

        exam = session.query(OnlineExam).filter_by(id=exam_id).first()
        if not exam:
            session.close()
            return jsonify({'error': 'Examen non trouvé'}), 404

        if user.role == UserRole.PROFESSOR and exam.created_by_id != user_id:
            session.close()
            return jsonify({'error': 'Accès non autorisé'}), 403

        # Récupérer les tentatives pour retrouver les étudiants
        attempts = session.query(ExamAttempt).filter_by(exam_id=exam_id).all()
        attempt_map = {}
        for a in attempts:
            student = session.query(User).filter_by(id=a.student_id).first()
            attempt_map[a.id] = {
                'student_id': a.student_id,
                'student_name': student.full_name if student else f'Étudiant #{a.student_id}',
                'status': a.status.value if a.status else str(a.status),
                'started_at': a.started_at.isoformat() if a.started_at else None,
            }
        session.close()

        bucket = os.environ.get('S3_BUCKET', 'livekit-recordings')
        prefix = f'recordings/exam-{exam_id}/'

        try:
            s3 = _get_s3_client()
            resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
            objects = resp.get('Contents', [])
        except ClientError as e:
            return jsonify({
                'exam_id': exam_id,
                'videos': [],
                'error': f'Erreur S3: {e.response["Error"]["Message"]}'
            })

        videos = []
        for obj in objects:
            key = obj['Key']
            if not key.endswith('.mp4') and not key.endswith('.webm'):
                continue

            # Extraire attempt_id depuis le nom de fichier
            # Format: recordings/exam-{id}/student-{sid}-attempt-{aid}.mp4
            attempt_id = None
            import re
            m = re.search(r'attempt-(\d+)', key)
            if m:
                attempt_id = int(m.group(1))

            info = attempt_map.get(attempt_id, {})

            # Générer une URL présignée valable 2 heures
            try:
                url = s3.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': bucket, 'Key': key},
                    ExpiresIn=7200
                )
            except ClientError:
                url = None

            videos.append({
                'key': key,
                'filename': key.split('/')[-1],
                'size_mb': round(obj['Size'] / (1024 * 1024), 2),
                'last_modified': obj['LastModified'].isoformat() if obj.get('LastModified') else None,
                'attempt_id': attempt_id,
                'student_name': info.get('student_name', 'Inconnu'),
                'student_status': info.get('status', ''),
                'started_at': info.get('started_at'),
                'url': url,
            })

        # Trier par étudiant
        videos.sort(key=lambda v: v['student_name'])
        return jsonify({'exam_id': exam_id, 'videos': videos, 'prefix': prefix})

    except Exception as e:
        print(f"❌ Erreur get_video_recordings: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
