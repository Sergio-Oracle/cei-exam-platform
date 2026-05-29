/**
 * CEI — Détection de visages pendant les examens en ligne
 * Modèle : MediaPipe Face Detection (via CDN WASM)
 * Fallback : face-api.js SSD MobileNet v1
 *
 * Stratégie anti-faux-positifs :
 *  - Seuil de confiance : 0.75 minimum par visage
 *  - Alerte uniquement après 3 détections consécutives anormales (= ~6 secondes)
 *  - Cooldown 60 s entre deux alertes du même type
 *  - Délai de grâce de 10 s au démarrage (chargement modèle + caméra)
 */

const FaceDetector = (() => {

    // ── Config ────────────────────────────────────────────────────────────────
    const CFG = {
        CHECK_INTERVAL_MS    : 2000,   // analyse toutes les 2 secondes
        CONFIDENCE_THRESHOLD : 0.75,   // score minimal pour compter un visage
        ALERT_CONSECUTIVE    : 3,      // N vérifications anormales consécutives avant alerte
        COOLDOWN_MS          : 60000,  // 60 s entre deux alertes du même type
        GRACE_PERIOD_MS      : 10000,  // délai avant la première analyse
        VIDEO_WIDTH          : 320,    // résolution interne d'analyse (perf)
        VIDEO_HEIGHT         : 240,
    };

    // ── État interne ──────────────────────────────────────────────────────────
    let _detector        = null;   // instance MediaPipe ou face-api
    let _engine          = null;   // 'mediapipe' | 'faceapi' | null
    let _videoEl         = null;   // <video> de la caméra étudiant
    let _canvasEl        = null;   // <canvas> hidden pour l'analyse
    let _ctx             = null;
    let _intervalId      = null;
    let _attemptId       = null;
    let _onAlert         = null;   // callback(type, count, confidence)
    let _running         = false;

    // Compteurs de séquences consécutives
    let _consecutiveNoFace    = 0;
    let _consecutiveMultiFace = 0;

    // Timestamps dernières alertes (cooldown)
    const _lastAlert = { no_face: 0, multiple_faces: 0 };

    // ── Chargement MediaPipe ──────────────────────────────────────────────────
    async function _loadMediaPipe() {
        return new Promise((resolve, reject) => {
            // Charge le script MediaPipe depuis CDN si pas déjà chargé
            if (window.FaceDetection) { resolve(true); return; }

            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4/face_detection.js';
            s.crossOrigin = 'anonymous';
            s.onload = () => {
                const fd = new window.FaceDetection({
                    locateFile: file =>
                        `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4/${file}`
                });
                fd.setOptions({
                    model: 'short',          // modèle courte portée (≤ 2 m, idéal webcam)
                    minDetectionConfidence: CFG.CONFIDENCE_THRESHOLD
                });
                fd.onResults(_onMediaPipeResults);
                fd.initialize().then(() => {
                    _detector = fd;
                    _engine   = 'mediapipe';
                    console.log('[FaceDetector] MediaPipe chargé ✓');
                    resolve(true);
                }).catch(reject);
            };
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // ── Chargement face-api.js (fallback) ────────────────────────────────────
    async function _loadFaceApi() {
        return new Promise((resolve, reject) => {
            if (window.faceapi) { resolve(true); return; }
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
            s.crossOrigin = 'anonymous';
            s.onload = async () => {
                try {
                    const MODEL_URL =
                        'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';
                    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
                    _engine = 'faceapi';
                    console.log('[FaceDetector] face-api.js SSD MobileNet v1 chargé ✓');
                    resolve(true);
                } catch (e) { reject(e); }
            };
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // ── Résultats MediaPipe ───────────────────────────────────────────────────
    let _mpResultCount = 0;   // nombre de visages du dernier résultat MP
    function _onMediaPipeResults(results) {
        _mpResultCount = results.detections ? results.detections.length : 0;
    }

    // ── Analyse d'une frame ───────────────────────────────────────────────────
    async function _analyzeFrame() {
        if (!_videoEl || _videoEl.readyState < 2) return null;

        _ctx.drawImage(_videoEl, 0, 0, CFG.VIDEO_WIDTH, CFG.VIDEO_HEIGHT);

        if (_engine === 'mediapipe') {
            await _detector.send({ image: _canvasEl });
            return _mpResultCount;
        }

        if (_engine === 'faceapi') {
            const detections = await faceapi
                .detectAllFaces(_canvasEl,
                    new faceapi.SsdMobilenetv1Options({
                        minConfidence: CFG.CONFIDENCE_THRESHOLD
                    }));
            return detections.length;
        }

        return null;
    }

    // ── Boucle de surveillance ────────────────────────────────────────────────
    async function _tick() {
        if (!_running) return;

        try {
            const count = await _analyzeFrame();
            if (count === null) return;  // modèle pas prêt

            const now = Date.now();

            // ── Aucun visage détecté ──────────────────────────────────────────
            if (count === 0) {
                _consecutiveNoFace++;
                _consecutiveMultiFace = 0;

                if (_consecutiveNoFace >= CFG.ALERT_CONSECUTIVE
                        && now - _lastAlert.no_face > CFG.COOLDOWN_MS) {
                    _lastAlert.no_face = now;
                    _consecutiveNoFace = 0;
                    _fireAlert('no_face', 0);
                }

            // ── Plusieurs visages ─────────────────────────────────────────────
            } else if (count > 1) {
                _consecutiveMultiFace++;
                _consecutiveNoFace = 0;

                if (_consecutiveMultiFace >= CFG.ALERT_CONSECUTIVE
                        && now - _lastAlert.multiple_faces > CFG.COOLDOWN_MS) {
                    _lastAlert.multiple_faces = now;
                    _consecutiveMultiFace = 0;
                    _fireAlert('multiple_faces', count);
                }

            // ── Situation normale (1 visage) ──────────────────────────────────
            } else {
                _consecutiveNoFace    = 0;
                _consecutiveMultiFace = 0;
            }

        } catch (err) {
            console.warn('[FaceDetector] Erreur analyse frame:', err);
        }
    }

    // ── Déclenchement d'alerte ────────────────────────────────────────────────
    async function _fireAlert(type, faceCount) {
        console.warn(`[FaceDetector] Alerte: ${type} (visages: ${faceCount})`);

        // Callback local (affichage UI)
        if (typeof _onAlert === 'function') {
            _onAlert(type, faceCount);
        }

        // Envoi au backend → incident visible dans le tableau de bord surveillant
        if (_attemptId) {
            try {
                await fetch(`/api/exam_attempts/${_attemptId}/log_activity`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.authToken || localStorage.getItem('authToken') || ''}`
                    },
                    body: JSON.stringify({
                        event_type: type === 'no_face' ? 'face_absent' : 'multiple_faces',
                        event_data: JSON.stringify({
                            face_count : faceCount,
                            engine     : _engine,
                            timestamp  : new Date().toISOString(),
                            severity   : 'high'
                        })
                    })
                });
            } catch (e) {
                console.warn('[FaceDetector] Impossible d\'envoyer l\'alerte au serveur:', e);
            }
        }
    }

    // ── API publique ──────────────────────────────────────────────────────────
    return {

        /**
         * Démarre la détection faciale.
         * @param {HTMLVideoElement} videoEl   Flux caméra de l'étudiant
         * @param {number}           attemptId ID de la tentative d'examen
         * @param {Function}         onAlert   Callback(type, faceCount) pour l'UI
         */
        async start(videoEl, attemptId, onAlert) {
            if (_running) return;

            _videoEl   = videoEl;
            _attemptId = attemptId;
            _onAlert   = onAlert;
            _running   = true;

            // Canvas caché pour l'analyse
            _canvasEl        = document.createElement('canvas');
            _canvasEl.width  = CFG.VIDEO_WIDTH;
            _canvasEl.height = CFG.VIDEO_HEIGHT;
            _ctx = _canvasEl.getContext('2d');

            // Chargement du modèle (MediaPipe en priorité, face-api en fallback)
            try {
                await _loadMediaPipe();
            } catch (e1) {
                console.warn('[FaceDetector] MediaPipe indisponible, tentative face-api.js:', e1);
                try {
                    await _loadFaceApi();
                } catch (e2) {
                    console.error('[FaceDetector] Aucun modèle disponible:', e2);
                    _running = false;
                    return;
                }
            }

            // Délai de grâce (caméra + modèle doivent être prêts)
            await new Promise(r => setTimeout(r, CFG.GRACE_PERIOD_MS));

            console.log(`[FaceDetector] Surveillance démarrée (moteur: ${_engine})`);
            _intervalId = setInterval(_tick, CFG.CHECK_INTERVAL_MS);
        },

        /** Arrête proprement la surveillance. */
        stop() {
            _running = false;
            if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
            _consecutiveNoFace    = 0;
            _consecutiveMultiFace = 0;
            console.log('[FaceDetector] Surveillance arrêtée.');
        },

        /** Retourne true si la détection est active. */
        isRunning() { return _running; },

        /** Expose le moteur utilisé ('mediapipe' | 'faceapi' | null). */
        getEngine() { return _engine; }
    };
})();
