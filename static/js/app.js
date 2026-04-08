// Variables globales
let currentUser = null;
let authToken = null;

// ─── Fuseau horaire de référence : Dakar (UTC+0, pas de DST) ─────────────
const TZ_DAKAR = 'Africa/Dakar';

/**
 * Formater une date ISO en heure locale Dakar.
 * @param {string} isoStr  - chaîne ISO renvoyée par l'API (ex: "2026-01-02T17:54:00+00:00")
 * @param {object} opts    - options Intl supplémentaires
 */
function fmtDakar(isoStr, opts = {}) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleString('fr-FR', {
        timeZone: TZ_DAKAR,
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        ...opts
    });
}
function fmtDakarDate(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleDateString('fr-FR', { timeZone: TZ_DAKAR, day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDakarTime(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleTimeString('fr-FR', { timeZone: TZ_DAKAR, hour: '2-digit', minute: '2-digit' });
}

// ─── Traduction des erreurs techniques en messages lisibles ───────────────
function humanError(err) {
    if (!err) return 'Une erreur inattendue est survenue. Veuillez réessayer.';
    const m = String(err.message || err).toLowerCase();
    if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request'))
        return 'Erreur de connexion réseau. Vérifiez votre connexion internet et réessayez.';
    if (m.includes('timeout') || m.includes('timed out'))
        return 'Le serveur met trop de temps à répondre. Veuillez réessayer dans quelques instants.';
    if (m.includes('aborted'))
        return 'La requête a été interrompue. Veuillez réessayer.';
    if (m.includes('json') || m.includes('unexpected token'))
        return 'Le serveur a renvoyé une réponse inattendue. Veuillez réessayer ou contacter le support.';
    if (m.includes('unauthorized') || m.includes('401'))
        return 'Votre session a expiré. Veuillez vous reconnecter.';
    if (m.includes('forbidden') || m.includes('403'))
        return "Vous n'avez pas les droits nécessaires pour effectuer cette action.";
    if (m.includes('not found') || m.includes('404'))
        return 'La ressource demandée est introuvable.';
    return 'Une erreur inattendue est survenue. Veuillez réessayer ou contacter le support.';
}


// Configuration des requêtes avec JWT
async function authenticatedFetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const config = { ...options, headers };
    
    try {
        const response = await fetch(url, config);
        
        // Gestion de l'expiration de session
        if (response.status === 401 || response.status === 422) {
            localStorage.removeItem('authToken');
            authToken = null;
            currentUser = null;
            showAlert('Votre session a expiré. Veuillez vous reconnecter.', 'warning');
            showLogin();
            throw new Error('Session expirée');
        }
        
        // Gestion des erreurs 403
        if (response.status === 403) {
            const data = await response.json().catch(() => ({}));
            showAlert(data.error || 'Vous n\'avez pas l\'autorisation d\'effectuer cette action', 'error');
            throw new Error('Accès non autorisé');
        }
        
        // Gestion des erreurs 404
        if (response.status === 404) {
            const data = await response.json().catch(() => ({}));
            showAlert(data.error || 'Ressource non trouvée', 'error');
            throw new Error('Ressource non trouvée');
        }
        
        // Gestion des erreurs 400 (mauvaise requête)
        if (response.status === 400) {
            const data = await response.json().catch(() => ({}));
            showAlert(data.error || 'Requête invalide', 'error');
            throw new Error('Requête invalide');
        }
        
        // Gestion des erreurs serveur 500
        if (response.status >= 500) {
            const data = await response.json().catch(() => ({}));
            showAlert(data.error || 'Erreur serveur. Veuillez réessayer plus tard.', 'error');
            throw new Error('Erreur serveur');
        }
        
        return response;
    } catch (error) {
        // Si l'erreur n'a pas déjà été gérée, afficher un message générique
        if (error.message !== 'Session expirée' && 
            error.message !== 'Accès non autorisé' && 
            error.message !== 'Ressource non trouvée' &&
            error.message !== 'Requête invalide' &&
            error.message !== 'Erreur serveur') {
            showAlert('Erreur de connexion. Vérifiez votre connexion internet.', 'error');
        }
        throw error;
    }
}
// Initialisation
// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    authToken = localStorage.getItem('authToken');
    if (authToken) {
        verifyToken();
    } else {
        showLogin();
    }
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    // ✅ Ligne register-form supprimée
});

// Authentification
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    showLoader(true);
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (data.success) {
            authToken = data.access_token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showApp();
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ✅ Fonction handleRegister() SUPPRIMÉE

async function verifyToken() {
    try {
        const response = await authenticatedFetch('/api/auth/me');
        if (response.ok) {
            currentUser = await response.json();
            showApp();
        } else {
            localStorage.removeItem('authToken');
            authToken = null;
            showLogin();
        }
    } catch (error) {
        localStorage.removeItem('authToken');
        authToken = null;
        showLogin();
    }
}

function logout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    window.location.reload();
}

function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    // ✅ Ligne register-screen supprimée
    document.getElementById('app-screen').style.display = 'none';
}

// ✅ Fonction showRegister() SUPPRIMÉE

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    // ✅ Ligne register-screen supprimée
    document.getElementById('app-screen').style.display = 'block';
    document.getElementById('user-name').textContent = currentUser.full_name;
    document.getElementById('user-role').textContent = getRoleLabel(currentUser.role);
    loadNavigation();
    loadDashboard();
}

function getRoleLabel(role) {
    const labels = { 
        'admin': 'Administrateur', 
        'professor': 'Professeur', 
        'student': 'Étudiant' 
    };
    return labels[role] || role;
}
// Navigation
function loadNavigation() {
    const nav = document.getElementById('main-nav');
    let tabs = '';
    
    if (currentUser.role === 'admin') {
        tabs = `<div class="nav-tabs">
            <button class="nav-tab active" onclick="loadDashboard()">
                <i class="fas fa-chart-line"></i> Dashboard
            </button>
            <button class="nav-tab" onclick="showCreateCourseWithAISuggestionsModal()">
                <i class="fas fa-magic"></i> Créer Cours + IA
            </button>
            <button class="nav-tab" onclick="loadCreateSubject()">
                <i class="fas fa-plus-circle"></i> Créer Sujet
            </button>
            <button class="nav-tab" onclick="loadUsers()">
                <i class="fas fa-users"></i> Utilisateurs
            </button>
            <button class="nav-tab" onclick="loadSubjects()">
                <i class="fas fa-file-alt"></i> Sujets
            </button>
            <button class="nav-tab" onclick="loadCorrectedPapersList()">
                <i class="fas fa-check-circle"></i> Copies Corrigées
            </button>
            <button class="nav-tab" onclick="loadMaquette()">
                <i class="fas fa-layer-group"></i> Maquette
            </button>
            <button class="nav-tab" onclick="loadECAssignments()">
                <i class="fas fa-link"></i> Affectations EC
            </button>
            <button class="nav-tab" onclick="loadStudentEnrollments()">
                <i class="fas fa-user-graduate"></i> Inscriptions UE
            </button>
            <button class="nav-tab" onclick="loadOnlineExams()">
                <i class="fas fa-laptop-code"></i> Examens en Ligne
            </button>
            <button class="nav-tab" onclick="loadExamsHistory()">
                <i class="fas fa-history"></i> Historique Examens
            </button>
            <button class="nav-tab" onclick="loadTranscripts()">
                <i class="fas fa-file-alt"></i> Relevés de Notes
            </button>
            <button class="nav-tab" onclick="loadReclamations()">
                <i class="fas fa-exclamation-triangle"></i> Réclamations
            </button>
            <!-- ✅ NOUVEAU : Bouton Thème -->
            <button class="nav-tab" onclick="toggleTheme()" id="theme-toggle-btn" title="Changer de thème">
                <i class="fas fa-moon"></i>
            </button>
        </div>`;
    } else if (currentUser.role === 'professor') {
    tabs = `<div class="nav-tabs">
        <button class="nav-tab active" onclick="loadDashboard()">
            <i class="fas fa-chart-line"></i> Dashboard
        </button>
        <button class="nav-tab" onclick="showCreateCourseWithAISuggestionsModal()">
            <i class="fas fa-magic"></i> Créer Cours + IA
        </button>
        <button class="nav-tab" onclick="loadCreateSubject()">
            <i class="fas fa-plus-circle"></i> Créer Sujet
        </button>
        <button class="nav-tab" onclick="loadCorrectPapers()">
            <i class="fas fa-pencil-alt"></i> Corriger Copies
        </button>
        <button class="nav-tab" onclick="loadCorrectedPapersList()">
            <i class="fas fa-check-circle"></i> Copies Corrigées
        </button>
        <button class="nav-tab" onclick="loadMySubjects()">
            <i class="fas fa-book"></i> Mes Sujets
        </button>
        <button class="nav-tab" onclick="loadOnlineExams()">
            <i class="fas fa-laptop-code"></i> Examens en Ligne
        </button>
        <button class="nav-tab" onclick="loadExamCorrections()">
            <i class="fas fa-check-circle"></i> Corriger Examens en Ligne
        </button>
        <button class="nav-tab" onclick="loadViewResults()">
            <i class="fas fa-chart-bar"></i> Résultats
        </button>
        <button class="nav-tab" onclick="loadTranscripts()">
            <i class="fas fa-file-alt"></i> Relevés de Notes
        </button>
        <button class="nav-tab" onclick="loadReclamations()">
            <i class="fas fa-exclamation-triangle"></i> Réclamations
        </button>
        <button class="nav-tab" id="notif-tab" onclick="showProfessorNotifications()" style="position: relative;">
            <i class="fas fa-bell"></i> Notifications
            <span id="notif-badge" style="display: none; position: absolute; top: 5px; right: 5px; background: #ef4444; color: white; border-radius: 50%; width: 20px; height: 20px; font-size: 11px; line-height: 20px; text-align: center;"></span>
        </button>
        <!-- ✅ NOUVEAU : Bouton Thème -->
        <button class="nav-tab" onclick="toggleTheme()" id="theme-toggle-btn" title="Changer de thème">
            <i class="fas fa-moon"></i>
        </button>
    </div>`;

    } else {
        tabs = `<div class="nav-tabs">
            <button class="nav-tab active" onclick="loadDashboard()">
                <i class="fas fa-chart-bar"></i> Mes Notes
            </button>
            <button class="nav-tab" onclick="loadOnlineExams()">
                <i class="fas fa-laptop-code"></i> Mes Examens en Ligne
            </button>
            <button class="nav-tab" onclick="loadMyTranscripts()">
                <i class="fas fa-file-alt"></i> Mes Relevés
            </button>
            <button class="nav-tab" onclick="loadMyReclamations()">
                <i class="fas fa-exclamation-circle"></i> Mes Réclamations
            </button>
            <button class="nav-tab" onclick="toggleTheme()" id="theme-toggle-btn" title="Changer de thème">
                <i class="fas fa-moon"></i>
            </button>
        </div>`;
    }
    
    nav.innerHTML = tabs;
}

function setActiveTab(button) {
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    if (button) button.classList.add('active');
}

// Dashboard
async function loadDashboard() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    if (currentUser.role === 'admin') await loadAdminDashboard();
    else if (currentUser.role === 'professor') await loadProfessorDashboard();
    else await loadStudentDashboard();
}

async function loadAdminDashboard() {
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/admin/dashboard');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const data = await response.json();
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-chart-line"></i> Tableau de Bord Administrateur</h2>
            </div>
            <div class="grid">
                <div class="stat-card">
                    <div class="stat-label"><i class="fas fa-users"></i> Total Utilisateurs</div>
                    <div class="stat-value">${data.total_users || 0}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label"><i class="fas fa-user-graduate"></i> Étudiants</div>
                    <div class="stat-value">${data.total_students || 0}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label"><i class="fas fa-chalkboard-teacher"></i> Professeurs</div>
                    <div class="stat-value">${data.total_professors || 0}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label"><i class="fas fa-file-alt"></i> Sujets</div>
                    <div class="stat-value">${data.total_subjects || 0}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label"><i class="fas fa-file"></i> Copies</div>
                    <div class="stat-value">${data.total_papers || 0}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label"><i class="fas fa-check-circle"></i> Copies Corrigées</div>
                    <div class="stat-value">${data.total_corrected_papers || 0}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label"><i class="fas fa-exclamation-triangle"></i> Réclamations</div>
                    <div class="stat-value">${data.pending_reclamations || 0}</div>
                </div>
            </div>
            <div style="margin-top:16px;">
                <button class="btn btn-primary" onclick="loadAdminCorrectedPapers()">
                    <i class="fas fa-file-pdf"></i> Voir copies corrigées récentes
                </button>
            </div>
        `;
    } catch (error) {
        showAlert('Impossible de charger le tableau de bord. Veuillez actualiser la page.', 'error');
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-chart-line"></i> Tableau de Bord Administrateur</h2>
            </div>
            <div class="alert alert-error">
                <i class="fas fa-exclamation-circle"></i>
                <div>Erreur de chargement des données. Veuillez vérifier la base de données ou réessayer.</div>
            </div>
        `;
    } finally {
        showLoader(false);
    }
}

async function loadProfessorDashboard() {
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/professor/dashboard');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const data = await response.json();
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-chart-line"></i> Tableau de Bord Professeur</h2>
                <p>Bienvenue ${currentUser.full_name}</p>
            </div>
            <div class="grid">
                <div class="stat-card">
                    <div class="stat-label"><i class="fas fa-book"></i> Mes Sujets</div>
                    <div class="stat-value">${data.my_subjects}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label"><i class="fas fa-check-circle"></i> Copies Corrigées</div>
                    <div class="stat-value">${data.papers_corrected}</div>
                </div>
            </div>
            <div class="card mt-3">
                <div class="card-header">
                    <h3><i class="fas fa-rocket"></i> Actions Rapides</h3>
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-primary" onclick="loadCreateSubject()">
                        <i class="fas fa-plus-circle"></i> Créer un Sujet
                    </button>
                    <button class="btn btn-success" onclick="loadCorrectPapers()">
                        <i class="fas fa-pencil-alt"></i> Corriger des Copies
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function loadAdminCorrectedPapers() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/admin/corrected_papers');
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        let html = `<div class="page-header">
            <h2><i class="fas fa-file-pdf"></i> Copies corrigées récentes</h2>
        </div>`;
        if (!data.papers || data.papers.length === 0) {
            html += `<div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                <div>Aucune copie corrigée récemment.</div>
            </div>`;
        } else {
            html += `<div class="card">
                <table class="user-table">
                    <thead>
                        <tr>
                            <th><i class="fas fa-user"></i> Étudiant</th>
                            <th><i class="fas fa-envelope"></i> Email</th>
                            <th><i class="fas fa-file-alt"></i> Sujet</th>
                            <th><i class="fas fa-star"></i> Note</th>
                            <th><i class="fas fa-calendar"></i> Date</th>
                            <th><i class="fas fa-cog"></i> Actions</th>
                        </tr>
                    </thead>
                    <tbody>`;
            data.papers.forEach(p => {
                html += `<tr>
                    <td>${p.student_name}</td>
                    <td>${p.student_email}</td>
                    <td>${p.subject_title}</td>
                    <td>${p.score !== null ? p.score + '/20' : 'N/A'}</td>
                    <td>${p.corrected_at ? new Date(p.corrected_at).toLocaleString('fr-FR') : 'N/A'}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="viewPaperDetail(${p.id})">
                            <i class="fas fa-eye"></i> Détail
                        </button>
                    </td>
                </tr>`;
            });
            html += `</tbody></table></div>`;
        }
        document.getElementById('main-content').innerHTML = html;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function loadStudentDashboard() {
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/student/papers');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const papers = await response.json();
        const content = document.getElementById('main-content');

        if (papers.length === 0) {
            content.innerHTML = `
                <div class="page-header">
                    <h2><i class="fas fa-chart-bar"></i> Mes Notes</h2>
                    <p>Bienvenue ${currentUser.full_name}</p>
                </div>
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    <div>Vous n'avez pas encore de copies corrigées.</div>
                </div>
            `;
        } else {
            const scores = papers.filter(p => p.score).map(p => p.score);
            const average = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;

            let papersHTML = papers.map(paper => {
                const scoreClass = paper.score >= 10 ? 'success' : 'danger';
                return `<tr>
                    <td>${paper.subject_title}</td>
                    <td><span class="status-badge ${scoreClass}">
                        <i class="fas ${paper.score >= 10 ? 'fa-check' : 'fa-times'}"></i>
                        ${paper.score ? paper.score + '/20' : 'En attente'}
                    </span></td>
                    <td><i class="fas fa-calendar"></i> ${new Date(paper.created_at).toLocaleDateString('fr-FR')}</td>
                    <td>
                        ${paper.score ? `
                            <button class="btn btn-sm btn-success" onclick="exportPaperPDF(${paper.id})" title="Télécharger la copie corrigée">
                                <i class="fas fa-file-pdf"></i> Export PDF
                            </button>
                            <button class="btn btn-sm btn-warning" onclick="showCreateReclamationModal(${paper.id})" title="Contester la note">
                                <i class="fas fa-exclamation-triangle"></i> Réclamer
                            </button>
                        ` : '<span style="color: #94a3b8;"><i class="fas fa-clock"></i> En attente de correction</span>'}
                    </td>
                </tr>`;
            }).join('');

            content.innerHTML = `
                <div class="page-header">
                    <h2><i class="fas fa-chart-bar"></i> Mes Notes</h2>
                    <p>Bienvenue ${currentUser.full_name}</p>
                </div>
                <div class="grid">
                    <div class="stat-card">
                        <div class="stat-label"><i class="fas fa-file"></i> Copies</div>
                        <div class="stat-value">${papers.length}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label"><i class="fas fa-star"></i> Moyenne</div>
                        <div class="stat-value">${average}/20</div>
                    </div>
                </div>
                <div class="card mt-3">
                    <div class="card-header">
                        <h3><i class="fas fa-file-alt"></i> Mes Copies</h3>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th><i class="fas fa-book"></i> Sujet</th>
                                <th><i class="fas fa-star"></i> Note</th>
                                <th><i class="fas fa-calendar"></i> Date</th>
                                <th><i class="fas fa-cog"></i> Actions</th>
                            </tr>
                        </thead>
                        <tbody>${papersHTML}</tbody>
                    </table>
                </div>
            `;
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// GESTION DES UTILISATEURS
// ============================================================================
async function loadUsers() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
   
    try {
        const response = await authenticatedFetch('/api/admin/users');
        const users = await response.json();
       
        const students = users.filter(u => u.role === 'student');
        const professors = users.filter(u => u.role === 'professor');
        const admins = users.filter(u => u.role === 'admin');
       
        let html = `
        <div class="user-management">
            <div class="user-header">
                <h2>Gestion des Utilisateurs</h2>
                <div class="user-stats">
                    <span>${admins.length} admin(s)</span>
                    <span>${professors.length} professeur(s)</span>
                    <span>${students.length} étudiant(s)</span>
                </div>
            </div>
            <div class="create-buttons">
                <button onclick="showCreateUserModal('student')" class="btn btn-primary">
                    Créer Étudiant
                </button>
                <button onclick="showCreateUserModal('professor')" class="btn btn-primary">
                    Créer Professeur
                </button>
                <button onclick="showCreateStudentNoEmailModal()" class="btn btn-success">
                    <i class="fas fa-user-plus"></i> Créer Étudiant (Sans Email)
                </button>
                <button onclick="showImportUsersModal()" class="btn btn-success">
                    Import CSV Bulk
                </button>
            </div>
    `;
        // Section ADMINISTRATEURS
        if (admins.length > 0) {
            html += `
                <div class="user-section">
                    <h3><i class="fas fa-crown"></i> Administrateurs (${admins.length})</h3>
                    <table class="user-table">
                        <thead>
                            <tr>
                                <th><i class="fas fa-user"></i> Nom</th>
                                <th><i class="fas fa-envelope"></i> Email</th>
                                <th><i class="fas fa-check-circle"></i> Statut</th>
                                <th><i class="fas fa-cog"></i> Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
           
            admins.forEach(user => {
                html += `
                    <tr>
                        <td>${user.full_name}</td>
                        <td>${user.email}</td>
                        <td>${user.is_active ? '<i class="fas fa-check-circle" style="color: var(--success)"></i> Actif' : '<i class="fas fa-times-circle" style="color: var(--danger)"></i> Inactif'}</td>
                        <td>
                            <button onclick="showEditUserModal(${user.id})" class="btn-icon-sm btn-primary">
                                <i class="fas fa-edit"></i> Modifier
                            </button>
                        </td>
                    </tr>
                `;
            });
           
            html += `</tbody></table></div>`;
        }
       
        // Section PROFESSEURS
        html += `
            <div class="user-section">
                <h3><i class="fas fa-chalkboard-teacher"></i> Professeurs (${professors.length})</h3>
        `;
       
        if (professors.length === 0) {
            html += `<p class="empty-message"><i class="fas fa-inbox"></i> Aucun professeur pour le moment</p>`;
        } else {
            html += `
                <table class="user-table">
                    <thead>
                        <tr>
                            <th><i class="fas fa-user"></i> Nom</th>
                            <th><i class="fas fa-envelope"></i> Email</th>
                            <th><i class="fas fa-check-circle"></i> Statut</th>
                            <th><i class="fas fa-cog"></i> Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
           
            professors.forEach(user => {
                html += `
                    <tr>
                        <td>${user.full_name}</td>
                        <td>${user.email}</td>
                        <td>${user.is_active ? '<i class="fas fa-check-circle" style="color: var(--success)"></i> Actif' : '<i class="fas fa-times-circle" style="color: var(--danger)"></i> Inactif'}</td>
                        <td>
                            <button onclick="showEditUserModal(${user.id})" class="btn-icon-sm btn-primary">
                                <i class="fas fa-edit"></i> Modifier
                            </button>
                            <button onclick="deleteUser(${user.id})" class="btn-icon-sm btn-danger">
                                <i class="fas fa-trash"></i> Supprimer
                            </button>
                        </td>
                    </tr>
                `;
            });
           
            html += `</tbody></table>`;
        }
        html += `</div>`;
       
        // Section ÉTUDIANTS
        html += `
            <div class="user-section">
                <h3><i class="fas fa-user-graduate"></i> Étudiants (${students.length})</h3>
        `;
       
        if (students.length === 0) {
            html += `<p class="empty-message"><i class="fas fa-inbox"></i> Aucun étudiant pour le moment</p>`;
        } else {
            html += `
                <table class="user-table">
                    <thead>
                        <tr>
                            <th><i class="fas fa-user"></i> Nom</th>
                            <th><i class="fas fa-envelope"></i> Email</th>
                            <th><i class="fas fa-check-circle"></i> Statut</th>
                            <th><i class="fas fa-cog"></i> Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
           
            students.forEach(user => {
                html += `
                    <tr>
                        <td>${user.full_name}</td>
                        <td>${user.email}</td>
                        <td>${user.is_active ? '<i class="fas fa-check-circle" style="color: var(--success)"></i> Actif' : '<i class="fas fa-times-circle" style="color: var(--danger)"></i> Inactif'}</td>
                        <td>
                            <button onclick="showEditUserModal(${user.id})" class="btn-icon-sm btn-primary">
                                <i class="fas fa-edit"></i> Modifier
                            </button>
                            <button onclick="deleteUser(${user.id})" class="btn-icon-sm btn-danger">
                                <i class="fas fa-trash"></i> Supprimer
                            </button>
                        </td>
                    </tr>
                `;
            });
           
            html += `</tbody></table>`;
        }
        html += `</div></div>`;
       
        document.getElementById('main-content').innerHTML = html;
       
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

function showCreateUserModal(role = 'student') {
    const modalContent = `
        <h2><i class="fas fa-user-plus"></i> Créer un ${role === 'professor' ? 'Professeur' : 'Étudiant'}</h2>
        <form id="create-user-form">
            <div class="form-group">
                <label><i class="fas fa-user"></i> Nom Complet *</label>
                <input type="text" id="new-user-name" required>
            </div>
            <div class="form-group">
                <label><i class="fas fa-envelope"></i> Email *</label>
                <input type="email" id="new-user-email" required>
            </div>
            <div class="form-group">
                <label><i class="fas fa-lock"></i> Mot de Passe *</label>
                <input type="password" id="new-user-password" required>
            </div>
            <div class="form-group">
                <label><i class="fas fa-user-tag"></i> Rôle</label>
                <select id="new-user-role">
                    <option value="student" ${role === 'student' ? 'selected' : ''}>Étudiant</option>
                    <option value="professor" ${role === 'professor' ? 'selected' : ''}>Professeur</option>
                </select>
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-check"></i> Créer
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Annuler
                </button>
            </div>
        </form>
    `;
    showModal(modalContent);
    document.getElementById('create-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader(true);
        try {
            const response = await authenticatedFetch('/api/admin/users', {
                method: 'POST',
                body: JSON.stringify({
                    full_name: document.getElementById('new-user-name').value,
                    email: document.getElementById('new-user-email').value,
                    password: document.getElementById('new-user-password').value,
                    role: document.getElementById('new-user-role').value
                })
            });
            const data = await response.json();
            if (data.success) {
                showAlert("L'utilisateur a été créé avec succès.", 'success');
                closeModal();
                loadUsers();
            } else {
                showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
            }
        } catch (error) {
            showAlert(humanError(error), 'error');
        } finally {
            showLoader(false);
        }
    });
}

// ============================================================================
// FONCTION MANQUANTE : MODIFIER UTILISATEUR
// ============================================================================

async function showEditUserModal(userId) {
    showLoader(true);
    try {
        // Récupérer les données de l'utilisateur
        const response = await authenticatedFetch('/api/admin/users');
        const users = await response.json();
        const user = users.find(u => u.id === userId);

        if (!user) {
            showAlert('Utilisateur introuvable. Il a peut-être été supprimé. Veuillez actualiser la liste.', 'error');
            showLoader(false);
            return;
        }

        const modalContent = `
            <h2><i class="fas fa-user-edit"></i> Modifier l'Utilisateur</h2>
            <form id="edit-user-form">
                <div class="form-group">
                    <label><i class="fas fa-user"></i> Nom Complet *</label>
                    <input type="text" id="edit-user-name" required value="${user.full_name}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-envelope"></i> Email *</label>
                    <input type="email" id="edit-user-email" required value="${user.email}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-lock"></i> Nouveau Mot de Passe (laisser vide pour ne pas changer)</label>
                    <input type="password" id="edit-user-password" placeholder="Nouveau mot de passe (optionnel)">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-user-tag"></i> Rôle</label>
                    <select id="edit-user-role">
                        <option value="student" ${user.role === 'student' ? 'selected' : ''}>Étudiant</option>
                        <option value="professor" ${user.role === 'professor' ? 'selected' : ''}>Professeur</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrateur</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="edit-user-active" ${user.is_active ? 'checked' : ''}>
                        Compte actif
                    </label>
                </div>
                <div class="d-flex gap-2 mt-2">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-check"></i> Enregistrer
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i> Annuler
                    </button>
                </div>
            </form>
        `;
        
        showModal(modalContent);
        showLoader(false);

        // Gestionnaire de soumission
        document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoader(true);
            
            try {
                const updateData = {
                    full_name: document.getElementById('edit-user-name').value,
                    email: document.getElementById('edit-user-email').value,
                    role: document.getElementById('edit-user-role').value,
                    is_active: document.getElementById('edit-user-active').checked
                };

                // Ajouter le mot de passe seulement s'il a été rempli
                const password = document.getElementById('edit-user-password').value;
                if (password) {
                    updateData.password = password;
                }

                const response = await authenticatedFetch(`/api/admin/users/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify(updateData)
                });

                const data = await response.json();
                
                if (data.success) {
                    showAlert("Les informations de l'utilisateur ont été mises à jour avec succès.", 'success');
                    closeModal();
                    loadUsers(); // Recharger la liste
                } else {
                    showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
                }
            } catch (error) {
                showAlert(humanError(error), 'error');
            } finally {
                showLoader(false);
            }
        });

    } catch (error) {
        showAlert('Impossible de charger les données. Veuillez réessayer.', 'error');
        showLoader(false);
    }
}

async function deleteUser(userId) {
    if (!confirm('Confirmer la suppression?')) return;
    showLoader(true);
    try {
        const response = await authenticatedFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            showAlert("L'utilisateur a été supprimé définitivement.", 'success');
            loadUsers();
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// GESTION DES SUJETS
// ============================================================================
async function loadSubjects() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/subjects');
        const subjects = await response.json();
        if (subjects.length === 0) {
            document.getElementById('main-content').innerHTML = `
                <div class="page-header">
                    <h2><i class="fas fa-file-alt"></i> Gestion des Sujets</h2>
                </div>
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    <div>
                        ${currentUser.role === 'professor' ?
                            'Vous n\'avez créé aucun sujet. <button class="btn btn-primary" onclick="loadCreateSubject()"><i class="fas fa-plus"></i> Créer un Sujet</button>' :
                            'Aucun sujet disponible.'
                        }
                    </div>
                </div>
            `;
            showLoader(false);
            return;
        }
        let subjectsHTML = subjects.map(s => {
            const ecInfo = s.ec_code ? `<br><small><i class="fas fa-book"></i> ${s.ec_code}: ${s.ec_name}</small>` : '';
            return `
            <tr>
                <td>${s.title}${ecInfo}</td>
                <td>${s.creator_name || 'N/A'}</td>
                <td><i class="fas fa-calendar"></i> ${new Date(s.created_at).toLocaleDateString('fr-FR')}</td>
                <td>${s.is_active ? '<i class="fas fa-check-circle" style="color: var(--success)"></i>' : '<i class="fas fa-times-circle" style="color: var(--danger)"></i>'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewSubjectDetail(${s.id})">
                        <i class="fas fa-eye"></i> Voir
                    </button>
                    ${currentUser.role === 'admin' || (currentUser.role === 'professor' && s.creator_id === currentUser.id) ?
                        `<button class="btn btn-sm btn-danger" onclick="deleteSubject(${s.id})"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `}).join('');
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-file-alt"></i> Gestion des Sujets</h2>
                <p>${subjects.length} sujet(s) ${currentUser.role === 'professor' ? '(vos sujets uniquement)' : ''}</p>
            </div>
            <div class="card">
                <table>
                    <thead>
                        <tr>
                            <th><i class="fas fa-heading"></i> Titre</th>
                            <th><i class="fas fa-user"></i> Créateur</th>
                            <th><i class="fas fa-calendar"></i> Date</th>
                            <th><i class="fas fa-check-circle"></i> Statut</th>
                            <th><i class="fas fa-cog"></i> Actions</th>
                        </tr>
                    </thead>
                    <tbody>${subjectsHTML || '<tr><td colspan="5">Aucun sujet</td></tr>'}</tbody>
                </table>
            </div>
        `;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

function loadMySubjects() {
    loadSubjects();
}

// ============================================================================
// UTILITAIRES
// ============================================================================
function showLoader(show) {
    document.getElementById('loader').style.display = show ? 'flex' : 'none';
}

function showAlert(message, type = 'info') {
    const icons = {
        'info': 'fa-info-circle',
        'success': 'fa-check-circle',
        'warning': 'fa-exclamation-triangle',
        'error': 'fa-exclamation-circle'
    };
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <div>${message}</div>
    `;
    alertDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; min-width: 300px; max-width: 500px;';
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 5000);
}

function showModal(content, width = '600px') {
    const modal = document.getElementById('modal');
    document.getElementById('modal-body').innerHTML = content;
    modal.style.display = 'block';
    document.querySelector('.modal-content').style.maxWidth = width;
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

window.onclick = function(event) {
    if (event.target == document.getElementById('modal')) {
        closeModal();
    }
}

// Theme handling
function setTheme(theme) {
    document.body.classList.remove('theme-dark', 'theme-solar');
    if (theme === 'dark') document.body.classList.add('theme-dark');
    if (theme === 'solar') document.body.classList.add('theme-solar');
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const body = document.body;
    const btn = document.getElementById('theme-toggle-btn');
    
    if (body.classList.contains('theme-dark')) {
        body.classList.remove('theme-dark');
        localStorage.setItem('theme', 'light');
        if (btn) btn.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        body.classList.add('theme-dark');
        localStorage.setItem('theme', 'dark');
        if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
    }
}

// Au chargement de l'app, appliquer le thème sauvegardé
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('theme-dark');
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
    }
});

// Continuation de app.js - Partie 3 (Fonctions restantes)

// ============================================================================
// CRÉATION DE SUJET
// ============================================================================
async function loadCreateSubject() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    try {
        const ecsResponse = await authenticatedFetch('/api/ecs');
        const ecs = await ecsResponse.json();
        let ecsOptions = '<option value="">-- Optionnel: Lier à un EC --</option>';
        ecs.forEach(ec => {
            ecsOptions += `<option value="${ec.id}">${ec.ue_code} - ${ec.code}: ${ec.name}</option>`;
        });
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-plus-circle"></i> Créer un Sujet d'Examen</h2>
                <p>Uploadez un fichier PDF, DOCX ou TXT contenant le sujet</p>
            </div>
            <div class="card">
                <form id="create-subject-form">
                    <div class="form-group">
                        <label><i class="fas fa-layer-group"></i> Élément Constitutif (EC)</label>
                        <select id="subject-ec">${ecsOptions}</select>
                        <small class="form-help"><i class="fas fa-info-circle"></i> Associez ce sujet à un EC de la maquette pédagogique</small>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-heading"></i> Titre du Sujet *</label>
                        <input type="text" id="subject-title" required placeholder="Ex: Examen Blockchain">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-file-upload"></i> Fichier du Sujet (PDF, DOCX, TXT) *</label>
                        <input type="file" id="subject-file" accept=".pdf,.docx,.doc,.txt" required>
                        <small class="form-help"><i class="fas fa-lightbulb"></i> Le système analysera automatiquement le sujet et générera un barème de notation</small>
                    </div>
                    <div class="d-flex gap-2">
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-plus-circle"></i> Créer le Sujet
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="loadDashboard()">
                            <i class="fas fa-times"></i> Annuler
                        </button>
                    </div>
                </form>
            </div>
        `;
        document.getElementById('create-subject-form').addEventListener('submit', handleCreateSubject);
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function handleCreateSubject(e) {
    e.preventDefault();
    showLoader(true);
    const title = document.getElementById('subject-title').value;
    const ecId = document.getElementById('subject-ec').value;
    const fileInput = document.getElementById('subject-file');
    const file = fileInput.files[0];
    if (!file) {
        showAlert('Veuillez sélectionner un fichier', 'error');
        showLoader(false);
        return;
    }
    const formData = new FormData();
    formData.append('title', title);
    if (ecId) formData.append('ec_id', ecId);
    formData.append('file', file);
    try {
        const response = await fetch('/api/subjects/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            showSubjectCreatedPreview(data.subject);
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

function showSubjectCreatedPreview(subject) {
    const rubricHtml = (subject.rubric || '').replace(/\n/g, '<br>').replace(/══+/g, '<hr style="border-color:#3b82f6;margin:8px 0;">').replace(/──+/g, '<hr style="border-color:#e2e8f0;margin:4px 0;">');
    const contentHtml = (subject.content || '').replace(/\n/g, '<br>').replace(/══+/g, '<hr style="border-color:#3b82f6;margin:8px 0;">').replace(/──+/g, '<hr style="border-color:#e2e8f0;margin:4px 0;">');

    document.getElementById('main-content').innerHTML = `
        <div style="max-width:900px;margin:0 auto;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
                <div>
                    <h2 style="margin:0;color:#0f172a;"><i class="fas fa-check-circle" style="color:#10b981;"></i> Sujet créé avec succès</h2>
                    <p style="margin:4px 0 0;color:#64748b;font-size:14px;">Le barème de notation a été généré automatiquement par l'IA</p>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button class="btn btn-secondary" onclick="loadMySubjects()">
                        <i class="fas fa-list"></i> Voir mes sujets
                    </button>
                    <button class="btn btn-primary" onclick="loadCreateSubject()">
                        <i class="fas fa-plus"></i> Créer un autre sujet
                    </button>
                </div>
            </div>

            <!-- Infos du sujet -->
            <div class="card" style="margin-bottom:20px;border-left:4px solid #3b82f6;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <i class="fas fa-file-alt" style="font-size:28px;color:#3b82f6;"></i>
                    <div>
                        <h3 style="margin:0;color:#0f172a;">${subject.title}</h3>
                        <small style="color:#64748b;">
                            <i class="fas fa-calendar"></i> Créé le ${new Date(subject.created_at).toLocaleString('fr-FR')}
                            &nbsp;·&nbsp;
                            <i class="fas fa-check-circle" style="color:#10b981;"></i> Actif
                        </small>
                    </div>
                </div>
            </div>

            <!-- Contenu du sujet -->
            <div class="card" style="margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e2e8f0;">
                    <i class="fas fa-file-lines" style="color:#3b82f6;font-size:18px;"></i>
                    <h3 style="margin:0;font-size:16px;">Contenu du Sujet</h3>
                </div>
                <div style="max-height:350px;overflow-y:auto;padding:16px;background:#f8fafc;border-radius:8px;font-family:monospace;font-size:13px;line-height:1.7;white-space:pre-wrap;">${subject.content || 'Contenu non disponible'}</div>
            </div>

            <!-- Barème généré -->
            <div class="card" style="border-left:4px solid #10b981;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e2e8f0;">
                    <i class="fas fa-clipboard-list" style="color:#10b981;font-size:18px;"></i>
                    <h3 style="margin:0;font-size:16px;">Barème de Notation Généré par l'IA</h3>
                    <span style="margin-left:auto;background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;">
                        <i class="fas fa-robot"></i> Auto-généré
                    </span>
                </div>
                <div style="max-height:450px;overflow-y:auto;padding:16px;background:#f0fdf4;border-radius:8px;font-family:monospace;font-size:13px;line-height:1.8;white-space:pre-wrap;">${subject.rubric || 'Barème non disponible'}</div>
            </div>

            <div style="margin-top:20px;padding:16px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
                <i class="fas fa-lightbulb" style="color:#3b82f6;"></i>
                <strong style="color:#1e40af;"> Conseil :</strong>
                <span style="color:#1e40af;font-size:14px;"> Ce sujet et son barème sont maintenant disponibles pour créer un examen en ligne. Allez dans <em>Examens en ligne → Créer un examen</em> pour l'utiliser.</span>
            </div>
        </div>
    `;
}

// ============================================================================
// FONCTIONS MANQUANTES : VOIR DÉTAIL ET SUPPRIMER SUJET
// ============================================================================

async function viewSubjectDetail(subjectId) {
    showLoader(true);
    
    try {
        const response = await authenticatedFetch(`/api/subjects/${subjectId}`);
        
        if (!response.ok) {
            throw new Error('Erreur lors du chargement du sujet');
        }
        
        const subject = await response.json();
        
        const ecInfo = subject.ec_code ? `
            <div class="form-group">
                <label><i class="fas fa-book"></i> EC Associé</label>
                <div style="padding: 10px; background: #f8fafc; border-radius: 6px;">
                    <strong>${subject.ec_code}</strong>: ${subject.ec_name}
                    <br><small style="color: #64748b;">UE ${subject.ue_code}</small>
                </div>
            </div>
        ` : '<p style="color: #94a3b8;"><i class="fas fa-info-circle"></i> Aucun EC associé</p>';
        
        const modalContent = `
            <h2><i class="fas fa-file-alt"></i> Détails du Sujet</h2>
            
            <div class="form-group">
                <label><i class="fas fa-heading"></i> Titre</label>
                <div style="padding: 10px; background: #f8fafc; border-radius: 6px;">
                    <strong>${subject.title}</strong>
                </div>
            </div>
            
            ${ecInfo}
            
            <div class="form-group">
                <label><i class="fas fa-user"></i> Créé par</label>
                <div style="padding: 10px; background: #f8fafc; border-radius: 6px;">
                    ${subject.creator_name || 'N/A'}
                </div>
            </div>
            
            <div class="form-group">
                <label><i class="fas fa-calendar"></i> Date de Création</label>
                <div style="padding: 10px; background: #f8fafc; border-radius: 6px;">
                    ${new Date(subject.created_at).toLocaleString('fr-FR')}
                </div>
            </div>
            
            <div class="form-group">
                <label><i class="fas fa-file-alt"></i> Contenu du Sujet</label>
                <div style="max-height: 300px; overflow-y: auto; padding: 12px; background: #f8fafc; border-radius: 6px; white-space: pre-wrap; font-family: monospace; font-size: 13px;">
${subject.content}
                </div>
            </div>
            
            <div class="form-group">
                <label><i class="fas fa-clipboard-list"></i> Barème de Notation</label>
                <div style="max-height: 300px; overflow-y: auto; padding: 12px; background: #f1f5f9; border-radius: 6px; white-space: pre-wrap; font-family: monospace; font-size: 13px;">
${subject.rubric}
                </div>
            </div>
            
            <div class="form-group">
                <label><i class="fas fa-check-circle"></i> Statut</label>
                <div style="padding: 10px; background: #f8fafc; border-radius: 6px;">
                    ${subject.is_active ? '<i class="fas fa-check-circle" style="color: var(--success)"></i> Actif' : '<i class="fas fa-times-circle" style="color: var(--danger)"></i> Inactif'}
                </div>
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                ${currentUser.role === 'admin' || subject.creator_id === currentUser.id ? `
                    <button class="btn btn-danger" onclick="deleteSubject(${subject.id}); closeModal();">
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                ` : ''}
                <button class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Fermer
                </button>
            </div>
        `;
        
        showModal(modalContent, '800px');
        
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function deleteSubject(subjectId) {
    if (!confirm('⚠️ ATTENTION !\n\nLa suppression de ce sujet entraînera également :\n• La suppression de TOUS les examens en ligne associés\n• La suppression de TOUTES les copies corrigées\n\nCette action est IRRÉVERSIBLE.\n\nÊtes-vous absolument certain de vouloir continuer ?')) {
        return;
    }
    
    showLoader(true);
    
    try {
        const response = await authenticatedFetch(`/api/subjects/${subjectId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert(data.message || 'Sujet supprimé avec succès!', 'success');
            
            // Recharger la liste des sujets
            if (currentUser.role === 'professor') {
                loadMySubjects();
            } else {
                loadSubjects();
            }
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert('Impossible de supprimer cet élément. Vérifiez votre connexion et réessayez.', 'error');
    } finally {
        showLoader(false);
    }
}

async function loadViewResults() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    
    try {
        // Récupérer les sujets du professeur
        const response = await authenticatedFetch('/api/subjects');
        const subjects = await response.json();
        
        if (subjects.length === 0) {
            document.getElementById('main-content').innerHTML = `
                <div class="page-header">
                    <h2><i class="fas fa-chart-bar"></i> Résultats et Statistiques</h2>
                </div>
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        Vous n'avez créé aucun sujet. Créez d'abord un sujet pour voir les résultats.
                        <br><br>
                        <button class="btn btn-primary" onclick="loadCreateSubject()">
                            <i class="fas fa-plus-circle"></i> Créer un Sujet
                        </button>
                    </div>
                </div>
            `;
            showLoader(false);
            return;
        }
        
        // Créer la liste des sujets avec bouton "Voir Statistiques"
        let subjectsHTML = subjects.map(s => {
            const ecInfo = s.ec_code ? `<br><small><i class="fas fa-book"></i> ${s.ec_code}: ${s.ec_name}</small>` : '';
            return `
                <tr>
                    <td>
                        <strong>${s.title}</strong>
                        ${ecInfo}
                    </td>
                    <td><i class="fas fa-calendar"></i> ${new Date(s.created_at).toLocaleDateString('fr-FR')}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="viewSubjectStatistics(${s.id})">
                            <i class="fas fa-chart-line"></i> Voir Statistiques
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-chart-bar"></i> Résultats et Statistiques</h2>
                <p>Consultez les statistiques détaillées de vos sujets</p>
            </div>
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-file-alt"></i> Mes Sujets</h3>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th><i class="fas fa-heading"></i> Titre</th>
                            <th><i class="fas fa-calendar"></i> Date de Création</th>
                            <th><i class="fas fa-cog"></i> Actions</th>
                        </tr>
                    </thead>
                    <tbody>${subjectsHTML}</tbody>
                </table>
            </div>
            
            <div id="statistics-container" style="margin-top: 20px; display: none;">
                <!-- Les statistiques s'afficheront ici -->
            </div>
        `;
        
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// FONCTION : AFFICHER LES STATISTIQUES D'UN SUJET
// ============================================================================

async function viewSubjectStatistics(subjectId) {
    showLoader(true);
    
    try {
        const response = await authenticatedFetch(`/api/statistics/${subjectId}`);
        const stats = await response.json();
        
        const statsContainer = document.getElementById('statistics-container');
        
        if (!stats || stats.totalStudents === 0) {
            statsContainer.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-chart-pie"></i> Statistiques - ${stats.subject_title}</h3>
                    </div>
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i>
                        <div>Aucune copie corrigée pour ce sujet.</div>
                    </div>
                </div>
            `;
            statsContainer.style.display = 'block';
            showLoader(false);
            return;
        }
        
        // Créer le tableau des copies
        let papersHTML = stats.papers.map(p => {
            const scoreClass = p.score >= 10 ? 'success' : 'danger';
            return `
                <tr>
                    <td>${p.student_name}</td>
                    <td>${p.student_email}</td>
                    <td><span class="status-badge ${scoreClass}">${p.score}/20</span></td>
                    <td><i class="fas fa-calendar"></i> ${new Date(p.corrected_at).toLocaleDateString('fr-FR')}</td>
                </tr>
            `;
        }).join('');
        
        statsContainer.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-chart-pie"></i> Statistiques - ${stats.subject_title}</h3>
                </div>
                
                <div class="grid" style="margin-bottom: 20px;">
                    <div class="stat-card">
                        <div class="stat-label"><i class="fas fa-users"></i> Total Étudiants</div>
                        <div class="stat-value">${stats.totalStudents}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label"><i class="fas fa-chart-line"></i> Moyenne</div>
                        <div class="stat-value">${stats.averageScore}/20</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label"><i class="fas fa-sort-amount-up"></i> Médiane</div>
                        <div class="stat-value">${stats.medianScore}/20</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label"><i class="fas fa-arrow-down"></i> Note Min</div>
                        <div class="stat-value">${stats.minScore}/20</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label"><i class="fas fa-arrow-up"></i> Note Max</div>
                        <div class="stat-value">${stats.maxScore}/20</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label"><i class="fas fa-percentage"></i> Taux de Réussite</div>
                        <div class="stat-value">${stats.passRate}%</div>
                    </div>
                </div>
                
                <div class="card-header">
                    <h4><i class="fas fa-chart-bar"></i> Distribution des Notes</h4>
                </div>
                <div style="padding: 20px;">
                    <div style="display: flex; gap: 20px; justify-content: space-around; flex-wrap: wrap;">
                        <div style="text-align: center;">
                            <div style="font-size: 32px; font-weight: bold; color: #ef4444;">${stats.scoreDistribution['0-5']}</div>
                            <div style="color: #64748b;">0-5</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 32px; font-weight: bold; color: #f59e0b;">${stats.scoreDistribution['5-10']}</div>
                            <div style="color: #64748b;">5-10</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 32px; font-weight: bold; color: #10b981;">${stats.scoreDistribution['10-15']}</div>
                            <div style="color: #64748b;">10-15</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 32px; font-weight: bold; color: #3b82f6;">${stats.scoreDistribution['15-20']}</div>
                            <div style="color: #64748b;">15-20</div>
                        </div>
                    </div>
                </div>
                
                <div class="card-header">
                    <h4><i class="fas fa-list"></i> Détail des Copies</h4>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th><i class="fas fa-user"></i> Étudiant</th>
                            <th><i class="fas fa-envelope"></i> Email</th>
                            <th><i class="fas fa-star"></i> Note</th>
                            <th><i class="fas fa-calendar"></i> Date Correction</th>
                        </tr>
                    </thead>
                    <tbody>${papersHTML}</tbody>
                </table>
            </div>
        `;
        
        statsContainer.style.display = 'block';
        
        // Scroll vers les statistiques
        statsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } catch (error) {
        showAlert('Impossible de charger les statistiques de ce sujet. Veuillez réessayer.', 'error');
    } finally {
        showLoader(false);
    }
}
// ============================================================================
// CORRECTION DE COPIES
// ============================================================================
async function loadCorrectPapers() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    try {
        const subjectsResponse = await authenticatedFetch('/api/subjects');
        const subjects = await subjectsResponse.json();
        if (subjects.length === 0) {
            document.getElementById('main-content').innerHTML = `
                <div class="page-header">
                    <h2>Corriger des Copies</h2>
                </div>
                <div class="alert alert-warning">
                    ⚠️ Vous n'avez créé aucun sujet. Veuillez d'abord créer un sujet d'examen.
                    <br><br>
                    <button class="btn btn-primary" onclick="loadCreateSubject()">Créer un Sujet</button>
                </div>
            `;
            showLoader(false);
            return;
        }
        const subjectsOptions = subjects.map(s => {
            const ecInfo = s.ec_code ? ` [${s.ec_code}]` : '';
            return `<option value="${s.id}">${s.title}${ecInfo}</option>`;
        }).join('');

        // NOTE: utiliser les mêmes IDs que les handlers (single-subject, single-student-name, single-paper-file,
        // batch-subject, batch-papers-files, batch-auto-extract) et inclure la zone de résultats.
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2>Corriger des Copies</h2>
                <p>Correction automatique avec IA</p>
            </div>

            <div class="card mb-3">
                <div class="card-header"><h3>Correction d'une Seule Copie</h3></div>
                <form id="single-correction-form">
                    <div class="form-group">
                        <label>Sujet d'Examen *</label>
                        <select id="single-subject" required>
                            <option value="">-- Choisir un sujet --</option>
                            ${subjectsOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Nom de l'Étudiant *</label>
                        <input type="text" id="single-student-name" placeholder="Ex: Jean Dupont" required>
                    </div>
                    <div class="form-group">
                        <label>Copie de l'Étudiant (PDF, DOCX, TXT) *</label>
                        <input type="file" id="single-paper-file" accept=".pdf,.docx,.doc,.txt" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Corriger cette Copie</button>
                </form>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3>Correction en Lot (Plusieurs Copies)</h3>
                    <p style="color: #64748b; font-size: 14px; margin-top: 8px;">
                        💡 Sélectionnez plusieurs fichiers à la fois ou glissez-déposez un dossier complet
                    </p>
                </div>
                <form id="batch-correction-form">
                    <div class="form-group">
                        <label>Sujet d'Examen *</label>
                        <select id="batch-subject" required>
                            <option value="">-- Choisir un sujet --</option>
                            ${subjectsOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Copies des Étudiants (PDF, DOCX, TXT) *</label>
                        <input type="file" id="batch-papers-files" accept=".pdf,.docx,.doc,.txt" multiple required webkitdirectory directory>
                        <small class="form-help">
                            💡 <strong>Astuce:</strong> Nommez vos fichiers avec le nom de l'étudiant (ex: copie_jean_dupont.pdf)<br>
                            📁 Vous pouvez aussi sélectionner un dossier entier contenant toutes les copies
                        </small>
                    </div>
                    <div class="form-group">
                        <label><input type="checkbox" id="batch-auto-extract" checked> Extraire automatiquement les noms depuis les copies et envoyer les emails aux étudiants (si adresse valide)</label>
                    </div>
                    <button type="submit" class="btn btn-success">Corriger Toutes les Copies</button>
                </form>
            </div>

            <div id="correction-results" class="card mt-3" style="display: none;">
                <div class="card-header"><h3>Résultats</h3></div>
                <div id="correction-results-content"></div>
            </div>
        `;
        // attacher les handlers
        document.getElementById('single-correction-form').addEventListener('submit', handleSingleCorrection);
        document.getElementById('batch-correction-form').addEventListener('submit', handleBatchCorrection);
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function handleSingleCorrection(e) {
    e.preventDefault();
    showLoader(true);
    
    const subjectId = document.getElementById('single-subject').value;
    const studentName = document.getElementById('single-student-name').value;
    const fileInput = document.getElementById('single-paper-file');
    const file = fileInput.files[0];
    
    if (!subjectId || !studentName || !file) {
        showAlert('Veuillez remplir tous les champs', 'error');
        showLoader(false);
        return;
    }
    
    const formData = new FormData();
    formData.append('subject_id', subjectId);
    formData.append('student_name', studentName);
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/papers/correct', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Copie corrigée avec succès!', 'success');
            
            // Afficher les résultats
            const resultsContainer = document.getElementById('correction-results');
            const resultsContent = document.getElementById('correction-results-content');
            
            resultsContent.innerHTML = `
                <div class="alert alert-success">
                    <h4><i class="fas fa-check-circle"></i> Correction Terminée</h4>
                    <p><strong>Étudiant:</strong> ${data.paper.student_name}</p>
                    <p><strong>Note:</strong> ${data.paper.score}/20</p>
                    <p><strong>Sujet:</strong> ${data.paper.subject_title}</p>
                </div>
                
                <div class="card mt-2">
                    <div class="card-header">
                        <h4><i class="fas fa-clipboard-list"></i> Détails de la Correction</h4>
                    </div>
                    <div style="padding: 15px;">
                        <p><strong><i class="fas fa-comment"></i> Feedback:</strong></p>
                        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; white-space: pre-wrap;">
${data.paper.feedback}
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 15px;">
                    <button class="btn btn-primary" onclick="exportPaperPDF(${data.paper.id})">
                        <i class="fas fa-file-pdf"></i> Télécharger PDF
                    </button>
                    <button class="btn btn-secondary" onclick="document.getElementById('correction-results').style.display='none'">
                        <i class="fas fa-times"></i> Fermer
                    </button>
                </div>
            `;
            
            resultsContainer.style.display = 'block';
            resultsContainer.scrollIntoView({ behavior: 'smooth' });
            
            // Réinitialiser le formulaire
            document.getElementById('single-correction-form').reset();
            
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert('Impossible de corriger la copie. Vérifiez votre connexion et réessayez.', 'error');
    } finally {
        showLoader(false);
    }
}

async function handleBatchCorrection(e) {
    e.preventDefault();

    // Récupérer éléments du DOM (IDs utilisés dans loadCorrectPapers)
    const subjectId = document.getElementById('batch-subject') ? document.getElementById('batch-subject').value : '';
    const filesInput = document.getElementById('batch-papers-files');
    const autoExtractElem = document.getElementById('batch-auto-extract');

    if (!filesInput) {
        showAlert('Erreur technique : formulaire incomplet. Veuillez actualiser la page et réessayer.', 'error');
        return;
    }

    const files = filesInput.files;
    if (!subjectId) {
        showAlert('Veuillez sélectionner un sujet', 'warning');
        return;
    }
    if (!files || files.length === 0) {
        showAlert('Veuillez sélectionner au moins un fichier', 'error');
        return;
    }

    showLoader(true);
    showAlert(`Correction de ${files.length} copie(s) en cours... Veuillez patienter.`, 'info');

    const formData = new FormData();
    formData.append('subject_id', subjectId);
    const autoExtract = autoExtractElem ? (autoExtractElem.checked ? '1' : '0') : '0';
    formData.append('auto_extract', autoExtract);

    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    try {
        // IMPORTANT: ne pas utiliser authenticatedFetch car il ajoute 'Content-Type: application/json'
        // qui casse l'envoi de FormData (boundary). Utiliser fetch et ajouter manuellement l'Authorization.
        const response = await fetch('/api/papers/upload-batch', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });

        // essayer d'extraire JSON si possible
        let data = {};
        try { data = await response.json(); } catch (e) { /* ignore */ }

        if (response.ok && data.success) {
            showAlert(`Correction en lot terminée : ${data.corrected} copie(s) corrigée(s) avec succès.`, 'success');

            let resultsHTML = `<div class="alert alert-success"><strong>${data.corrected} copie(s) corrigée(s)</strong></div>`;

            if (data.results && data.results.length > 0) {
                resultsHTML += '<table><thead><tr><th>Fichier</th><th>Étudiant</th><th>Note</th><th>Statut</th></tr></thead><tbody>';
                data.results.forEach(result => {
                    const scoreClass = (typeof result.score === 'number' && result.score >= 10) ? 'success' : 'danger';
                    resultsHTML += `<tr>
                        <td>${result.filename}</td>
                        <td>${result.student_name || 'N/A'}</td>
                        <td>${typeof result.score === 'number' ? result.score + '/20' : 'N/A'}</td>
                        <td>${result.error ? `<span class="text-danger">${result.error}</span>` : '✅ Corrigée'}</td>
                    </tr>`;
                });
                resultsHTML += '</tbody></table>';
            }

            if (data.errors && data.errors > 0 && data.error_details && data.error_details.length > 0) {
                resultsHTML += `<div class="alert alert-warning mt-2"><strong>⚠️ ${data.errors} erreur(s)</strong><br>${data.error_details.join('<br>')}</div>`;
            }

            // afficher résultats dans la page
            const resultsCard = document.getElementById('correction-results');
            const resultsContent = document.getElementById('correction-results-content');
            if (resultsContent) {
                resultsContent.innerHTML = resultsHTML;
                resultsCard.style.display = 'block';
                resultsCard.scrollIntoView({ behavior: 'smooth' });
            }

            // reset form
            document.getElementById('batch-correction-form').reset();
        } else {
            // message d'erreur serveur
            const errMsg = (data && (data.error || data.message)) ? (data.error || data.message) : `Erreur serveur (${response.status})`;
            showAlert('Impossible de corriger les copies : ' + errMsg, 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// RÉCLAMATIONS
// ============================================================================
async function loadReclamations() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/reclamations');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const reclamations = await response.json();
        let reclamationsHTML = reclamations.map(r => {
            const statusClass = { 'pending': 'warning', 'resolved': 'success', 'rejected': 'danger' }[r.status] || 'secondary';
            const statusLabel = { 
                'pending': '<i class="fas fa-clock"></i> En attente', 
                'resolved': '<i class="fas fa-check-circle"></i> Acceptée', 
                'rejected': '<i class="fas fa-times-circle"></i> Rejetée' 
            }[r.status];
            const hasIAProposal = r.ia_proposed_status && r.status === 'pending';

            return `
                <div class="reclamation-item ${r.status}">
                    <div class="reclamation-header">
                        <div>
                            <strong><i class="fas fa-user"></i> ${r.student_name}</strong> - ${r.subject_title}
                            <br><small><i class="fas fa-calendar"></i> ${new Date(r.created_at).toLocaleDateString('fr-FR')}</small>
                            ${hasIAProposal ? `<br><span style="color:#f59e0b; font-weight:bold;"><i class="fas fa-lightbulb"></i> Proposition IA disponible</span>` : ''}
                        </div>
                        <span class="status-badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <p><strong><i class="fas fa-comment"></i> Raison:</strong> ${r.reason}</p>
                    ${r.response ? `<p><strong><i class="fas fa-reply"></i> Réponse:</strong> ${r.response}</p>` : ''}
                    ${r.ia_proposed_reason ? `<p><strong><i class="fas fa-robot"></i> Proposition IA:</strong> ${r.ia_proposed_reason}</p>` : ''}
                    ${currentUser.role !== 'student' && r.status === 'pending' ?
                        `<button class="btn btn-sm btn-primary" onclick="showRespondReclamationModal(${r.id})">
                            <i class="fas fa-reply"></i> Répondre
                        </button>
                         <button class="btn btn-sm btn-info" onclick="processReclamationIA(${r.id})">
                            <i class="fas fa-brain"></i> Traiter IA
                        </button>` : ''}
                </div            `;
        }).join('');
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-exclamation-triangle"></i> Réclamations</h2>
                <p>${reclamations.length} réclamation(s)</p>
            </div>
            <div class="card">${reclamationsHTML || '<p><i class="fas fa-inbox"></i> Aucune réclamation</p>'}</div>
        `;
    } catch (error) {
        showAlert('Impossible de charger les réclamations. Veuillez réessayer.', 'error');
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-exclamation-triangle"></i> Réclamations</h2>
            </div>
            <div class="alert alert-error">
                <i class="fas fa-exclamation-circle"></i>
                <div>Erreur de chargement des données. Veuillez vérifier la base de données ou réessayer.</div>
            </div>
        `;
    } finally {
        showLoader(false);
    }
}

function loadMyReclamations() {
    loadReclamations();
}

async function loadMyTranscripts() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    await loadTranscripts();
}
    
    try {
        // TODO: Implémenter endpoint backend pour récupérer les relevés de l'étudiant connecté
        // Pour l'instant, afficher un message
        
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-file-alt"></i> Mes Relevés de Notes</h2>
                <p>Consultez et téléchargez vos relevés de notes officiels</p>
            </div>
            
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                <div>
                    <strong>Information:</strong> Les relevés de notes sont générés par vos professeurs ou l'administration.
                    Ils apparaîtront ici dès qu'ils seront disponibles.
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-history"></i> Historique</h3>
                </div>
                <p style="padding: 20px; color: #94a3b8; text-align: center;">
                    <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 12px;"></i><br>
                    Aucun relevé disponible pour le moment
                </p>
            </div>
        `;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }

function showCreateReclamationModal(paperId) {
    const modalContent = `
        <h2><i class="fas fa-exclamation-triangle"></i> Créer une Réclamation</h2>
        <form id="create-reclamation-form">
            <div class="form-group">
                <label><i class="fas fa-comment"></i> Raison *</label>
                <textarea id="reclamation-reason" rows="5" required></textarea>
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-warning">
                    <i class="fas fa-paper-plane"></i> Soumettre
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Annuler
                </button>
            </div>
        </form>
    `;
    showModal(modalContent);
    document.getElementById('create-reclamation-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader(true);
        try {
            const response = await authenticatedFetch('/api/reclamations', {
                method: 'POST',
                body: JSON.stringify({
                    paper_id: paperId,
                    reason: document.getElementById('reclamation-reason').value
                })
            });
            const data = await response.json();
            if (data.success) {
                showAlert('Votre réclamation a été soumise avec succès. Vous serez notifié de la réponse.', 'success');
                closeModal();
                loadDashboard();
            } else {
                showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
            }
        } catch (error) {
            showAlert(humanError(error), 'error');
        } finally {
            showLoader(false);
        }
    });
}

// ============================================================================
// AFFECTATIONS EC
// ============================================================================
async function loadECAssignments() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    try {
        const ecsResponse = await authenticatedFetch('/api/ecs');
        const ecs = await ecsResponse.json();
        
        const usersResponse = await authenticatedFetch('/api/admin/users');
        const allUsers = await usersResponse.json();
        const professors = allUsers.filter(u => u.role === 'professor');
        
        let html = `
            <div class="page-header">
                <h2><i class="fas fa-link"></i> Affectations EC aux Professeurs</h2>
                <p>Assignez les ECs aux professeurs responsables</p>
            </div>
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-layer-group"></i> Liste des ECs</h3>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th><i class="fas fa-tag"></i> Code EC</th>
                            <th><i class="fas fa-book"></i> Nom</th>
                            <th><i class="fas fa-layer-group"></i> UE</th>
                            <th><i class="fas fa-user"></i> Professeur Assigné</th>
                            <th><i class="fas fa-cog"></i> Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        let professorsOptions = '<option value="">-- Sélectionner un professeur --</option>';
        professors.forEach(prof => {
            professorsOptions += `<option value="${prof.id}">${prof.full_name}</option>`;
        });
        
        if (ecs.length === 0) {
            html += '<tr><td colspan="5"><i class="fas fa-inbox"></i> Aucun EC disponible</td></tr>';
        } else {
            ecs.forEach(ec => {
                html += `
                    <tr>
                        <td><strong>${ec.code}</strong></td>
                        <td>${ec.name}</td>
                        <td>${ec.ue_code}</td>
                        <td>
                            <select id="ec-professor-${ec.id}" class="ec-professor-select" data-ec-id="${ec.id}">
                                ${professorsOptions}
                            </select>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="assignECToProfessor(${ec.id})">
                                <i class="fas fa-link"></i> Assigner
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
        
        html += `</tbody></table></div>`;
        document.getElementById('main-content').innerHTML = html;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function assignECToProfessor(ecId) {
    const select = document.getElementById(`ec-professor-${ecId}`);
    const professorId = select.value;
    if (!professorId) {
        showAlert('Veuillez sélectionner un professeur', 'warning');
        return;
    }
    showLoader(true);
    try {
        let response = await authenticatedFetch(`/api/admin/ecs/${ecId}/assign`, {
            method: 'POST',
            body: JSON.stringify({ professor_id: professorId })
        });
        if (response.ok) {
            showAlert("L'EC a été assigné au professeur avec succès.", 'success');
            loadECAssignments();
        } else {
            showAlert('Impossible d\'effectuer l\'affectation. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// INSCRIPTIONS UE
// ============================================================================
async function loadStudentEnrollments() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    try {
        const formationsResponse = await authenticatedFetch('/api/formations');
        const formations = await formationsResponse.json();
        
        const studentsResponse = await authenticatedFetch('/api/students/list');
        const students = await studentsResponse.json();
        
        let ues = [];
        for (const formation of formations) {
            try {
                const semestersResponse = await authenticatedFetch(`/api/formations/${formation.id}/semesters`);
                const semesters = await semestersResponse.json();
                for (const semester of semesters) {
                    try {
                        const uesResponse = await authenticatedFetch(`/api/semesters/${semester.id}/ues`);
                        const uesData = await uesResponse.json();
                        ues = ues.concat(uesData);
                    } catch (e) {}
                }
            } catch (e) {}
        }
        
        let html = `
            <div class="page-header">
                <h2><i class="fas fa-user-graduate"></i> Inscriptions UE des Étudiants</h2>
                <p>Gérez les inscriptions aux UEs</p>
            </div>
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-users"></i> Étudiants</h3>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th><i class="fas fa-user"></i> Nom Étudiant</th>
                            <th><i class="fas fa-envelope"></i> Email</th>
                            <th><i class="fas fa-layer-group"></i> UE Sélectionnée</th>
                            <th><i class="fas fa-cog"></i> Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        let uesOptions = '<option value="">-- Sélectionner une UE --</option>';
        ues.forEach(ue => {
            uesOptions += `<option value="${ue.id}">${ue.code}: ${ue.name}</option>`;
        });
        
        if (students.length === 0) {
            html += '<tr><td colspan="4"><i class="fas fa-inbox"></i> Aucun étudiant disponible</td></tr>';
        } else {
            students.forEach(student => {
                html += `
                    <tr>
                        <td><strong>${student.full_name}</strong></td>
                        <td>${student.email}</td>
                        <td>
                            <select id="student-ue-${student.id}" class="student-ue-select">
                                ${uesOptions}
                            </select>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="enrollStudentToUE(${student.id})">
                                <i class="fas fa-check"></i> Inscrire
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
        
        html += `</tbody></table></div>`;
        document.getElementById('main-content').innerHTML = html;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function enrollStudentToUE(studentId) {
    console.log('🔍 DEBUG enrollStudentToUE appelée avec studentId:', studentId);
    
    // Validation robuste du select
    const select = document.getElementById(`student-ue-${studentId}`);
    console.log('🔍 DEBUG select element:', select);
    
    if (!select) {
        console.error('❌ Élément select introuvable pour student-ue-' + studentId);
        showAlert('Erreur technique : impossible de lire la sélection UE. Veuillez actualiser la page.', 'error');
        return;
    }

    const ueId = select.value;
    console.log('🔍 DEBUG ueId value:', ueId, 'type:', typeof ueId);
    
    if (!ueId || ueId === '' || ueId === 'null' || ueId === 'undefined') {
        console.warn('⚠️ Aucune UE sélectionnée');
        showAlert('Veuillez sélectionner une UE', 'warning');
        return;
    }

    // Validation que ueId est un nombre valide
    const ueIdNum = parseInt(ueId, 10);
    if (isNaN(ueIdNum) || ueIdNum <= 0) {
        console.error('❌ ueId invalide:', ueId);
        showAlert('UE sélectionnée invalide', 'error');
        return;
    }

    console.log('✅ Validation OK - Envoi requête avec:', {
        studentId: studentId,
        ueId: ueIdNum
    });

    showLoader(true);
    
    try {
        const response = await authenticatedFetch(`/api/admin/students/${studentId}/enroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ue_id: ueIdNum })
        });

        console.log('🔍 DEBUG response status:', response.status);
        
        let data = {};
        try { 
            data = await response.json(); 
            console.log('🔍 DEBUG response data:', data);
        } catch (e) { 
            console.error('❌ Erreur parsing JSON:', e);
        }

        if (response.ok && data.success) {
            showAlert('L\'étudiant a été inscrit à l\'UE avec succès.', 'success');
            loadStudentEnrollments();
        } else {
            const msg = (data && (data.error || data.message)) 
                ? (data.error || data.message) 
                : `Erreur (${response.status}) lors de l'inscription`;
            console.error('❌ Erreur inscription:', msg);
            showAlert(msg, 'error');
        }
    } catch (error) {
        console.error('❌ Exception lors de l\'inscription:', error);
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}
// ============================================================================
// GESTION DE LA MAQUETTE PÉDAGOGIQUE COMPLÈTE
// ============================================================================

async function loadMaquette() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/formations');
        const formations = await response.json();
        
        let html = `
            <div class="page-header">
                <h2><i class="fas fa-layer-group"></i> Maquette Pédagogique - Gestion Complète</h2>
                <p>Gérez les formations, semestres, UEs et ECs</p>
                <div class="alert alert-info" style="margin-top: 10px;">
                    <strong><i class="fas fa-info-circle"></i> Important:</strong> Pour lier des sujets à des ECs, créez d'abord :
                    <ol style="margin: 10px 0 0 20px;">
                        <li>Une Formation</li>
                        <li>Un Semestre (bouton  Semestre)</li>
                        <li>Une UE (bouton UE)</li>
                        <li>Un EC (bouton EC)</li>
                    </ol>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-university"></i> Formations</h3>
                </div>
                <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                    <button class="btn btn-primary" onclick="showCreateFormationModal()">
                        <i class="fas fa-plus"></i> Nouvelle Formation
                    </button>
                    <button class="btn btn-success" onclick="showImportMaquetteModal()">
                        <i class="fas fa-file-csv"></i> Import CSV Bulk
                    </button>
                </div>
        `;
        
        if (formations.length === 0) {
            html += `<p class="empty-message"><i class="fas fa-inbox"></i> Aucune formation créée</p>`;
        } else {
            html += `<div class="formations-list">`;
            
            for (const formation of formations) {
                // Récupérer les semestres de cette formation
                const semestersResponse = await authenticatedFetch(`/api/formations/${formation.id}/semesters`);
                const semesters = await semestersResponse.json();
                
                html += `
                    <div class="formation-card">
                        <div class="formation-header">
                            <div>
                                <h4>
                                    <i class="fas fa-graduation-cap"></i> 
                                    ${formation.code} - ${formation.name}
                                </h4>
                                <p style="color: #64748b; margin: 5px 0;">
                                    ${formation.level || 'N/A'} | ${formation.department || 'N/A'}
                                </p>
                                <small style="color: #94a3b8;">
                                    <i class="fas fa-book"></i> ${formation.semesters_count || 0} semestre(s)
                                </small>
                            </div>
                            <div class="formation-actions">
                                <button class="btn btn-sm btn-primary" onclick="showEditFormationModal(${formation.id})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-success" onclick="showCreateSemesterModal(${formation.id})">
                                    <i class="fas fa-plus"></i> Semestre
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteFormation(${formation.id})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="semesters-container">
                `;
                
                if (semesters.length > 0) {
                    for (const semester of semesters) {
                        // Récupérer les UEs de ce semestre
                        const uesResponse = await authenticatedFetch(`/api/semesters/${semester.id}/ues`);
                        const ues = await uesResponse.json();
                        
                        html += `
                            <div class="semester-card">
                                <div class="semester-header">
                                    <div>
                                        <strong><i class="fas fa-calendar-alt"></i> Semestre ${semester.number}</strong>
                                        ${semester.name ? `- ${semester.name}` : ''}
                                        <span style="color: #64748b; margin-left: 10px;">
                                            <i class="fas fa-star"></i> ${semester.total_credits} crédits
                                        </span>
                                    </div>
                                    <div>
                                        <button class="btn btn-sm btn-primary" onclick="showEditSemesterModal(${semester.id})">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-sm btn-success" onclick="showCreateUEModal(${semester.id})">
                                            <i class="fas fa-plus"></i> UE
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="deleteSemester(${semester.id})">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                                
                                <div class="ues-container">
                        `;
                        
                        if (ues.length > 0) {
                            for (const ue of ues) {
                                // Récupérer les ECs de cette UE
                                const ecsResponse = await authenticatedFetch(`/api/ues/${ue.id}/ecs`);
                                const ecs = await ecsResponse.json();
                                
                                html += `
                                    <div class="ue-card">
                                        <div class="ue-header">
                                            <div>
                                                <strong><i class="fas fa-book-open"></i> ${ue.code}</strong> - ${ue.name}
                                                <span style="color: #64748b; margin-left: 10px;">
                                                    <i class="fas fa-award"></i> ${ue.credits} crédits
                                                </span>
                                            </div>
                                            <div>
                                                <button class="btn btn-sm btn-primary" onclick="showEditUEModal(${ue.id})">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-sm btn-success" onclick="showCreateECModal(${ue.id})">
                                                    <i class="fas fa-plus"></i> EC
                                                </button>
                                                <button class="btn btn-sm btn-danger" onclick="deleteUE(${ue.id})">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div class="ecs-list">
                                `;
                                
                                if (ecs.length > 0) {
                                    ecs.forEach(ec => {
                                        html += `
                                            <div class="ec-item">
                                                <div>
                                                    <strong>${ec.code}</strong> - ${ec.name}
                                                    <br>
                                                    <small style="color: #64748b;">
                                                        CM: ${ec.cm}h | TD: ${ec.td}h | TP: ${ec.tp}h | Coef: ${ec.coefficient}
                                                    </small>
                                                </div>
                                                <div>
                                                    <button class="btn btn-sm btn-primary" onclick="showEditECModal(${ec.id})">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-sm btn-danger" onclick="deleteEC(${ec.id})">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        `;
                                    });
                                } else {
                                    html += `<p class="empty-message"><i class="fas fa-inbox"></i> Aucun EC</p>`;
                                }
                                
                                html += `
                                        </div>
                                    </div>
                                `;
                            }
                        } else {
                            html += `<p class="empty-message"><i class="fas fa-inbox"></i> Aucune UE</p>`;
                        }
                        
                        html += `
                                </div>
                            </div>
                        `;
                    }
                } else {
                    html += `<p class="empty-message"><i class="fas fa-inbox"></i> Aucun semestre</p>`;
                }
                
                html += `
                        </div>
                    </div>
                `;
            }
            
            html += `</div>`;
        }
        
        document.getElementById('main-content').innerHTML = html;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// MODALS POUR FORMATIONS
// ============================================================================

function showCreateFormationModal() {
    const modalContent = `
        <h2><i class="fas fa-plus"></i> Créer une Formation</h2>
        <form id="create-formation-form">
            <div class="form-group">
                <label><i class="fas fa-code"></i> Code *</label>
                <input type="text" id="formation-code" required placeholder="Ex: M2-TELCO">
            </div>
            <div class="form-group">
                <label><i class="fas fa-graduation-cap"></i> Nom *</label>
                <input type="text" id="formation-name" required placeholder="Ex: Master 2 Télécommunications">
            </div>
            <div class="form-group">
                <label><i class="fas fa-layer-group"></i> Niveau</label>
                <input type="text" id="formation-level" placeholder="Ex: Master 2, Licence 3">
            </div>
            <div class="form-group">
                <label><i class="fas fa-building"></i> Département</label>
                <input type="text" id="formation-department" placeholder="Ex: Génie Électrique">
            </div>
            <div class="form-group">
                <label><i class="fas fa-align-left"></i> Description</label>
                <textarea id="formation-description" rows="3"></textarea>
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-check"></i> Créer
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Annuler
                </button>
            </div>
        </form>
    `;
    showModal(modalContent);
    
    document.getElementById('create-formation-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader(true);
        try {
            const response = await authenticatedFetch('/api/admin/formations', {
                method: 'POST',
                body: JSON.stringify({
                    code: document.getElementById('formation-code').value,
                    name: document.getElementById('formation-name').value,
                    level: document.getElementById('formation-level').value,
                    department: document.getElementById('formation-department').value,
                    description: document.getElementById('formation-description').value
                })
            });
            const data = await response.json();
            if (data.success) {
                showAlert('La formation a été créée avec succès.', 'success');
                closeModal();
                loadMaquette();
            } else {
                showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
            }
        } catch (error) {
            showAlert(humanError(error), 'error');
        } finally {
            showLoader(false);
        }
    });
}

async function showEditFormationModal(formationId) {
    showLoader(true);
    try {
        const response = await authenticatedFetch(`/api/formations`);
        const formations = await response.json();
        const formation = formations.find(f => f.id === formationId);

        if (!formation) {
            showAlert('Formation introuvable. Elle a peut-être été supprimée. Veuillez actualiser la page.', 'error');
            showLoader(false);
            return;
        }

        const modalContent = `
            <h2><i class="fas fa-edit"></i> Modifier la Formation</h2>
            <form id="edit-formation-form">
                <div class="form-group">
                    <label><i class="fas fa-code"></i> Code *</label>
                    <input type="text" id="edit-formation-code" required value="${formation.code}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-graduation-cap"></i> Nom *</label>
                    <input type="text" id="edit-formation-name" required value="${formation.name}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-layer-group"></i> Niveau</label>
                    <input type="text" id="edit-formation-level" value="${formation.level || ''}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-building"></i> Département</label>
                    <input type="text" id="edit-formation-department" value="${formation.department || ''}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-align-left"></i> Description</label>
                    <textarea id="edit-formation-description" rows="3">${formation.description || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="edit-formation-active" ${formation.is_active ? 'checked' : ''}>
                        Formation active
                    </label>
                </div>
                <div class="d-flex gap-2 mt-2">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-check"></i> Modifier
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i> Annuler
                    </button>
                </div>
            </form>
        `;
        showModal(modalContent);
        showLoader(false);

        document.getElementById('edit-formation-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoader(true);
            try {
                const response = await authenticatedFetch(`/api/admin/formations/${formationId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        code: document.getElementById('edit-formation-code').value,
                        name: document.getElementById('edit-formation-name').value,
                        level: document.getElementById('edit-formation-level').value,
                        department: document.getElementById('edit-formation-department').value,
                        description: document.getElementById('edit-formation-description').value,
                        is_active: document.getElementById('edit-formation-active').checked
                    })
                });
                const data = await response.json();
                if (data.success) {
                    showAlert('La formation a été modifiée avec succès.', 'success');
                    closeModal();
                    loadMaquette();
                } else {
                    showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
                }
            } catch (error) {
                showAlert(humanError(error), 'error');
            } finally {
                showLoader(false);
            }
        });
    } catch (error) {
        showAlert(humanError(error), 'error');
        showLoader(false);
    }
}

async function deleteFormation(formationId) {
    if (!confirm('Supprimer cette formation et tous ses semestres/UEs/ECs?')) return;
    showLoader(true);
    try {
        const response = await authenticatedFetch(`/api/admin/formations/${formationId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            showAlert('La formation a été supprimée avec succès.', 'success');
            loadMaquette();
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// MODALS POUR SEMESTRES
// ============================================================================

function showCreateSemesterModal(formationId) {
    const modalContent = `
        <h2><i class="fas fa-plus"></i> Créer un Semestre</h2>
        <form id="create-semester-form">
            <div class="form-group">
                <label><i class="fas fa-sort-numeric-up"></i> Numéro *</label>
                <input type="number" id="semester-number" required min="1" max="12" placeholder="Ex: 1">
            </div>
            <div class="form-group">
                <label><i class="fas fa-heading"></i> Nom</label>
                <input type="text" id="semester-name" placeholder="Ex: Semestre 1">
            </div>
            <div class="form-group">
                <label><i class="fas fa-star"></i> Crédits totaux</label>
                <input type="number" id="semester-credits" value="30" min="1">
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-check"></i> Créer
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Annuler
                </button>
            </div>
        </form>
    `;
    showModal(modalContent);
    
    document.getElementById('create-semester-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader(true);
        try {
            const response = await authenticatedFetch('/api/admin/semesters', {
                method: 'POST',
                body: JSON.stringify({
                    formation_id: formationId,
                    number: parseInt(document.getElementById('semester-number').value),
                    name: document.getElementById('semester-name').value,
                    total_credits: parseInt(document.getElementById('semester-credits').value)
                })
            });
            const data = await response.json();
            if (data.success) {
                showAlert('Le semestre a été créé avec succès.', 'success');
                closeModal();
                loadMaquette();
            } else {
                showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
            }
        } catch (error) {
            showAlert(humanError(error), 'error');
        } finally {
            showLoader(false);
        }
    });
}

async function showEditSemesterModal(semesterId) {
    showLoader(true);
    try {
        // Récupérer les infos du semestre
        const response = await authenticatedFetch('/api/formations');
        const formations = await response.json();
        let semester = null;
        
        for (const formation of formations) {
            const semResponse = await authenticatedFetch(`/api/formations/${formation.id}/semesters`);
            const semesters = await semResponse.json();
            semester = semesters.find(s => s.id === semesterId);
            if (semester) break;
        }
        
        if (!semester) {
            showAlert('Semestre introuvable. Il a peut-être été supprimé. Veuillez actualiser la page.', 'error');
            return;
        }
        
        const modalContent = `
            <h2><i class="fas fa-edit"></i> Modifier le Semestre</h2>
            <form id="edit-semester-form">
                <div class="form-group">
                    <label><i class="fas fa-sort-numeric-up"></i> Numéro *</label>
                    <input type="number" id="edit-semester-number" required value="${semester.number}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-heading"></i> Nom</label>
                    <input type="text" id="edit-semester-name" value="${semester.name || ''}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-star"></i> Crédits totaux</label>
                    <input type="number" id="edit-semester-credits" value="${semester.total_credits}">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="edit-semester-active" ${semester.is_active ? 'checked' : ''}>
                        Semestre actif
                    </label>
                </div>
                <div class="d-flex gap-2 mt-2">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-check"></i> Modifier
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i> Annuler
                    </button>
                </div>
            </form>
        `;
        showModal(modalContent);
        showLoader(false);
        
        document.getElementById('edit-semester-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoader(true);
            try {
                const response = await authenticatedFetch(`/api/admin/semesters/${semesterId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        number: parseInt(document.getElementById('edit-semester-number').value),
                        name: document.getElementById('edit-semester-name').value,
                        total_credits: parseInt(document.getElementById('edit-semester-credits').value),
                        is_active: document.getElementById('edit-semester-active').checked
                    })
                });
                const data = await response.json();
                if (data.success) {
                    showAlert('Le semestre a été modifié avec succès.', 'success');
                    closeModal();
                    loadMaquette();
                } else {
                    showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
                }
            } catch (error) {
                showAlert(humanError(error), 'error');
            } finally {
                showLoader(false);
            }
        });
    } catch (error) {
        showAlert(humanError(error), 'error');
        showLoader(false);
    }
}

async function deleteSemester(semesterId) {
    if (!confirm('Supprimer ce semestre et toutes ses UEs/ECs?')) return;
    showLoader(true);
    try {
        const response = await authenticatedFetch(`/api/admin/semesters/${semesterId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            showAlert('Le semestre et ses UEs/ECs associés ont été supprimés.', 'success');
            loadMaquette();
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// MODALS POUR UEs
// ============================================================================

function showCreateUEModal(semesterId) {
    const modalContent = `
        <h2><i class="fas fa-plus"></i> Créer une UE</h2>
        <form id="create-ue-form">
            <div class="form-group">
                <label><i class="fas fa-code"></i> Code *</label>
                <input type="text" id="ue-code" required placeholder="Ex: UE11">
            </div>
            <div class="form-group">
                <label><i class="fas fa-book-open"></i> Nom *</label>
                <input type="text" id="ue-name" required placeholder="Ex: Systèmes de Communication">
            </div>
            <div class="form-group">
                <label><i class="fas fa-award"></i> Crédits</label>
                <input type="number" id="ue-credits" value="6" min="1">
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-check"></i> Créer
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Annuler
                </button>
            </div>
        </form>
    `;
    showModal(modalContent);
    
    document.getElementById('create-ue-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader(true);
        try {
            const response = await authenticatedFetch('/api/admin/ues', {
                method: 'POST',
                body: JSON.stringify({
                    semester_id: semesterId,
                    code: document.getElementById('ue-code').value,
                    name: document.getElementById('ue-name').value,
                    credits: parseInt(document.getElementById('ue-credits').value)
                })
            });
            const data = await response.json();
            if (data.success) {
                showAlert("L'UE a été créée avec succès.", 'success');
                closeModal();
                loadMaquette();
            } else {
                showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
            }
        } catch (error) {
            showAlert(humanError(error), 'error');
        } finally {
            showLoader(false);
        }
    });
}

async function showEditUEModal(ueId) {
    showLoader(true);
    try {
        // Récupérer l'UE
        const response = await authenticatedFetch('/api/ues');
        const ues = await response.json();
        const ue = ues.find(e => e.id === ueId);
        
        if (!ue) {
            showAlert('UE introuvable. Elle a peut-être été supprimée. Veuillez actualiser la page.', 'error');
            return;
        }
        
        const modalContent = `
            <h2><i class="fas fa-edit"></i> Modifier l'UE</h2>
            <form id="edit-ue-form">
                <div class="form-group">
                    <label><i class="fas fa-code"></i> Code *</label>
                    <input type="text" id="edit-ue-code" required value="${ue.code}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-book"></i> Nom *</label>
                    <input type="text" id="edit-ue-name" required value="${ue.name}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-award"></i> Crédits</label>
                    <input type="number" id="edit-ue-credits" value="${ue.credits}">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="edit-ue-active" ${ue.is_active ? 'checked' : ''}>
                        UE active
                    </label>
                </div>
                <div class="d-flex gap-2 mt-2">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-check"></i> Modifier
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i> Annuler
                    </button>
                </div>
            </form>
        `;
        showModal(modalContent, '700px');
        showLoader(false);
        
        document.getElementById('edit-ue-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoader(true);
            try {
                const response = await authenticatedFetch(`/api/admin/ues/${ueId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        code: document.getElementById('edit-ue-code').value,
                        name: document.getElementById('edit-ue-name').value,
                        credits: parseInt(document.getElementById('edit-ue-credits').value),
                        is_active: document.getElementById('edit-ue-active').checked
                    })
                });
                const data = await response.json();
                if (data.success) {
                    showAlert("L'UE a été modifiée avec succès.", 'success');
                    closeModal();
                    loadMaquette();
                } else {
                    showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
                }
            } catch (error) {
                showAlert(humanError(error), 'error');
            } finally {
                showLoader(false);
            }
        });
    } catch (error) {
        showAlert(humanError(error), 'error');
        showLoader(false);
    }
}

async function deleteUE(ueId) {
    if (!confirm('Supprimer cette UE et tous ses ECs?')) return;
    showLoader(true);
    try {
        const response = await authenticatedFetch(`/api/admin/ues/${ueId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            showAlert("L'UE et ses ECs associés ont été supprimés.", 'success');
            loadMaquette();
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// MODALS POUR ECs
// ============================================================================

function showCreateECModal(ueId) {
    const modalContent = `
        <h2><i class="fas fa-plus"></i> Créer un EC</h2>
        <form id="create-ec-form">
            <div class="form-group">
                <label><i class="fas fa-code"></i> Code *</label>
                <input type="text" id="ec-code" required placeholder="Ex: EC111">
            </div>
            <div class="form-group">
                <label><i class="fas fa-book"></i> Nom *</label>
                <input type="text" id="ec-name" required placeholder="Ex: Théorie de l'Information">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label><i class="fas fa-chalkboard-teacher"></i> CM (h)</label>
                    <input type="number" id="ec-cm" value="0" min="0">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-users"></i> TD (h)</label>
                    <input type="number" id="ec-td" value="0" min="0">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-flask"></i> TP (h)</label>
                    <input type="number" id="ec-tp" value="0" min="0">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label><i class="fas fa-home"></i> TPE (h)</label>
                    <input type="number" id="ec-tpe" value="0" min="0">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-clock"></i> VHT (h)</label>
                    <input type="number" id="ec-vht" value="0" min="0">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-balance-scale"></i> Coefficient</label>
                    <input type="number" id="ec-coefficient" value="1" min="1">
                </div>
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-check"></i> Créer
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Annuler
                </button>
            </div>
        </form>
    `;
    showModal(modalContent, '700px');
    
    document.getElementById('create-ec-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader(true);
        try {
            const response = await authenticatedFetch('/api/admin/ecs', {
                method: 'POST',
                body: JSON.stringify({
                    ue_id: ueId,
                    code: document.getElementById('ec-code').value,
                    name: document.getElementById('ec-name').value,
                    cm: parseInt(document.getElementById('ec-cm').value),
                    td: parseInt(document.getElementById('ec-td').value),
                    tp: parseInt(document.getElementById('ec-tp').value),
                    tpe: parseInt(document.getElementById('ec-tpe').value),
                    vht: parseInt(document.getElementById('ec-vht').value),
                    coefficient: parseInt(document.getElementById('ec-coefficient').value)
                })
            });
            const data = await response.json();
            if (data.success) {
                showAlert("L'EC a été créé avec succès.", 'success');
                closeModal();
                loadMaquette();
            } else {
                showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
            }
        } catch (error) {
            showAlert(humanError(error), 'error');
        } finally {
            showLoader(false);
        }
    });
}

async function showEditECModal(ecId) {
    showLoader(true);
    try {
        // Récupérer l'EC
        const response = await authenticatedFetch('/api/ecs');
        const ecs = await response.json();
        const ec = ecs.find(e => e.id === ecId);
        
        if (!ec) {
            showAlert('EC introuvable. Il a peut-être été supprimé. Veuillez actualiser la page.', 'error');
            return;
        }
        
        const modalContent = `
            <h2><i class="fas fa-edit"></i> Modifier l'EC</h2>
            <form id="edit-ec-form">
                <div class="form-group">
                    <label><i class="fas fa-code"></i> Code *</label>
                    <input type="text" id="edit-ec-code" required value="${ec.code}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-book"></i> Nom *</label>
                    <input type="text" id="edit-ec-name" required value="${ec.name}">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-award"></i> Crédits</label>
                    <input type="number" id="edit-ec-credits" value="${ec.credits}">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="edit-ec-active" ${ec.is_active ? 'checked' : ''}>
                        EC actif
                    </label>
                </div>
                <div class="d-flex gap-2 mt-2">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-check"></i> Modifier
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i> Annuler
                    </button>
                </div>
            </form>
        `;
        showModal(modalContent, '700px');
        showLoader(false);
        
        document.getElementById('edit-ec-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoader(true);
            try {
                const response = await authenticatedFetch(`/api/admin/ecs/${ecId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        code: document.getElementById('edit-ec-code').value,
                        name: document.getElementById('edit-ec-name').value,
                        cm: parseInt(document.getElementById('edit-ec-cm').value),
                        td: parseInt(document.getElementById('edit-ec-td').value),
                        tp: parseInt(document.getElementById('edit-ec-tp').value),
                        tpe: parseInt(document.getElementById('edit-ec-tpe').value),
                        vht: parseInt(document.getElementById('edit-ec-vht').value),
                        coefficient: parseInt(document.getElementById('edit-ec-coefficient').value),
                        is_active: document.getElementById('edit-ec-active').checked
                    })
                });
                const data = await response.json();
                if (data.success) {
                    showAlert("L'EC a été modifié avec succès.", 'success');
                    closeModal();
                    loadMaquette();
                } else {
                    showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
                }
            } catch (error) {
                showAlert(humanError(error), 'error');
            } finally {
                showLoader(false);
            }
        });
    } catch (error) {
        showAlert(humanError(error), 'error');
        showLoader(false);
    }
}

// ============================================================================
// EXPORT PDF
// ============================================================================
async function exportPaperPDF(paperId) {
    showLoader(true);
    try {
        const response = await fetch(`/api/papers/${paperId}/export`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
       
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `copie_${paperId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('La copie corrigée a été téléchargée en PDF avec succès.', 'success');
        } else {
            showAlert('Impossible de générer le PDF. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// IMPORT CSV - UTILISATEURS
// ============================================================================

function showImportUsersModal() {
    const modalContent = `
        <h2>Import Bulk Utilisateurs</h2>
        <p>Importez plusieurs utilisateurs à la fois via un fichier CSV</p>
        
        <div class="alert alert-info">
            <strong>Instructions :</strong>
            <ol style="margin: 10px 0 0 20px;">
                <li>Téléchargez le template CSV</li>
                <li>Remplissez-le avec les données (full_name, email, password, role)</li>
                <li>Rôles possibles : <code>student</code>, <code>professor</code>, <code>admin</code></li>
                <li>Uploadez le fichier</li>
            </ol>
        </div>
        
        <div style="display: flex; gap: 12px; margin: 20px 0;">
            <button class="btn btn-info" onclick="downloadUsersTemplate()">
                <i class="fa fa-download"></i> Télécharger Template CSV
            </button>
        </div>
        
        <form id="import-users-form">
            <div class="form-group">
                <label>Fichier CSV *</label>
                <input type="file" id="users-csv-file" accept=".csv" required>
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-success">
                    <i class="fa fa-upload"></i> Importer
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
            </div>
        </form>
        
        <div id="import-results" style="display: none; margin-top: 20px;"></div>
    `;
    
    showModal(modalContent, '700px');
    
    document.getElementById('import-users-form').addEventListener('submit', handleImportUsers);
}

async function downloadUsersTemplate() {
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/admin/users/csv-template');
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `template_utilisateurs_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('Le fichier template a été téléchargé avec succès.', 'success');
        } else {
            showAlert('Impossible de télécharger le fichier. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function handleImportUsers(e) {
    e.preventDefault();
    showLoader(true);
    
    const fileInput = document.getElementById('users-csv-file');
    const file = fileInput.files[0];
    
    if (!file) {
        showAlert('Veuillez sélectionner un fichier', 'error');
        showLoader(false);
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/admin/users/import-csv', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
             let resultsHTML = `
                 <div class="alert alert-success">
                     <strong>✅ ${data.created} utilisateur(s) créé(s)</strong>
                     ${data.emails_sent > 0 ? `<br>📧 ${data.emails_sent} email(s) de notification envoyé(s)` : ''}
                     ${data.emails_sent < data.created ? '<br>⚠️ Certains emails n\'ont pas pu être envoyés (timeout SMTP)' : ''}
                 </div>
            `;
            
            if (data.users && data.users.length > 0) {
                resultsHTML += '<h4>Utilisateurs créés :</h4><ul>';
                data.users.forEach(u => {
                    resultsHTML += `<li><strong>${u.full_name}</strong> (${u.email}) - ${u.role}</li>`;
                });
                resultsHTML += '</ul>';
            }
            
            if (data.errors > 0) {
                resultsHTML += `
                    <div class="alert alert-warning mt-2">
                        <strong>⚠️ ${data.errors} erreur(s)</strong>
                        <ul style="margin: 10px 0 0 20px;">
                            ${data.error_details.map(err => `<li>${err}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            document.getElementById('import-results').innerHTML = resultsHTML;
            document.getElementById('import-results').style.display = 'block';
            
            showAlert(`Import CSV terminé : ${data.created} utilisateur(s) créé(s), ${data.errors} erreur(s).`, 'success');
            
            // Recharger la liste après 2 secondes
            setTimeout(() => {
                closeModal();
                loadUsers();
            }, 2000);
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// IMPORT CSV - MAQUETTE
// ============================================================================

function showImportMaquetteModal() {
    const modalContent = `
        <h2>Import Bulk Maquette</h2>
        <p>Importez formations, semestres, UEs et ECs via CSV</p>
        
        <div class="alert alert-info">
            <strong>Instructions: </strong>
            <ol style="margin: 10px 0 0 20px;">
                <li>Téléchargez le template CSV</li>
                <li>Remplissez ligne par ligne : d'abord formations, puis semestres, puis UEs, puis ECs</li>
                <li>Respectez l'ordre hiérarchique</li>
                <li>Uploadez le fichier</li>
            </ol>
        </div>
        
        <div style="display: flex; gap: 12px; margin: 20px 0;">
            <button class="btn btn-info" onclick="downloadMaquetteTemplate()">
                <i class="fa fa-download"></i> Télécharger Template CSV
            </button>
        </div>
        
        <form id="import-maquette-form">
            <div class="form-group">
                <label>Fichier CSV *</label>
                <input type="file" id="maquette-csv-file" accept=".csv" required>
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-success">
                    <i class="fa fa-upload"></i> Importer
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
            </div>
        </form>
        
        <div id="maquette-import-results" style="display: none; margin-top: 20px;"></div>
    `;
    
    showModal(modalContent, '700px');
    
    document.getElementById('import-maquette-form').addEventListener('submit', handleImportMaquette);
}

async function downloadMaquetteTemplate() {
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/admin/maquette/csv-template');
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `template_maquette_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('Le fichier template a été téléchargé avec succès.', 'success');
        } else {
            showAlert('Impossible de télécharger le fichier. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function handleImportMaquette(e) {
    e.preventDefault();
    showLoader(true);
    
    const fileInput = document.getElementById('maquette-csv-file');
    const file = fileInput.files[0];
    
    if (!file) {
        showAlert('Veuillez sélectionner un fichier', 'error');
        showLoader(false);
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/admin/maquette/import-csv', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            let resultsHTML = `
                <div class="alert alert-success">
                    <strong>✅ Import réussi !</strong><br>
                    • Formations: ${data.created.formations || 0}<br>
                    • Semestres: ${data.created.semesters || 0}<br>
                    • UEs: ${data.created.ues || 0}<br>
                    • ECs: ${data.created.ecs || 0}
                </div>
            `;
            
            if (data.errors && data.errors.length > 0) {
                resultsHTML += `
                    <div class="alert alert-warning mt-2">
                        <strong>⚠️ ${data.errors.length} erreur(s)</strong>
                        <ul style="margin: 10px 0 0 20px;">
                            ${data.errors.map(err => `<li>${err}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            document.getElementById('maquette-import-results').innerHTML = resultsHTML;
            document.getElementById('maquette-import-results').style.display = 'block';
            
            showAlert('La maquette pédagogique a été importée avec succès.', 'success');
            
            // Recharger la maquette après 2 secondes
            setTimeout(() => {
                closeModal();
                loadMaquette();
            }, 2000);
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }

  }
// ============================================================================
// FONCTIONS MANQUANTES : GESTION DES RÉCLAMATIONS (PROFESSEUR)
// ============================================================================

async function showRespondReclamationModal(reclamationId) {
    showLoader(true);
    
    try {
        // Récupérer les détails de la réclamation
        const response = await authenticatedFetch('/api/reclamations');
        const reclamations = await response.json();
        const reclamation = reclamations.find(r => r.id === reclamationId);

        if (!reclamation) {
            showAlert('Réclamation introuvable. Veuillez actualiser la liste.', 'error');
            showLoader(false);
            return;
        }

        // Récupérer les détails de la copie corrigée
        // ✅ CORRECT
	const paperResponse = await authenticatedFetch(`/api/papers/detail/${reclamation.paper_id}`);
        const paper = await paperResponse.json();

        const modalContent = `
            <h2><i class="fas fa-reply"></i> Répondre à la Réclamation</h2>
            
            <div class="alert alert-info" style="margin-bottom: 20px;">
                <h4><i class="fas fa-info-circle"></i> Détails de la Réclamation</h4>
                <p><strong>Étudiant:</strong> ${reclamation.student_name}</p>
                <p><strong>Sujet:</strong> ${reclamation.subject_title}</p>
                <p><strong>Date:</strong> ${new Date(reclamation.created_at).toLocaleString('fr-FR')}</p>
                <p><strong>Raison:</strong></p>
                <div style="background: white; padding: 10px; border-radius: 4px; margin-top: 8px;">
                    ${reclamation.reason}
                </div>
            </div>

            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-file-alt"></i> Copie Corrigée</h4>
                </div>
                <div style="padding: 15px;">
                    <p><strong>Note actuelle:</strong> <span style="font-size: 24px; color: ${paper.score >= 10 ? '#10b981' : '#ef4444'}; font-weight: bold;">${paper.score}/20</span></p>
                    
                    <div style="margin-top: 15px;">
                        <strong><i class="fas fa-comment"></i> Feedback initial:</strong>
                        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; margin-top: 8px; max-height: 200px; overflow-y: auto; white-space: pre-wrap;">
${paper.feedback || 'Aucun feedback disponible'}
                        </div>
                    </div>

                    <div style="margin-top: 15px;">
                        <button class="btn btn-sm btn-info" onclick="viewPaperDetail(${paper.id})">
                            <i class="fas fa-eye"></i> Voir la copie complète
                        </button>
                    </div>
                </div>
            </div>

            ${reclamation.ia_proposed_status ? `
                <div class="alert alert-warning" style="margin-bottom: 20px;">
                    <h4><i class="fas fa-robot"></i> Proposition de l'IA</h4>
                    <p><strong>Statut suggéré:</strong> ${reclamation.ia_proposed_status === 'resolved' ? '✅ Accepter' : '❌ Rejeter'}</p>
                    <p><strong>Raison:</strong></p>
                    <div style="background: white; padding: 10px; border-radius: 4px; margin-top: 8px;">
                        ${reclamation.ia_proposed_reason}
                    </div>
                    ${reclamation.ia_proposed_score ? `<p><strong>Note proposée:</strong> ${reclamation.ia_proposed_score}/20</p>` : ''}
                </div>
            ` : ''}

            <form id="respond-reclamation-form">
                <div class="form-group">
                    <label><i class="fas fa-tasks"></i> Décision *</label>
                    <select id="reclamation-status" required>
                        <option value="">-- Choisir --</option>
                        <option value="resolved">✅ Accepter la réclamation</option>
                        <option value="rejected">❌ Rejeter la réclamation</option>
                    </select>
                </div>

                <div class="form-group" id="new-score-group" style="display: none;">
                    <label><i class="fas fa-star"></i> Nouvelle Note (sur 20)</label>
                    <input type="number" id="reclamation-new-score" min="0" max="20" step="0.5" value="${paper.score}">
                    <small class="form-help">Note actuelle: ${paper.score}/20</small>
                </div>

                <div class="form-group">
                    <label><i class="fas fa-comment"></i> Réponse au professeur/étudiant *</label>
                    <textarea id="reclamation-response" rows="5" required placeholder="Expliquez votre décision..."></textarea>
                </div>

                <div class="d-flex gap-2 mt-2">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-paper-plane"></i> Envoyer la Réponse
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i> Annuler
                    </button>
                </div>
            </form>
        `;

        showModal(modalContent, '900px');
        showLoader(false);

        // Afficher/masquer le champ nouvelle note selon la décision
        document.getElementById('reclamation-status').addEventListener('change', function() {
            const newScoreGroup = document.getElementById('new-score-group');
            if (this.value === 'resolved') {
                newScoreGroup.style.display = 'block';
            } else {
                newScoreGroup.style.display = 'none';
            }
        });

        // Gestionnaire de soumission
        document.getElementById('respond-reclamation-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoader(true);

            try {
                const status = document.getElementById('reclamation-status').value;
                const response = document.getElementById('reclamation-response').value;
                const newScore = status === 'resolved' ? parseFloat(document.getElementById('reclamation-new-score').value) : null;

                const requestData = {
                    status: status,
                    response: response
                };

                if (newScore !== null) {
                    requestData.new_score = newScore;
                }

                const updateResponse = await authenticatedFetch(`/api/reclamations/${reclamationId}`, {
                    method: 'PUT',
                    body: JSON.stringify(requestData)
                });

                const data = await updateResponse.json();

                if (data.success) {
                    showAlert("Votre réponse a été envoyée. L'étudiant sera notifié de votre décision.", 'success');
                    closeModal();
                    loadReclamations();
                } else {
                    showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
                }
            } catch (error) {
                showAlert(humanError(error), 'error');
            } finally {
                showLoader(false);
            }
        });

    } catch (error) {
        showAlert('Impossible de charger les détails. Veuillez réessayer.', 'error');
        showLoader(false);
    }
}

async function processReclamationIA(reclamationId) {
    if (!confirm('Voulez-vous que l\'IA analyse cette réclamation et propose une décision ?')) {
        return;
    }

    showLoader(true);

    try {
        // Appeler l'endpoint IA
        const response = await authenticatedFetch(`/api/reclamations/${reclamationId}/process_ia`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showAlert('Analyse IA terminée! Consultez la proposition.', 'success');
            
            // Afficher le résultat dans un modal
            const modalContent = `
                <h2><i class="fas fa-robot"></i> Proposition de l'IA</h2>
                
                <div class="alert alert-info">
                    <h4><i class="fas fa-lightbulb"></i> Analyse Complétée</h4>
                    <p>L'IA a analysé la réclamation et la copie de l'étudiant.</p>
                </div>

                <div class="card" style="margin-bottom: 20px;">
                    <div class="card-header">
                        <h4><i class="fas fa-tasks"></i> Décision Suggérée</h4>
                    </div>
                    <div style="padding: 15px;">
                        <p style="font-size: 20px; font-weight: bold; color: ${data.ia_proposed_status === 'resolved' ? '#10b981' : '#ef4444'};">
                            ${data.ia_proposed_status === 'resolved' ? '✅ Accepter la réclamation' : '❌ Rejeter la réclamation'}
                        </p>
                    </div>
                </div>

                <div class="card" style="margin-bottom: 20px;">
                    <div class="card-header">
                        <h4><i class="fas fa-comment"></i> Justification</h4>
                    </div>
                    <div style="padding: 15px;">
                        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; white-space: pre-wrap;">
${data.ia_decision || data.ia_proposed_reason || 'Aucune justification fournie'}
                        </div>
                    </div>
                </div>

                ${data.ia_proposed_score ? `
                    <div class="card" style="margin-bottom: 20px;">
                        <div class="card-header">
                            <h4><i class="fas fa-star"></i> Note Proposée</h4>
                        </div>
                        <div style="padding: 15px;">
                            <p style="font-size: 24px; font-weight: bold; color: #3b82f6;">
                                ${data.ia_proposed_score}/20
                            </p>
                            <small style="color: #64748b;">Note actuelle: ${data.current_score}/20</small>
                        </div>
                    </div>
                ` : ''}

                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i> 
                    <strong>Important:</strong> Cette proposition est une aide à la décision. 
                    Vous devez l'examiner et valider manuellement via le bouton "Répondre".
                </div>

                <div style="display: flex; gap: 12px; margin-top: 20px;">
                    <button class="btn btn-primary" onclick="closeModal(); showRespondReclamationModal(${reclamationId})">
                        <i class="fas fa-reply"></i> Répondre Maintenant
                    </button>
                    <button class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i> Fermer
                    </button>
                </div>
            `;

            showModal(modalContent, '800px');
            
            // Recharger les réclamations pour voir la mise à jour
            loadReclamations();
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert("Impossible de lancer l'analyse IA. Vérifiez votre connexion et réessayez.", 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// FONCTION MANQUANTE : VOIR DÉTAIL D'UNE COPIE
// ============================================================================

async function viewPaperDetail(paperId) {
    showLoader(true);
    
    try {
        const response = await authenticatedFetch(`/api/papers/detail/${paperId}`);
        
        if (!response.ok) {
            throw new Error('Erreur lors du chargement de la copie');
        }

        const paper = await response.json();

        const scoreClass = paper.score >= 10 ? 'success' : 'danger';

        const modalContent = `
            <h2><i class="fas fa-file-alt"></i> Détails de la Copie</h2>

            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-info-circle"></i> Informations Générales</h4>
                </div>
                <div style="padding: 15px;">
                    <p><strong><i class="fas fa-user"></i> Étudiant:</strong> ${paper.student_name}</p>
                    <p><strong><i class="fas fa-book"></i> Sujet:</strong> ${paper.subject_title}</p>
                    <p><strong><i class="fas fa-star"></i> Note:</strong> 
                        <span style="font-size: 24px; color: ${paper.score >= 10 ? '#10b981' : '#ef4444'}; font-weight: bold;">
                            ${paper.score}/20
                        </span>
                    </p>
                    <p><strong><i class="fas fa-calendar"></i> Date de correction:</strong> ${new Date(paper.corrected_at).toLocaleString('fr-FR')}</p>
                </div>
            </div>

            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-file-alt"></i> Contenu de la Copie</h4>
                </div>
                <div style="padding: 15px;">
                    <div style="max-height: 300px; overflow-y: auto; padding: 12px; background: #f8fafc; border-radius: 6px; white-space: pre-wrap; font-family: monospace; font-size: 13px;">
${paper.content}
                    </div>
                </div>
            </div>

            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-comment"></i> Feedback de Correction</h4>
                </div>
                <div style="padding: 15px;">
                    <div style="max-height: 300px; overflow-y: auto; padding: 12px; background: #f1f5f9; border-radius: 6px; white-space: pre-wrap; font-family: monospace; font-size: 13px;">
${paper.grade || paper.feedback || 'Aucun feedback disponible'}
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button class="btn btn-primary" onclick="exportPaperPDF(${paper.id})">
                    <i class="fas fa-file-pdf"></i> Télécharger PDF
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Fermer
                </button>
            </div>
        `;

        showModal(modalContent, '900px');

    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// EXAMENS EN LIGNE - GESTION (PROFESSEUR)
// ============================================================================

async function loadOnlineExams() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);

    try {
        const response = await authenticatedFetch('/api/online_exams');
        const exams = await response.json();

        const isProfOrAdmin = currentUser.role === 'professor' || currentUser.role === 'admin';
        const stats = {
            total: exams.length,
            active: exams.filter(e => e.status === 'active').length,
            scheduled: exams.filter(e => e.status === 'scheduled').length,
            closed: exams.filter(e => e.status === 'closed').length,
        };

        let html = `
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:28px;">
                <div>
                    <h2 style="font-size:24px;font-weight:700;color:#0f172a;margin:0;display:flex;align-items:center;gap:12px;">
                        <span style="background:#3b82f6;width:44px;height:44px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas fa-laptop-code" style="color:white;font-size:18px;"></i>
                        </span>
                        Examens en Ligne
                    </h2>
                    <p style="color:#64748b;margin:6px 0 0 56px;font-size:13px;">
                        Créez et gérez des examens avec surveillance anti-triche
                    </p>
                </div>
                ${isProfOrAdmin ? `
                <button class="btn btn-primary" onclick="showCreateOnlineExamModal()"
                    style="display:inline-flex;align-items:center;gap:8px;padding:11px 20px;">
                    <i class="fas fa-plus"></i> Créer un Examen
                </button>` : ''}
            </div>
        `;

        // Stats row (prof/admin only)
        if (isProfOrAdmin && exams.length > 0) {
            const statItems = [
                { label: 'Total', value: stats.total, icon: 'fa-list', color: '#3b82f6', bg: 'rgba(59,130,246,.1)' },
                { label: 'En cours', value: stats.active, icon: 'fa-play-circle', color: '#10b981', bg: 'rgba(16,185,129,.1)' },
                { label: 'Planifiés', value: stats.scheduled, icon: 'fa-calendar-alt', color: '#f59e0b', bg: 'rgba(245,158,11,.1)' },
                { label: 'Terminés', value: stats.closed, icon: 'fa-check-circle', color: '#ef4444', bg: 'rgba(239,68,68,.1)' },
            ];
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px;margin-bottom:28px;">`;
            statItems.forEach(s => {
                html += `
                <div style="background:white;border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #f1f5f9;display:flex;align-items:center;gap:12px;">
                    <div style="background:${s.bg};width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas ${s.icon}" style="color:${s.color};font-size:16px;"></i>
                    </div>
                    <div>
                        <div style="font-size:22px;font-weight:700;color:#0f172a;line-height:1.1;">${s.value}</div>
                        <div style="font-size:11px;color:#64748b;font-weight:500;margin-top:2px;">${s.label}</div>
                    </div>
                </div>`;
            });
            html += `</div>`;
        }

        if (exams.length === 0) {
            html += `
                <div style="text-align:center;padding:64px 24px;background:white;border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #f1f5f9;">
                    <i class="fas fa-laptop-code" style="font-size:52px;color:#cbd5e1;display:block;margin-bottom:16px;"></i>
                    <h3 style="color:#475569;font-size:18px;font-weight:600;margin:0 0 8px;">Aucun examen disponible</h3>
                    ${isProfOrAdmin ? `
                    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;">Créez votre premier examen en ligne avec surveillance intégrée.</p>
                    <button class="btn btn-primary" onclick="showCreateOnlineExamModal()">
                        <i class="fas fa-plus"></i> Créer un Examen
                    </button>` : `<p style="color:#94a3b8;font-size:14px;margin:0;">Aucun examen disponible pour le moment.</p>`}
                </div>
            `;
        } else {
            const statusConfig = {
                'draft':     { label: 'Brouillon', color: '#64748b', bg: '#f1f5f9', bar: '#cbd5e1', icon: 'fa-edit' },
                'scheduled': { label: 'Planifié',  color: '#d97706', bg: '#fffbeb', bar: '#fcd34d', icon: 'fa-calendar-alt' },
                'active':    { label: 'En cours',  color: '#059669', bg: '#ecfdf5', bar: '#34d399', icon: 'fa-play-circle' },
                'closed':    { label: 'Terminé',   color: '#dc2626', bg: '#fff1f2', bar: '#fca5a5', icon: 'fa-check-circle' },
            };
            const fmtOpts = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar' };

            html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;">`;

            exams.forEach(exam => {
                const sc = statusConfig[exam.status] || statusConfig['draft'];
                const now = new Date();
                const startTime = new Date(exam.start_time);
                const endTime = new Date(exam.end_time);
                const isAvailableNow = now >= startTime && now <= endTime;
                const canCompose = (exam.status === 'active' || (exam.status === 'scheduled' && isAvailableNow));
                const safeTitle = (exam.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

                const startStr = startTime.toLocaleString('fr-FR', fmtOpts);
                const endStr = endTime.toLocaleString('fr-FR', fmtOpts);
                const dH = Math.floor(exam.duration_minutes / 60);
                const dM = exam.duration_minutes % 60;
                const durationStr = dH > 0 ? (dM > 0 ? `${dH}h${String(dM).padStart(2,'0')}` : `${dH}h`) : `${dM} min`;

                // Security chips
                const chipStyle = (bg, color) => `background:${bg};color:${color};padding:3px 9px;border-radius:99px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;`;
                let secChips = `<span style="${chipStyle('#fff7ed','#c2410c')}" title="Seuil changements de fenêtre"><i class="fas fa-exchange-alt"></i> ${exam.max_tab_switches} chgt${exam.max_tab_switches !== 1 ? 's' : ''}</span>`;
                const maxNF = exam.max_no_face_count != null ? exam.max_no_face_count : 10;
                if (maxNF >= 0) secChips += `<span style="${chipStyle('#fef2f2','#ef4444')}" title="Seuil visage absent"><i class="fas fa-eye-slash"></i> ${maxNF} visage${maxNF !== 1 ? 's' : ''}</span>`;
                if (exam.ban_on_devtools) secChips += `<span style="${chipStyle('#fdf4ff','#7c3aed')}" title="Bannissement si outils dev"><i class="fas fa-terminal"></i> Dev ban</span>`;
                if (!exam.enable_copy_paste) secChips += `<span style="${chipStyle('#f1f5f9','#64748b')}" title="Copier/Coller interdit"><i class="fas fa-ban"></i> C/C</span>`;
                if (!exam.enable_right_click) secChips += `<span style="${chipStyle('#f1f5f9','#64748b')}" title="Clic droit interdit"><i class="fas fa-ban"></i> Clic droit</span>`;
                if (isProfOrAdmin && exam.attempts_count > 0) {
                    secChips += `<span style="${chipStyle('rgba(99,102,241,.1)','#6366f1')}"><i class="fas fa-users"></i> ${exam.attempts_count}</span>`;
                }

                // Action buttons
                let actionsHTML = '';
                if (currentUser.role === 'student') {
                    if (canCompose) {
                        actionsHTML = `<button class="btn btn-success btn-sm" onclick="startOnlineExam(${exam.id})" style="flex:1;"><i class="fas fa-play"></i> Composer</button>`;
                    } else if (now < startTime) {
                        actionsHTML = `<button class="btn btn-sm" style="flex:1;background:#fffbeb;color:#d97706;border:1px solid #fcd34d;cursor:pointer;" onclick="showExamNotStartedInfo('${exam.start_time}','${safeTitle}')"><i class="fas fa-clock"></i> Pas encore ouvert</button>`;
                    } else {
                        actionsHTML = `<span style="color:#94a3b8;font-size:13px;display:flex;align-items:center;gap:6px;"><i class="fas fa-check"></i> Terminé</span>`;
                    }
                } else {
                    actionsHTML += `<button class="btn btn-sm" onclick="viewOnlineExamDetails(${exam.id})" title="Détails" style="background:#f1f5f9;color:#475569;flex:1;"><i class="fas fa-eye"></i> Détails</button>`;
                    if (exam.status === 'active') {
                        actionsHTML += `<button class="btn btn-sm" onclick="openProctoringDashboard(${exam.id})" title="Surveiller" style="background:rgba(124,58,237,.1);color:#7c3aed;flex:1;"><i class="fas fa-shield-alt"></i> Surveiller</button>`;
                        actionsHTML += `<button class="btn btn-sm btn-danger" onclick="closeExam(${exam.id})" title="Clôturer" style="flex:1;"><i class="fas fa-stop-circle"></i> Clôturer</button>`;
                    }
                    if (exam.status === 'scheduled' || exam.status === 'draft') {
                        actionsHTML += `<button class="btn btn-sm btn-success" onclick="activateExam(${exam.id})" title="Activer" style="flex:1;"><i class="fas fa-play-circle"></i> Activer</button>`;
                    }
                    actionsHTML += `<button class="btn btn-sm" onclick="deleteOnlineExam(${exam.id}, '${safeTitle}', ${exam.attempts_count || 0})" title="Supprimer" style="background:rgba(239,68,68,.1);color:#ef4444;padding:8px 12px;flex-shrink:0;"><i class="fas fa-trash"></i></button>`;
                }

                html += `
                <div style="background:white;border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,.07);border:1px solid #f1f5f9;overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .2s,transform .2s;"
                     onmouseenter="this.style.boxShadow='0 8px 24px rgba(0,0,0,.1)';this.style.transform='translateY(-2px)'"
                     onmouseleave="this.style.boxShadow='0 1px 4px rgba(0,0,0,.07)';this.style.transform='translateY(0)'">
                    <div style="height:4px;background:${sc.bar};"></div>
                    <div style="padding:18px 20px;flex:1;">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;">
                            <h3 style="font-size:15px;font-weight:700;color:#0f172a;margin:0;line-height:1.35;flex:1;">${exam.title}</h3>
                            <span style="background:${sc.bg};color:${sc.color};padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;display:inline-flex;align-items:center;gap:4px;">
                                <i class="fas ${sc.icon}"></i> ${sc.label}
                            </span>
                        </div>
                        <div style="display:flex;align-items:center;gap:7px;color:#64748b;font-size:13px;margin-bottom:${isProfOrAdmin ? '6px' : '12px'};">
                            <i class="fas fa-book" style="color:#3b82f6;width:13px;"></i>
                            <span>${exam.subject_title || 'Sans sujet'}</span>
                        </div>
                        ${isProfOrAdmin ? `
                        <div style="display:flex;align-items:center;gap:7px;color:#94a3b8;font-size:12px;margin-bottom:12px;">
                            <i class="fas fa-user" style="width:13px;"></i>
                            <span>${exam.creator_name || ''}</span>
                        </div>` : ''}
                        <div style="background:#f8fafc;border-radius:8px;padding:10px 12px;margin-bottom:12px;border:1px solid #f1f5f9;">
                            <div style="display:flex;align-items:center;gap:8px;color:#475569;font-size:12px;margin-bottom:5px;">
                                <i class="fas fa-play" style="color:#10b981;font-size:9px;"></i>
                                <span style="flex:1;">${startStr}</span>
                                <span style="font-weight:700;color:#0f172a;display:flex;align-items:center;gap:4px;"><i class="fas fa-clock" style="color:#3b82f6;font-size:11px;"></i> ${durationStr}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;color:#475569;font-size:12px;">
                                <i class="fas fa-stop" style="color:#ef4444;font-size:9px;"></i>
                                <span>${endStr}</span>
                            </div>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:5px;">${secChips}</div>
                    </div>
                    <div style="padding:12px 16px;border-top:1px solid #f1f5f9;background:#fafafa;display:flex;gap:7px;flex-wrap:wrap;align-items:center;">
                        ${actionsHTML}
                    </div>
                </div>`;
            });

            html += `</div>`;
        }

        document.getElementById('main-content').innerHTML = html;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function deleteOnlineExam(examId, examTitle, attemptsCount) {
    const title = examTitle || `Examen #${examId}`;
    const hasAttempts = attemptsCount > 0;
    const attemptWarning = hasAttempts ? `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;margin:0 0 16px;text-align:left;">
            <div style="font-weight:600;color:#b91c1c;margin-bottom:4px;font-size:13px;">
                <i class="fas fa-exclamation-triangle"></i> Attention : données étudiants
            </div>
            <div style="color:#7f1d1d;font-size:12px;line-height:1.5;">
                ${attemptsCount} étudiant(s) ont déjà composé cet examen.<br>
                <strong>Toutes leurs copies, réponses et logs seront définitivement supprimés.</strong>
            </div>
        </div>` : '';
    showModal(`
        <div style="text-align:center;padding:8px 0 4px;">
            <div style="width:64px;height:64px;background:rgba(239,68,68,.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                <i class="fas fa-trash-alt" style="font-size:26px;color:#ef4444;"></i>
            </div>
            <h3 style="color:#0f172a;font-size:20px;font-weight:700;margin:0 0 10px;">Supprimer l'examen ?</h3>
            <p style="color:#64748b;font-size:14px;margin:0 0 8px;">Vous êtes sur le point de supprimer :</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:0 0 16px;font-weight:600;color:#0f172a;font-size:15px;">${title}</div>
            ${attemptWarning}
            <p style="color:#ef4444;font-size:13px;margin:0 0 28px;display:flex;align-items:center;justify-content:center;gap:6px;">
                <i class="fas fa-exclamation-triangle"></i>
                Cette action est définitive et irréversible.
            </p>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button class="btn btn-secondary" onclick="closeModal()" style="min-width:120px;">
                    <i class="fas fa-times"></i> Annuler
                </button>
                <button class="btn btn-danger" id="confirm-delete-exam-btn" onclick="confirmDeleteOnlineExam(${examId})" style="min-width:140px;">
                    <i class="fas fa-trash-alt"></i> ${hasAttempts ? 'Tout supprimer' : 'Supprimer'}
                </button>
            </div>
        </div>
    `, '460px');
}

async function confirmDeleteOnlineExam(examId) {
    const btn = document.getElementById('confirm-delete-exam-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suppression...'; }

    try {
        const response = await authenticatedFetch(`/api/online_exams/${examId}`, { method: 'DELETE' });
        const data = await response.json();
        closeModal();
        if (data.success) {
            showAlert("L'examen a été supprimé avec succès.", 'success');
            loadOnlineExams();
        } else {
            showAlert(data.error || "Impossible de supprimer l'examen. Veuillez réessayer.", 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash-alt"></i> Supprimer'; }
        }
    } catch (error) {
        // authenticatedFetch a déjà affiché l'alerte pour les erreurs 400/403/404/500
        // On ferme juste le modal sans double-alerte
        closeModal();
    }
}

async function showCreateOnlineExamModal() {
    showLoader(true);
   
    try {
        // Récupérer les sujets
        const subjectsResponse = await authenticatedFetch('/api/subjects');
        const subjects = await subjectsResponse.json();
       
        let subjectsOptions = '<option value="">-- Sélectionner un sujet --</option>';
        subjects.forEach(s => {
            subjectsOptions += `<option value="${s.id}">${s.title}</option>`;
        });
       
        const modalContent = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
                <div style="background:#3b82f6;width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas fa-plus" style="color:white;font-size:16px;"></i>
                </div>
                <div>
                    <h2 style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">Créer un Examen en Ligne</h2>
                    <p style="margin:2px 0 0;font-size:13px;color:#64748b;">Configurez les paramètres de votre examen</p>
                </div>
            </div>
            <form id="create-online-exam-form">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">
                    <div class="form-group" style="grid-column:1/-1;">
                        <label><i class="fas fa-book"></i> Sujet Associé *</label>
                        <select id="exam-subject" required>${subjectsOptions}</select>
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label><i class="fas fa-heading"></i> Titre de l'Examen *</label>
                        <input type="text" id="exam-title" required placeholder="Ex: Examen Final Blockchain">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-calendar-plus"></i> Début *</label>
                        <input type="datetime-local" id="exam-start" required>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-calendar-minus"></i> Fin *</label>
                        <input type="datetime-local" id="exam-end" required>
                        <small class="form-help">Durée calculée automatiquement</small>
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label><i class="fas fa-align-left"></i> Instructions</label>
                        <textarea id="exam-instructions" rows="3" placeholder="Consignes pour les étudiants..."></textarea>
                    </div>
                </div>

                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
                        <i class="fas fa-shield-alt" style="color:#7c3aed;font-size:15px;"></i>
                        <span style="font-weight:700;color:#0f172a;font-size:14px;">Paramètres de Sécurité</span>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">
                        <div class="form-group">
                            <label style="font-size:13px;"><i class="fas fa-exchange-alt" style="color:#f59e0b;"></i> Seuil — changements de fenêtre</label>
                            <input type="number" id="exam-max-switches" min="0" max="20" value="2">
                            <small class="form-help">Bannissement après ce nombre (0 = aucun toléré)</small>
                        </div>
                        <div class="form-group">
                            <label style="font-size:13px;"><i class="fas fa-eye-slash" style="color:#ef4444;"></i> Seuil — visage absent (caméra)</label>
                            <input type="number" id="exam-max-no-face" min="-1" max="100" value="10">
                            <small class="form-help">Bannissement après N détections sans visage (-1 = désactivé)</small>
                        </div>
                    </div>

                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px;">
                        <input type="checkbox" id="exam-ban-devtools" checked style="width:auto;margin-top:2px;flex-shrink:0;">
                        <div>
                            <label for="exam-ban-devtools" style="font-size:13px;font-weight:600;color:#dc2626;cursor:pointer;margin:0;display:block;">
                                <i class="fas fa-terminal"></i> Bannir immédiatement si outils développeur ouverts
                            </label>
                            <small style="color:#64748b;">Exclusion instantanée en cas de tentative d'accès aux outils développeur (F12, Ctrl+Shift+I…)</small>
                        </div>
                    </div>

                    <div style="display:flex;gap:20px;flex-wrap:wrap;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#475569;">
                            <input type="checkbox" id="exam-copy-paste" style="width:auto;">
                            <span>Autoriser Copier/Coller</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#475569;">
                            <input type="checkbox" id="exam-right-click" style="width:auto;">
                            <span>Autoriser Clic Droit</span>
                        </label>
                    </div>
                </div>

                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i> Annuler
                    </button>
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-check"></i> Créer l'Examen
                    </button>
                </div>
            </form>
        `;
       
        showModal(modalContent, '800px');
        showLoader(false);
       
        document.getElementById('create-online-exam-form').addEventListener('submit', handleCreateOnlineExam);
    } catch (error) {
        showAlert(humanError(error), 'error');
        showLoader(false);
    }
}

// FIX ENVOI : Force UTC dans handleCreateOnlineExam
async function handleCreateOnlineExam(e) {
    e.preventDefault();
    showLoader(true);
   
    try {
        // La valeur du datetime-local est saisie en heure Dakar (UTC+0).
        // On envoie la chaîne brute + "Z" pour forcer UTC sans aucune
        // conversion par le navigateur (évite le décalage du fuseau local).
        const rawStart = document.getElementById('exam-start').value; // ex: "2026-03-30T18:05"
        const rawEnd   = document.getElementById('exam-end').value;
        if (!rawStart || !rawEnd) {
            showAlert('Veuillez renseigner les dates de début et de fin.', 'warning');
            showLoader(false);
            return;
        }
        const startTime = rawStart + ':00Z'; // "2026-03-30T18:05:00Z" = UTC
        const endTime   = rawEnd   + ':00Z';

        // Validation (comparaison de chaînes ISO, possible car même format)
        if (startTime >= endTime) {
            showAlert('La date de fin doit être après la date de début', 'warning');
            showLoader(false);
            return;
        }
       
        const response = await authenticatedFetch('/api/online_exams', {
            method: 'POST',
            body: JSON.stringify({
                subject_id: parseInt(document.getElementById('exam-subject').value),
                title: document.getElementById('exam-title').value,
                instructions: document.getElementById('exam-instructions').value,
                // SUPPRIMÉ : duration_minutes (auto backend)
                start_time: startTime,  // UTC
                end_time: endTime,      // UTC
                max_tab_switches: parseInt(document.getElementById('exam-max-switches').value),
                max_no_face_count: parseInt(document.getElementById('exam-max-no-face').value),
                ban_on_devtools: document.getElementById('exam-ban-devtools').checked,
                enable_copy_paste: document.getElementById('exam-copy-paste').checked,
                enable_right_click: document.getElementById('exam-right-click').checked
            })
        });
       
        const data = await response.json();
       
        if (data.success) {
            showAlert(`L'examen a été créé avec succès. Durée : ${data.exam.duration_minutes} min. Activez-le pour le rendre accessible aux étudiants.`, 'success');
            closeModal();
            loadOnlineExams();
        } else {
            showAlert(data.error || 'Impossible de créer l\'examen. Vérifiez les dates et réessayez.', 'error');
        }
    } catch (error) {
        // authenticatedFetch gère déjà
    } finally {
        showLoader(false);
    }
}

async function closeExam(examId) {
    if (!confirm('Fermer cet examen? Les étudiants ne pourront plus composer.')) {
        return;
    }
    
    showLoader(true);
    
    try {
        const response = await authenticatedFetch(`/api/online_exams/${examId}/close`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert("L'examen a été clôturé. Les étudiants ne peuvent plus soumettre.", 'success');
            loadOnlineExams();
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function viewOnlineExamDetails(examId) {
    showLoader(true);
    
    try {
        const response = await authenticatedFetch('/api/online_exams');
        const exams = await response.json();
        const exam = exams.find(e => e.id === examId);
        
        if (!exam) {
            showAlert('Examen introuvable. Veuillez actualiser la liste.', 'error');
            showLoader(false);
            return;
        }
        
        const statusClass = {
            'draft': 'secondary',
            'scheduled': 'warning',
            'active': 'success',
            'closed': 'danger'
        }[exam.status] || 'secondary';
        
        const statusLabel = {
            'draft': 'Brouillon',
            'scheduled': 'Planifié',
            'active': 'En cours',
            'closed': 'Terminé'
        }[exam.status] || exam.status;
        
        const scDetail = {
            'draft':     { color: '#64748b', bg: '#f1f5f9', icon: 'fa-edit' },
            'scheduled': { color: '#d97706', bg: '#fffbeb', icon: 'fa-calendar-alt' },
            'active':    { color: '#059669', bg: '#ecfdf5', icon: 'fa-play-circle' },
            'closed':    { color: '#dc2626', bg: '#fff1f2', icon: 'fa-check-circle' },
        }[exam.status] || { color: '#64748b', bg: '#f1f5f9', icon: 'fa-circle' };

        const fmtFull = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar' };
        const dH = Math.floor(exam.duration_minutes / 60);
        const dM = exam.duration_minutes % 60;
        const durationStr = dH > 0 ? (dM > 0 ? `${dH}h ${dM}min` : `${dH}h`) : `${dM} min`;
        const safeTitle = (exam.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        const modalContent = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;">
                <div style="background:#3b82f6;width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas fa-laptop-code" style="color:white;font-size:17px;"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <h2 style="margin:0;font-size:18px;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${exam.title}</h2>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                        <span style="background:${scDetail.bg};color:${scDetail.color};padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;">
                            <i class="fas ${scDetail.icon}"></i> ${statusLabel}
                        </span>
                        <span style="color:#64748b;font-size:12px;">${exam.subject_title || ''}</span>
                    </div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
                <div style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:10px;padding:14px;">
                    <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Début</div>
                    <div style="font-size:13px;font-weight:600;color:#0f172a;">${fmtDakar(exam.start_time)}</div>
                </div>
                <div style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:10px;padding:14px;">
                    <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Fin</div>
                    <div style="font-size:13px;font-weight:600;color:#0f172a;">${fmtDakar(exam.end_time)}</div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;">
                <div style="background:#eff6ff;border-radius:10px;padding:12px;text-align:center;">
                    <i class="fas fa-clock" style="color:#3b82f6;font-size:18px;display:block;margin-bottom:4px;"></i>
                    <div style="font-size:18px;font-weight:700;color:#0f172a;">${durationStr}</div>
                    <div style="font-size:11px;color:#64748b;">Durée</div>
                </div>
                <div style="background:#f0fdf4;border-radius:10px;padding:12px;text-align:center;">
                    <i class="fas fa-exchange-alt" style="color:#10b981;font-size:18px;display:block;margin-bottom:4px;"></i>
                    <div style="font-size:18px;font-weight:700;color:#0f172a;">${exam.max_tab_switches}</div>
                    <div style="font-size:11px;color:#64748b;">Chgts fenêtre</div>
                </div>
                <div style="background:${exam.attempts_count > 0 ? 'rgba(99,102,241,.08)' : '#f8fafc'};border-radius:10px;padding:12px;text-align:center;">
                    <i class="fas fa-users" style="color:#6366f1;font-size:18px;display:block;margin-bottom:4px;"></i>
                    <div style="font-size:18px;font-weight:700;color:#0f172a;">${exam.attempts_count || 0}</div>
                    <div style="font-size:11px;color:#64748b;">Tentatives</div>
                </div>
            </div>

            <!-- Seuils de bannissement -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:14px;">
                <div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-shield-alt" style="color:#7c3aed;"></i> Seuils de bannissement
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;">
                    <div style="background:white;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-exchange-alt" style="color:#f59e0b;font-size:16px;flex-shrink:0;"></i>
                        <div>
                            <div style="font-size:16px;font-weight:700;color:#0f172a;">${exam.max_tab_switches}</div>
                            <div style="font-size:11px;color:#64748b;">Changements fenêtre max</div>
                        </div>
                    </div>
                    <div style="background:white;border:1px solid ${(exam.max_no_face_count != null && exam.max_no_face_count >= 0) ? '#fca5a5' : '#e2e8f0'};border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-eye-slash" style="color:#ef4444;font-size:16px;flex-shrink:0;"></i>
                        <div>
                            <div style="font-size:16px;font-weight:700;color:#0f172a;">${(exam.max_no_face_count != null && exam.max_no_face_count >= 0) ? exam.max_no_face_count : '∞'}</div>
                            <div style="font-size:11px;color:#64748b;">Visage absent max${exam.max_no_face_count === -1 ? ' (désactivé)' : ''}</div>
                        </div>
                    </div>
                    <div style="background:white;border:1px solid ${exam.ban_on_devtools ? '#e9d5ff' : '#e2e8f0'};border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-terminal" style="color:${exam.ban_on_devtools ? '#7c3aed' : '#94a3b8'};font-size:16px;flex-shrink:0;"></i>
                        <div>
                            <div style="font-size:13px;font-weight:700;color:${exam.ban_on_devtools ? '#7c3aed' : '#94a3b8'};">${exam.ban_on_devtools ? 'Ban immédiat' : 'Non actif'}</div>
                            <div style="font-size:11px;color:#64748b;">Outils développeur</div>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
                <span style="background:${exam.enable_copy_paste ? '#f0fdf4' : '#fef2f2'};color:${exam.enable_copy_paste ? '#059669' : '#ef4444'};padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;">
                    <i class="fas ${exam.enable_copy_paste ? 'fa-check' : 'fa-ban'}"></i> Copier/Coller ${exam.enable_copy_paste ? 'autorisé' : 'interdit'}
                </span>
                <span style="background:${exam.enable_right_click ? '#f0fdf4' : '#fef2f2'};color:${exam.enable_right_click ? '#059669' : '#ef4444'};padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;">
                    <i class="fas ${exam.enable_right_click ? 'fa-check' : 'fa-ban'}"></i> Clic droit ${exam.enable_right_click ? 'autorisé' : 'interdit'}
                </span>
                <span style="background:#f8fafc;color:#475569;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;">
                    <i class="fas fa-user"></i> ${exam.creator_name || ''}
                </span>
            </div>

            ${exam.instructions ? `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:14px;">
                <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-file-alt"></i> Instructions
                </div>
                <div style="font-size:13px;color:#0f172a;white-space:pre-wrap;line-height:1.6;">${exam.instructions}</div>
            </div>` : ''}

            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;padding-top:4px;">
                ${exam.status === 'active' ? `
                    <button class="btn" onclick="closeModal(); openProctoringDashboard(${exam.id})" style="background:#7c3aed;color:white;">
                        <i class="fas fa-shield-alt"></i> Surveiller
                    </button>
                    <button class="btn btn-danger" onclick="closeModal(); closeExam(${exam.id})">
                        <i class="fas fa-stop-circle"></i> Clôturer
                    </button>
                ` : ''}
                ${(exam.status === 'scheduled' || exam.status === 'draft') ? `
                    <button class="btn btn-success" onclick="closeModal(); activateExam(${exam.id})">
                        <i class="fas fa-play-circle"></i> Activer
                    </button>
                ` : ''}
                <button class="btn" onclick="closeModal(); deleteOnlineExam(${exam.id}, '${safeTitle}', ${exam.attempts_count || 0})" style="background:rgba(239,68,68,.1);color:#ef4444;">
                    <i class="fas fa-trash-alt"></i> Supprimer
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Fermer
                </button>
            </div>
        `;
        
        showModal(modalContent, '800px');
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ✅ NOUVEAU : Fonction pour activer un examen (appelée par bouton "Activer")
async function activateExam(examId) {
    if (!confirm('Activer cet examen ? Il deviendra accessible aux étudiants immédiatement.')) {
        return;
    }
    
    showLoader(true);
    
    try {
        const response = await authenticatedFetch(`/api/online_exams/${examId}/activate`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Examen activé avec succès !', 'success');
            loadOnlineExams();  // Recharger la liste
        } else {
            showAlert(data.error || 'Impossible d\'activer l\'examen. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// COMPOSITION D'EXAMEN EN LIGNE (ÉTUDIANT)
// ============================================================================

let currentExamAttempt = null;
let examAutoSaveInterval = null;
let visibilityChangeCount = 0;

function showExamNotStartedInfo(startTimeStr, title) {
    const startTime = new Date(startTimeStr);
    const fmtOpts = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar' };
    const startFormatted = startTime.toLocaleString('fr-FR', fmtOpts);

    // Calcul du temps restant avant le début
    const now = new Date();
    const diffMs = startTime - now;
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    let countdownStr = '';
    if (diffH > 0) countdownStr = `dans ${diffH}h${diffM > 0 ? String(diffM).padStart(2,'0') + 'min' : ''}`;
    else if (diffM > 0) countdownStr = `dans ${diffM} minute${diffM > 1 ? 's' : ''}`;
    else countdownStr = 'très prochainement';

    const modalContent = `
        <div style="text-align:center;padding:8px 0 16px;">
            <div style="width:72px;height:72px;background:#fffbeb;border-radius:50%;
                        display:flex;align-items:center;justify-content:center;
                        margin:0 auto 18px;font-size:32px;color:#d97706;border:2px solid #fcd34d;">
                <i class="fas fa-clock"></i>
            </div>
            <h2 style="margin:0 0 8px;font-size:18px;color:#1e293b;">Examen pas encore ouvert</h2>
            <p style="color:#64748b;font-size:13px;margin-bottom:20px;">${title}</p>

            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:16px;margin-bottom:20px;">
                <div style="color:#92400e;font-size:14px;margin-bottom:8px;">
                    <i class="fas fa-calendar-alt" style="margin-right:6px;"></i>
                    <strong>Début de l'examen :</strong>
                </div>
                <div style="color:#d97706;font-size:16px;font-weight:700;">${startFormatted}</div>
                <div style="color:#92400e;font-size:13px;margin-top:8px;opacity:.8;">
                    <i class="fas fa-hourglass-half" style="margin-right:4px;"></i> ${countdownStr}
                </div>
            </div>
            <p style="color:#94a3b8;font-size:12px;margin-bottom:20px;">
                Revenez à l'heure indiquée pour pouvoir composer cet examen.
            </p>
            <button class="btn btn-primary" onclick="closeModal()">
                <i class="fas fa-check"></i> Compris
            </button>
        </div>
    `;
    showModal(modalContent, '480px');
}

function stripBaremeFromContent(content) {
    if (!content) return content;
    // Pattern 1 : ligne de séparateurs suivie de "barème" sur la ligne suivante
    let m = content.search(/\n[═=─]{5,}[^\n]*\n[^\n]*[Bb]ar[eè]me/);
    if (m > 0) return content.substring(0, m).trimEnd();
    // Pattern 2 : "Barème de Notation" comme entête de section
    m = content.search(/\n\s*[Bb]ar[eè]me\s+de\s+[Nn]otation/i);
    if (m > 0) return content.substring(0, m).trimEnd();
    // Pattern 3 : "BARÈME" seul sur sa ligne (tout en majuscules)
    m = content.search(/\nBAR[ÈE]ME\s*\n/);
    if (m > 0) return content.substring(0, m).trimEnd();
    return content;
}

async function startOnlineExam(examId) {
    // Afficher la modal de consentement caméra/micro avant de démarrer
    showProctoringConsentModal(examId);
}

async function _doStartOnlineExam(examId) {
    showLoader(true);

    try {
        const response = await authenticatedFetch(`/api/online_exams/${examId}/start`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.banned) {
            showAlert('Vous avez été exclu de cet examen pour non-respect des règles de surveillance.', 'error');
            showLoader(false);
            return;
        }

        if (data.success) {
            currentExamAttempt = data.attempt;
            showLoader(false);
            // ── Redirection vers la page d'examen surveillée ──
            window.location.href = `/proctor/exam/${data.attempt.id}`;
        } else {
            showAlert(data.error || "Impossible de démarrer l'examen. Il est peut-être clôturé ou votre tentative est déjà soumise.", 'error');
            showLoader(false);
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
        showLoader(false);
    }
}

function openProctoringDashboard(examId) {
    // Ouvrir le dashboard de surveillance dans un nouvel onglet
    window.open(`/proctor/monitor/${examId}`, `proctor-${examId}`,
        'width=1400,height=900,menubar=no,toolbar=no,location=no,status=no');
}

function showProctoringConsentModal(examId) {
    const modalContent = `
        <div style="text-align:center; padding: 8px 0 16px;">
            <div style="width:72px;height:72px;background:rgba(37,99,235,.1);border-radius:50%;
                        display:flex;align-items:center;justify-content:center;
                        margin:0 auto 20px;font-size:32px;color:#2563eb;">
                <i class="fas fa-shield-alt"></i>
            </div>
            <h2 style="margin:0 0 10px;font-size:20px;color:#1e293b;">
                Examen Surveillé par Caméra
            </h2>
            <p style="color:#64748b;font-size:14px;line-height:1.6;margin-bottom:24px;">
                Cet examen est surveillé en temps réel via votre webcam et microphone.<br>
                <strong>Vous devez autoriser l'accès à la caméra et au microphone</strong>
                pour pouvoir composer.
            </p>

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;
                        padding:16px;text-align:left;margin-bottom:24px;">
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
                        <i class="fas fa-video" style="color:#2563eb;width:18px;text-align:center"></i>
                        <span>Votre caméra sera activée pendant toute la durée de l'examen</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
                        <i class="fas fa-microphone" style="color:#2563eb;width:18px;text-align:center"></i>
                        <span>Votre microphone sera activé pour la détection audio</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
                        <i class="fas fa-user-check" style="color:#10b981;width:18px;text-align:center"></i>
                        <span>Détection faciale automatique (votre visage doit être visible)</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
                        <i class="fas fa-expand" style="color:#f59e0b;width:18px;text-align:center"></i>
                        <span>Mode plein écran obligatoire (tout changement sera signalé)</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
                        <i class="fas fa-ban" style="color:#ef4444;width:18px;text-align:center"></i>
                        <span>Tentatives de tricherie → bannissement immédiat</span>
                    </div>
                </div>
            </div>

            <div style="display:flex;gap:10px;justify-content:center;">
                <button class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Annuler
                </button>
                <button class="btn btn-primary" onclick="closeModal(); _doStartOnlineExam(${examId})">
                    <i class="fas fa-check"></i> J'accepte — Démarrer l'examen
                </button>
            </div>
        </div>
    `;
    showModal(modalContent, '560px');
}

async function showExamCompositionInterface(examId, attempt) {
    // Récupérer les détails complets de l'examen (avec contenu du sujet)
    const examResponse = await authenticatedFetch(`/api/online_exams/${examId}/details`);
    const exam = await examResponse.json();

    if (!exam || exam.error) {
        showAlert('Examen introuvable. Veuillez actualiser la liste.', 'error');
        return;
    }
    
    // Calculer le temps restant
    const startTime = new Date(attempt.started_at);
    const endTime = new Date(startTime.getTime() + exam.duration_minutes * 60000);
    const now = new Date();
    const remainingMs = endTime - now;
    const remainingMinutes = Math.floor(remainingMs / 60000);
    
    if (remainingMinutes <= 0) {
        showAlert('Le temps est écoulé pour cet examen', 'warning');
        await autoSubmitExam(attempt.id);
        return;
    }
    
    const html = `
        <div class="exam-composition-container" style="max-width: 1000px; margin: 0 auto;">
            <div class="exam-header" style="background: #3b82f6; color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
                <h2 style="margin: 0 0 12px 0;"><i class="fas fa-edit"></i> ${exam.title}</h2>
                <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
                    <div>
                        <strong>Étudiant:</strong> ${currentUser.full_name}
                    </div>
                    <div id="exam-timer" style="font-size: 20px; font-weight: bold;">
                        <i class="fas fa-clock"></i> <span id="timer-display">${remainingMinutes}:00</span>
                    </div>
                    <div id="warnings-display" style="color: #fef3c7;">
                        <i class="fas fa-exclamation-triangle"></i> Avertissements: <span id="warnings-count">0</span>/${exam.max_tab_switches}
                    </div>
                </div>
            </div>
            
            ${exam.instructions ? `
                <div class="alert alert-info" style="margin-bottom: 24px;">
                    <i class="fas fa-info-circle"></i>
                    <div>
                        <strong>Instructions:</strong><br>
                        ${exam.instructions}
                    </div>
                </div>
            ` : ''}
            
            <div class="alert alert-warning" style="margin-bottom: 24px;">
                <i class="fas fa-shield-alt"></i>
                <div>
                    <strong>Règles de Surveillance:</strong>
                    <ul style="margin: 8px 0 0 20px;">
                        <li>Ne changez PAS de fenêtre ou d'onglet (max ${exam.max_tab_switches} fois)</li>
                        <li>Restez en mode plein écran</li>
                        ${!exam.enable_copy_paste ? '<li>Le copier/coller est désactivé</li>' : ''}
                        ${!exam.enable_right_click ? '<li>Le clic droit est désactivé</li>' : ''}
                        <li>Toute tentative de tricherie entraînera un bannissement immédiat</li>
                    </ul>
                </div>
            </div>
            
            ${exam.subject_content && exam.subject_content.content ? `
            <div class="card" style="margin-bottom: 24px; border-left: 4px solid #3b82f6;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
                    <h3 style="margin:0;"><i class="fas fa-file-alt" style="color:#3b82f6;"></i> Sujet de l'Examen</h3>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <span style="background:#eff6ff;color:#3b82f6;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;">
                            <i class="fas fa-graduation-cap"></i> ${exam.subject_content.title}
                        </span>
                        <button onclick="document.getElementById('subject-content-body').style.display = document.getElementById('subject-content-body').style.display === 'none' ? 'block' : 'none'" style="background:none;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;color:#64748b;">
                            <i class="fas fa-compress-alt"></i> Réduire/Agrandir
                        </button>
                    </div>
                </div>
                <div id="subject-content-body" style="padding:16px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.8;white-space:pre-wrap;font-family:monospace;border:1px solid #e2e8f0;max-height:500px;overflow-y:auto;">${stripBaremeFromContent(exam.subject_content.content)}</div>
            </div>
            ` : ''}

            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-pen"></i> Votre Copie</h3>
                </div>

                <div class="form-group">
                    <label><i class="fas fa-user"></i> Nom et Prénom (pré-rempli)</label>
                    <input type="text" value="${currentUser.full_name}" disabled style="background: #f1f5f9;">
                </div>

                <div class="form-group">
                    <label><i class="fas fa-edit"></i> Vos Réponses *</label>
                    <textarea id="exam-answers" rows="20" placeholder="Rédigez vos réponses ici en indiquant clairement le numéro de chaque question..." style="font-family: monospace; font-size: 14px;">${attempt.answers !== '{}' ? JSON.parse(attempt.answers).content || '' : ''}</textarea>
                    <small class="form-help">
                        <i class="fas fa-save"></i> Sauvegarde automatique toutes les 30 secondes
                    </small>
                </div>

                <div style="display: flex; gap: 12px; justify-content: space-between; margin-top: 24px;">
                    <button class="btn btn-success" onclick="submitExamNow()">
                        <i class="fas fa-paper-plane"></i> Soumettre l'Examen
                    </button>
                    <button class="btn btn-secondary" onclick="saveExamDraft()">
                        <i class="fas fa-save"></i> Sauvegarder Brouillon
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('main-content').innerHTML = html;
    
    // Initialiser la surveillance anti-triche
    initExamSurveillance(exam, attempt);
    
    // Timer
    startExamTimer(endTime, attempt.id);
    
    // Auto-save
    examAutoSaveInterval = setInterval(() => saveExamAnswers(attempt.id), 30000);
}

function initExamSurveillance(exam, attempt) {
    // Plein écran
    document.documentElement.requestFullscreen().catch(err => {
        console.warn('Plein écran non supporté:', err);
    });
    
    // Désactiver clic droit
    if (!exam.enable_right_click) {
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            logExamActivity(attempt.id, 'right_click_attempt');
        });
    }
    
    // Désactiver copier/coller
    if (!exam.enable_copy_paste) {
        const textarea = document.getElementById('exam-answers');
        textarea.addEventListener('copy', function(e) {
            e.preventDefault();
            logExamActivity(attempt.id, 'copy_attempt');
            showAlert('Le copier est désactivé', 'warning');
        });
        textarea.addEventListener('paste', function(e) {
            e.preventDefault();
            logExamActivity(attempt.id, 'paste_attempt');
            showAlert('Le coller est désactivé', 'warning');
        });
    }
    
    // Détecter changement de fenêtre/onglet
    document.addEventListener('visibilitychange', async function() {
        if (document.hidden) {
            visibilityChangeCount++;
            
            const response = await logExamActivity(attempt.id, 'tab_switch', {
                count: visibilityChangeCount
            });
            
            if (response && response.banned) {
                alert('VOUS AVEZ ÉTÉ BANNI DE CET EXAMEN POUR TRICHERIE');
                window.location.reload();
            } else if (response) {
                document.getElementById('warnings-count').textContent = response.warnings_count;
                
                if (response.warnings_count >= exam.max_tab_switches - 1) {
                    showAlert(`ATTENTION: Dernier avertissement! Prochain changement = bannissement`, 'error');
                } else {
                    showAlert(`Avertissement ${response.warnings_count}/${exam.max_tab_switches}: Restez sur cette page!`, 'warning');
                }
            }
        }
    });
    
    // Détecter sortie plein écran
    document.addEventListener('fullscreenchange', function() {
        if (!document.fullscreenElement) {
            showAlert('Veuillez rester en mode plein écran', 'warning');
            document.documentElement.requestFullscreen();
        }
    });
    
    // Bloquer F12 (console développeur)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
            e.preventDefault();
            logExamActivity(attempt.id, 'devtools_attempt');
        }
    });
}

function startExamTimer(endTime, attemptId) {
    const timerDisplay = document.getElementById('timer-display');
    
    const updateTimer = () => {
        const now = new Date();
        const remainingMs = endTime - now;
        
        if (remainingMs <= 0) {
            timerDisplay.textContent = '00:00';
            timerDisplay.style.color = '#ef4444';
            clearInterval(timerInterval);
            clearInterval(examAutoSaveInterval);
            alert('TEMPS ÉCOULÉ! Votre examen va être soumis automatiquement.');
            autoSubmitExam(attemptId);
        } else {
            const minutes = Math.floor(remainingMs / 60000);
            const seconds = Math.floor((remainingMs % 60000) / 1000);
            timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Changer couleur si < 5 min
            if (minutes < 5) {
                timerDisplay.style.color = '#ef4444';
            }
        }
    };
    
    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
}

async function saveExamAnswers(attemptId, showMessage = false) {
    try {
        const answers = document.getElementById('exam-answers').value;
        
        const response = await authenticatedFetch(`/api/exam_attempts/${attemptId}/save`, {
            method: 'POST',
            body: JSON.stringify({
                answers: JSON.stringify({ content: answers })
            })
        });
        
        const data = await response.json();
        
        if (data.success && showMessage) {
            showAlert('Réponses sauvegardées', 'success');
        }
    } catch (error) {
        console.error('Erreur sauvegarde:', error);
    }
}

async function saveExamDraft() {
    if (!currentExamAttempt) return;
    await saveExamAnswers(currentExamAttempt.id, true);
}

async function logExamActivity(attemptId, eventType, eventData = {}) {
    try {
        const response = await authenticatedFetch(`/api/exam_attempts/${attemptId}/log_activity`, {
            method: 'POST',
            body: JSON.stringify({
                event_type: eventType,
                event_data: JSON.stringify(eventData)
            })
        });
        
        return await response.json();
    } catch (error) {
        console.error('Erreur log activity:', error);
        return null;
    }
}

async function submitExamNow() {
    if (!currentExamAttempt) return;
    
    if (!confirm('Êtes-vous sûr de vouloir soumettre votre examen? Cette action est irréversible.')) {
        return;
    }
    
    showLoader(true);
    
    try {
        const answers = document.getElementById('exam-answers').value;
        
        const response = await authenticatedFetch(`/api/exam_attempts/${currentExamAttempt.id}/submit`, {
            method: 'POST',
            body: JSON.stringify({
                answers: JSON.stringify({ content: answers })
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            clearInterval(examAutoSaveInterval);
            showAlert('Votre examen a été soumis avec succès. Votre note sera disponible après correction.', 'success');
            setTimeout(() => {
                loadOnlineExams();
            }, 2000);
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function autoSubmitExam(attemptId) {
    showLoader(true);
    
    try {
        const answers = document.getElementById('exam-answers')?.value || '';
        
        await authenticatedFetch(`/api/exam_attempts/${attemptId}/submit`, {
            method: 'POST',
            body: JSON.stringify({
                answers: JSON.stringify({ content: answers })
            })
        });
        
        clearInterval(examAutoSaveInterval);
        showAlert('Examen soumis automatiquement (temps écoulé)', 'info');
        setTimeout(() => {
            loadOnlineExams();
        }, 3000);
    } catch (error) {
        console.error('Erreur auto-submit:', error);
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// RELEVÉS DE NOTES
// ============================================================================

async function loadTranscripts() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    
    try {
        if (currentUser.role === 'student') {
            await loadStudentTranscripts();
        } else {
            await loadAllTranscripts();
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function loadStudentTranscripts() {
    const response = await authenticatedFetch('/api/student/transcripts');
    const transcripts = await response.json();
    
    let html = `
        <div class="page-header">
            <h2><i class="fas fa-file-alt"></i> Mes Relevés de Notes</h2>
            <p>Consultez et téléchargez vos relevés de notes officiels</p>
        </div>
    `;
    
    if (transcripts.length === 0) {
        html += `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                <div>
                    <strong>Information:</strong> Les relevés de notes sont générés par vos professeurs ou l'administration.
                    Ils apparaîtront ici dès qu'ils seront disponibles.
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-history"></i> Historique</h3>
                </div>
                <p style="padding: 20px; color: #94a3b8; text-align: center;">
                    <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 12px;"></i><br>
                    Aucun relevé disponible pour le moment
                </p>
            </div>
        `;
    } else {
        html += `
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-history"></i> Mes Relevés (${transcripts.length})</h3>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th><i class="fas fa-graduation-cap"></i> Formation</th>
                            <th><i class="fas fa-calendar"></i> Semestre</th>
                            <th><i class="fas fa-star"></i> Moyenne</th>
                            <th><i class="fas fa-award"></i> Crédits</th>
                            <th><i class="fas fa-check-circle"></i> Statut</th>
                            <th><i class="fas fa-clock"></i> Date</th>
                            <th><i class="fas fa-cog"></i> Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        transcripts.forEach(transcript => {
            const statusClass = transcript.validated ? 'success' : 'danger';
            const statusLabel = transcript.validated ? '✅ VALIDÉ' : '❌ NON VALIDÉ';
            const gpaColor = transcript.gpa >= 10 ? '#10b981' : '#ef4444';
            
            html += `
                <tr>
                    <td>${transcript.formation_name}</td>
                    <td><strong>Semestre ${transcript.semester_number}</strong><br><small>${transcript.semester_name}</small></td>
                    <td><strong style="color: ${gpaColor}; font-size: 18px;">${transcript.gpa}/20</strong></td>
                    <td>${transcript.obtained_credits}/${transcript.total_credits}</td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${new Date(transcript.generated_at).toLocaleDateString('fr-FR')}</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="downloadTranscriptPDF(${transcript.id})" title="Télécharger le relevé">
                            <i class="fas fa-download"></i> Télécharger PDF
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
    }
    
    document.getElementById('main-content').innerHTML = html;
}

async function loadAllTranscripts() {
    // Récupérer les relevés existants
    const transcriptsResponse = await authenticatedFetch('/api/transcripts');
    const existingTranscripts = await transcriptsResponse.json();
    
    const formationsResponse = await authenticatedFetch('/api/formations');
    const formations = await formationsResponse.json();
    
    const usersResponse = await authenticatedFetch('/api/students/list'); 
    const students = await usersResponse.json();  
    
    let studentsOptions = '<option value="">-- Sélectionner un étudiant --</option>';
    students.forEach(s => {
        studentsOptions += `<option value="${s.id}">${s.full_name}</option>`;
    });
    
    let semestersOptions = '<option value="">-- D\'abord sélectionner un étudiant --</option>';
    
    let html = `
        <div class="page-header">
            <h2><i class="fas fa-file-alt"></i> Relevés de Notes</h2>
            <p>Générer et consulter les relevés de notes des étudiants</p>
        </div>
        
        <!-- SECTION : Relevés Existants -->
        <div class="card" style="margin-bottom: 24px;">
            <div class="card-header">
                <h3><i class="fas fa-list"></i> Relevés Générés (${existingTranscripts.length})</h3>
            </div>
    `;
    
    if (existingTranscripts.length === 0) {
        html += `
            <div style="padding: 20px; text-align: center; color: #94a3b8;">
                <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 12px;"></i>
                <p>Aucun relevé généré pour le moment</p>
            </div>
        `;
    } else {
        html += `
            <table>
                <thead>
                    <tr>
                        <th><i class="fas fa-user"></i> Étudiant</th>
                        <th><i class="fas fa-graduation-cap"></i> Formation</th>
                        <th><i class="fas fa-calendar"></i> Semestre</th>
                        <th><i class="fas fa-star"></i> Moyenne</th>
                        <th><i class="fas fa-award"></i> Crédits</th>
                        <th><i class="fas fa-check-circle"></i> Statut</th>
                        <th><i class="fas fa-clock"></i> Généré le</th>
                        <th><i class="fas fa-cog"></i> Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        existingTranscripts.forEach(transcript => {
            const statusClass = transcript.validated ? 'success' : 'danger';
            const statusLabel = transcript.validated ? '✅ VALIDÉ' : '❌ NON VALIDÉ';
            const gpaColor = transcript.gpa >= 10 ? '#10b981' : '#ef4444';
            
            html += `
                <tr>
                    <td>
                        <strong>${transcript.student_name}</strong>
                        <br><small style="color: #64748b;">${transcript.student_email}</small>
                    </td>
                    <td>${transcript.formation_name}</td>
                    <td>${transcript.semester_name}</td>
                    <td><strong style="color: ${gpaColor}; font-size: 16px;">${transcript.gpa}/20</strong></td>
                    <td>${transcript.obtained_credits}/${transcript.total_credits}</td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${new Date(transcript.generated_at).toLocaleDateString('fr-FR')}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="downloadTranscriptPDF(${transcript.id})" title="Télécharger PDF">
                            <i class="fas fa-file-pdf"></i> PDF
                        </button>
                        <button class="btn btn-sm btn-info" onclick="viewTranscriptDetails(${transcript.id})" title="Voir détails">
                            <i class="fas fa-eye"></i> Détails
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
    }
    
    html += `</div>`;
    
    // SECTION : Générer Nouveau Relevé
    html += `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-plus"></i> Générer un Nouveau Relevé</h3>
            </div>
            
            <form id="generate-transcript-form">
                <div class="form-group">
                    <label><i class="fas fa-user"></i> Étudiant *</label>
                    <select id="transcript-student" required onchange="loadSemestersForStudent(this.value)">
                        ${studentsOptions}
                    </select>
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-calendar"></i> Semestre *</label>
                    <select id="transcript-semester" required disabled>
                        ${semestersOptions}
                    </select>
                </div>
                
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-file-pdf"></i> Générer le Relevé
                </button>
            </form>
        </div>
    `;
    
    document.getElementById('main-content').innerHTML = html;
    
    document.getElementById('generate-transcript-form').addEventListener('submit', handleGenerateTranscript);
}

async function loadSemestersForStudent(studentId) {
    if (!studentId) return;
    
    showLoader(true);
    
    try {
        // Récupérer toutes les formations/semestres
        const formationsResponse = await authenticatedFetch('/api/formations');
        const formations = await formationsResponse.json();
        
        let semestersOptions = '<option value="">-- Sélectionner un semestre --</option>';
        
        for (const formation of formations) {
            const semestersResponse = await authenticatedFetch(`/api/formations/${formation.id}/semesters`);
            const semesters = await semestersResponse.json();
            
            if (semesters.length > 0) {
                semestersOptions += `<optgroup label="${formation.name}">`;
                semesters.forEach(s => {
                    semestersOptions += `<option value="${s.id}">${s.name}</option>`;
                });
                semestersOptions += `</optgroup>`;
            }
        }
        
        const semesterSelect = document.getElementById('transcript-semester');
        semesterSelect.innerHTML = semestersOptions;
        semesterSelect.disabled = false;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function handleGenerateTranscript(e) {
    e.preventDefault();
    showLoader(true);
    
    try {
        const studentId = document.getElementById('transcript-student').value;
        const semesterId = document.getElementById('transcript-semester').value;
        
        const response = await authenticatedFetch(`/api/transcripts/generate/${studentId}/${semesterId}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Relevé généré avec succès!', 'success');
            
            // Télécharger le PDF
            const pdfResponse = await fetch(`/api/transcripts/${data.transcript.id}/pdf`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (pdfResponse.ok) {
                const blob = await pdfResponse.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `releve_notes_${data.transcript.student_name}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}
// ============================================================================
// CORRECTION D'EXAMENS EN LIGNE
// ============================================================================

async function loadExamCorrections() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    
    try {
        // Récupérer les examens du professeur
        const examsResponse = await authenticatedFetch('/api/online_exams');
        const exams = await examsResponse.json();
        
        // Filtrer les examens terminés ou actifs
        const relevantExams = exams.filter(e => e.status === 'active' || e.status === 'closed');
        
        if (relevantExams.length === 0) {
            document.getElementById('main-content').innerHTML = `
                <div class="page-header">
                    <h2><i class="fas fa-check-circle"></i> Corrections d'Examens en Ligne</h2>
                </div>
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    <div>Aucun examen à corriger pour le moment</div>
                </div>
            `;
            showLoader(false);
            return;
        }
        
        let html = `
            <div class="page-header">
                <h2><i class="fas fa-check-circle"></i> Corrections d'Examens en Ligne</h2>
                <p>Corrigez automatiquement les examens soumis avec l'IA</p>
            </div>
        `;
        
        for (const exam of relevantExams) {
            // Récupérer les tentatives de cet examen
            const attemptsResponse = await authenticatedFetch(`/api/online_exams/${exam.id}/attempts`);
            const attempts = await attemptsResponse.json();
            
            // Filtrer celles qui nécessitent une correction
            const needsCorrection = attempts.filter(a => a.needs_correction);
            const corrected = attempts.filter(a => a.score !== null);
            
            if (attempts.length === 0) continue;
            
            html += `
                <div class="card" style="margin-bottom: 24px;">
                    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3><i class="fas fa-laptop-code"></i> ${exam.title}</h3>
                            <small style="color: #64748b;">
                                ${attempts.length} tentative(s) |
                                ${needsCorrection.length} à corriger |
                                ${corrected.length} corrigée(s)
                            </small>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            ${exam.status === 'active' ? `
                                <button class="btn btn-sm" onclick="openProctoringDashboard(${exam.id})"
                                    style="background:#7c3aed;color:white;">
                                    <i class="fas fa-shield-alt"></i> Surveiller
                                </button>
                            ` : ''}
                            ${needsCorrection.length > 0 ? `
                                <button class="btn btn-success" onclick="correctAllExamAttempts(${exam.id})">
                                    <i class="fas fa-magic"></i> Tout Corriger avec IA
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th><i class="fas fa-user"></i> Étudiant</th>
                                <th><i class="fas fa-calendar"></i> Soumis le</th>
                                <th><i class="fas fa-exclamation-triangle"></i> Incidents</th>
                                <th><i class="fas fa-star"></i> Note</th>
                                <th><i class="fas fa-cog"></i> Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            attempts.forEach(attempt => {
                const statusBadge = {
                    'in_progress': '<span class="status-badge warning">En cours</span>',
                    'submitted': '<span class="status-badge success">Soumis</span>',
                    'auto_submitted': '<span class="status-badge info">Auto-soumis</span>',
                    'banned': '<span class="status-badge danger">Banni</span>'
                }[attempt.status] || attempt.status;
                
                const incidentsBadge = attempt.has_incidents ? 
                    `<span style="color: #ef4444;"><i class="fas fa-exclamation-circle"></i> ${attempt.warnings_count}</span>` : 
                    '<span style="color: #10b981;"><i class="fas fa-check"></i> Aucun</span>';
                
                const scoreDisplay = attempt.score !== null ? 
                    `<strong style="color: ${attempt.score >= 10 ? '#10b981' : '#ef4444'}; font-size: 18px;">${attempt.score}/20</strong>` : 
                    '<span style="color: #94a3b8;">Non corrigé</span>';
                
                html += `
                    <tr>
                        <td>${attempt.student_name}</td>
                        <td>${attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString('fr-FR') : 'N/A'}</td>
                        <td>${incidentsBadge}</td>
                        <td>${scoreDisplay}</td>
                        <td>
                            ${attempt.status === 'banned' ? 
                                '<span style="color: #ef4444;">Banni</span>' : 
                                attempt.needs_correction ? `
                                    <button class="btn btn-sm btn-primary" onclick="correctSingleAttempt(${attempt.id})">
                                        <i class="fas fa-magic"></i> Corriger
                                    </button>
                                ` : `
                                    <button class="btn btn-sm btn-info" onclick="viewAttemptDetails(${attempt.id})">
                                        <i class="fas fa-eye"></i> Voir
                                    </button>
                                `
                            }
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        document.getElementById('main-content').innerHTML = html;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function correctSingleAttempt(attemptId) {
    if (!confirm('Lancer la correction automatique avec IA pour cette tentative ?')) {
        return;
    }
    
    showLoader(true);
    
    try {
        const response = await authenticatedFetch(`/api/exam_attempts/${attemptId}/correct`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert(`Correction terminée avec succès ! Note attribuée : ${data.attempt.score}/20.`, 'success');
            loadExamCorrections(); // Recharger
        } else {
            showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function correctAllExamAttempts(examId) {
    if (!confirm('Corriger automatiquement TOUTES les tentatives soumises de cet examen avec l\'IA ?')) {
        return;
    }
    
    showLoader(true);
    showAlert('Correction en cours... Veuillez patienter.', 'info');
    
    try {
        // Récupérer les tentatives
        const attemptsResponse = await authenticatedFetch(`/api/online_exams/${examId}/attempts`);
        const attempts = await attemptsResponse.json();
        
        const needsCorrection = attempts.filter(a => a.needs_correction);
        
        let corrected = 0;
        let errors = 0;
        
        for (const attempt of needsCorrection) {
            try {
                const response = await authenticatedFetch(`/api/exam_attempts/${attempt.id}/correct`, {
                    method: 'POST'
                });
                
                const data = await response.json();
                
                if (data.success) {
                    corrected++;
                } else {
                    errors++;
                }
            } catch (error) {
                errors++;
            }
        }
        
        showAlert(`Correction terminée! ${corrected} réussie(s), ${errors} erreur(s)`, 'success');
        loadExamCorrections();
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function viewAttemptDetails(attemptId) {
    showLoader(true);
    
    try {
        // Récupérer les détails de la tentative en récupérant l'examen et ses tentatives
        const examsResponse = await authenticatedFetch('/api/online_exams');
        const exams = await examsResponse.json();
        
        let attempt = null;
        for (const exam of exams) {
            const attemptsResponse = await authenticatedFetch(`/api/online_exams/${exam.id}/attempts`);
            const attempts = await attemptsResponse.json();
            attempt = attempts.find(a => a.id === attemptId);
            if (attempt) break;
        }
        
        if (!attempt) {
            showAlert('Tentative introuvable. Veuillez actualiser la liste.', 'error');
            showLoader(false);
            return;
        }
        
        // Parser les réponses
        let answers = '';
        try {
            const answersData = JSON.parse(attempt.answers);
            answers = answersData.content || attempt.answers;
        } catch {
            answers = attempt.answers || 'Aucune réponse';
        }
        
        const modalContent = `
            <h2><i class="fas fa-file-alt"></i> Détails de la Tentative</h2>
            
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-info-circle"></i> Informations</h4>
                </div>
                <div style="padding: 15px;">
                    <p><strong>Étudiant:</strong> ${attempt.student_name}</p>
                    <p><strong>Examen:</strong> ${attempt.exam_title}</p>
                    <p><strong>Démarré le:</strong> ${new Date(attempt.started_at).toLocaleString('fr-FR')}</p>
                    <p><strong>Soumis le:</strong> ${attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString('fr-FR') : 'N/A'}</p>
                    <p><strong>Statut:</strong> ${attempt.status}</p>
                    <p><strong>Changements de fenêtre:</strong> ${attempt.tab_switches}</p>
                    <p><strong>Avertissements:</strong> ${attempt.warnings_count}</p>
                </div>
            </div>
            
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-pen"></i> Réponses de l'Étudiant</h4>
                </div>
                <div style="padding: 15px;">
                    <div style="background: #f8fafc; padding: 12px; border-radius: 6px; max-height: 300px; overflow-y: auto; white-space: pre-wrap;">
${answers}
                    </div>
                </div>
            </div>
            
            ${attempt.score !== null ? `
                <div class="card" style="margin-bottom: 20px;">
                    <div class="card-header">
                        <h4><i class="fas fa-star"></i> Résultat</h4>
                    </div>
                    <div style="padding: 15px;">
                        <p><strong>Note:</strong> <span style="font-size: 24px; color: ${attempt.score >= 10 ? '#10b981' : '#ef4444'}; font-weight: bold;">${attempt.score}/20</span></p>
                        <p><strong>Corrigé par:</strong> ${attempt.corrector_name || 'Système'}</p>
                        <p><strong>Corrigé le:</strong> ${new Date(attempt.corrected_at).toLocaleString('fr-FR')}</p>
                    </div>
                </div>
                
                <div class="card" style="margin-bottom: 20px;">
                    <div class="card-header">
                        <h4><i class="fas fa-comment"></i> Feedback</h4>
                    </div>
                    <div style="padding: 15px;">
                        <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; max-height: 300px; overflow-y: auto; white-space: pre-wrap;">
${attempt.feedback}
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <button class="btn btn-secondary" onclick="closeModal()">
                <i class="fas fa-times"></i> Fermer
            </button>
        `;
        
        showModal(modalContent, '900px');
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// INCIDENTS ET LOGS
// ============================================================================

async function viewExamIncidents(examId) {
    showLoader(true);
    
    try {
        const response = await authenticatedFetch(`/api/online_exams/${examId}/incidents`);
        const data = await response.json();
        
        let html = `
            <h2><i class="fas fa-shield-alt"></i> Incidents et Logs de Surveillance</h2>
            
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-chart-bar"></i> Statistiques</h4>
                </div>
                <div style="padding: 15px; display: flex; gap: 24px;">
                    <div>
                        <strong>Total incidents:</strong> ${data.statistics.total_incidents}
                    </div>
                    <div style="color: #ef4444;">
                        <strong>Changements de fenêtre:</strong> ${data.statistics.tab_switches}
                    </div>
                    <div style="color: #dc2626;">
                        <strong>Étudiants bannis:</strong> ${data.statistics.banned_students}
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h4><i class="fas fa-list"></i> Journal des Événements</h4>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th><i class="fas fa-clock"></i> Horodatage</th>
                            <th><i class="fas fa-user"></i> Étudiant</th>
                            <th><i class="fas fa-exclamation-triangle"></i> Type</th>
                            <th><i class="fas fa-info-circle"></i> Détails</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        if (data.incidents.length === 0) {
            html += '<tr><td colspan="4" style="text-align: center; color: #10b981;"><i class="fas fa-check-circle"></i> Aucun incident détecté</td></tr>';
        } else {
            data.incidents.forEach(incident => {
                const eventTypeLabels = {
                    'tab_switch': '🚨 Changement de fenêtre',
                    'copy_attempt': '📋 Tentative de copie',
                    'paste_attempt': '📋 Tentative de collage',
                    'right_click': '🖱️ Clic droit',
                    'devtools_attempt': '🔧 Console développeur'
                };
                
                const eventLabel = eventTypeLabels[incident.event_type] || incident.event_type;
                const severityColor = incident.severity === 'high' ? '#ef4444' : '#f59e0b';
                
                // ✅ CORRECTION : Parser et formater le JSON des détails
                let detailsText = '-';
                if (incident.event_data) {
                    try {
                        const eventData = JSON.parse(incident.event_data);
                        
                        if (incident.event_type === 'tab_switch' && eventData.count) {
                            detailsText = `Tentative n°${eventData.count}`;
                        } else if (eventData.count) {
                            detailsText = `Occurrence n°${eventData.count}`;
                        } else {
                            // Afficher les clés/valeurs de manière lisible
                            const entries = Object.entries(eventData);
                            if (entries.length > 0) {
                                detailsText = entries.map(([key, val]) => `${key}: ${val}`).join(', ');
                            }
                        }
                    } catch (e) {
                        // Si le parsing échoue, afficher tel quel
                        detailsText = incident.event_data;
                    }
                }
                
                html += `
                    <tr>
                        <td>${new Date(incident.timestamp).toLocaleString('fr-FR')}</td>
                        <td>${incident.student_name}</td>
                        <td><span style="color: ${severityColor}; font-weight: bold;">${eventLabel}</span></td>
                        <td><small style="color: #64748b;">${detailsText}</small></td>
                    </tr>
                `;
            });
        }
        
        html += `
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top: 20px;">
                <button class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Fermer
                </button>
            </div>
        `;
        
        showModal(html, '1000px');
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// Modifier viewOnlineExamDetails pour ajouter le bouton incidents
// Remplacez la fonction existante par celle-ci:

async function viewOnlineExamDetails(examId) {
    showLoader(true);
    
    try {
        const response = await authenticatedFetch('/api/online_exams');
        const exams = await response.json();
        const exam = exams.find(e => e.id === examId);
        
        if (!exam) {
            showAlert('Examen introuvable. Veuillez actualiser la liste.', 'error');
            showLoader(false);
            return;
        }
        
        const statusClass = {
            'draft': 'secondary',
            'scheduled': 'warning',
            'active': 'success',
            'closed': 'danger'
        }[exam.status] || 'secondary';
        
        const statusLabel = {
            'draft': 'Brouillon',
            'scheduled': 'Planifié',
            'active': 'En cours',
            'closed': 'Terminé'
        }[exam.status] || exam.status;
        
        const modalContent = `
            <h2><i class="fas fa-laptop-code"></i> Détails de l'Examen</h2>
            
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-info-circle"></i> Informations Générales</h4>
                </div>
                <div style="padding: 15px;">
                    <p><strong><i class="fas fa-heading"></i> Titre:</strong> ${exam.title}</p>
                    <p><strong><i class="fas fa-book"></i> Sujet:</strong> ${exam.subject_title || 'N/A'}</p>
                    <p><strong><i class="fas fa-user"></i> Créé par:</strong> ${exam.creator_name || 'N/A'}</p>
                    <p><strong><i class="fas fa-info-circle"></i> Statut:</strong> 
                        <span class="status-badge ${statusClass}">${statusLabel}</span>
                    </p>
                    <p><strong><i class="fas fa-clock"></i> Durée:</strong> ${exam.duration_minutes} minutes</p>
                    <p><strong><i class="fas fa-calendar"></i> Début:</strong> ${fmtDakar(exam.start_time)}</p>
                    <p><strong><i class="fas fa-calendar"></i> Fin:</strong> ${fmtDakar(exam.end_time)}</p>
                    <p><strong><i class="fas fa-users"></i> Tentatives:</strong> ${exam.attempts_count}</p>
                </div>
            </div>
            
            ${exam.instructions ? `
                <div class="card" style="margin-bottom: 20px;">
                    <div class="card-header">
                        <h4><i class="fas fa-file-alt"></i> Instructions</h4>
                    </div>
                    <div style="padding: 15px;">
                        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; white-space: pre-wrap;">
${exam.instructions}
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-shield-alt"></i> Paramètres de Sécurité</h4>
                </div>
                <div style="padding: 15px;">
                    <p><strong><i class="fas fa-window-restore"></i> Changements de fenêtre autorisés:</strong> ${exam.max_tab_switches}</p>
                    <p><strong><i class="fas fa-copy"></i> Copier/Coller:</strong> ${exam.enable_copy_paste ? '✅ Autorisé' : '❌ Désactivé'}</p>
                    <p><strong><i class="fas fa-mouse-pointer"></i> Clic droit:</strong> ${exam.enable_right_click ? '✅ Autorisé' : '❌ Désactivé'}</p>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap;">
                ${exam.attempts_count > 0 ? `
                    <button class="btn btn-warning" onclick="closeModal(); viewExamIncidents(${exam.id})">
                        <i class="fas fa-exclamation-triangle"></i> Voir les Incidents
                    </button>
                ` : ''}
                ${exam.status === 'scheduled' || exam.status === 'draft' ? `
                    <button class="btn btn-success" onclick="closeModal(); activateExam(${exam.id})">
                        <i class="fas fa-play-circle"></i> Activer l'Examen
                    </button>
                ` : ''}
                ${exam.status === 'active' ? `
                    <button class="btn btn-danger" onclick="closeModal(); closeExam(${exam.id})">
                        <i class="fas fa-stop-circle"></i> Fermer l'Examen
                    </button>
                ` : ''}
                ${exam.status === 'draft' || exam.status === 'scheduled' ? `
                    <button class="btn btn-danger" onclick="closeModal(); deleteOnlineExam(${exam.id})">
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                ` : ''}
                <button class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Fermer
                </button>
            </div>
        `;
        
        showModal(modalContent, '800px');
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// HISTORIQUE DES EXAMENS (ADMIN)
// ============================================================================

async function loadExamsHistory() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    
    try {
        const response = await authenticatedFetch('/api/admin/exams_history');
        const history = await response.json();
        
        let html = `
            <div class="page-header">
                <h2><i class="fas fa-history"></i> Historique des Examens Terminés</h2>
                <p>Consultez les statistiques et logs des examens passés</p>
            </div>
        `;
        
        if (history.length === 0) {
            html += `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    <div>Aucun examen terminé pour le moment</div>
                </div>
            `;
        } else {
            html += `
                <div class="card">
                    <table>
                        <thead>
                            <tr>
                                <th><i class="fas fa-heading"></i> Titre</th>
                                <th><i class="fas fa-user"></i> Créateur</th>
                                <th><i class="fas fa-calendar"></i> Date</th>
                                <th><i class="fas fa-users"></i> Participants</th>
                                <th><i class="fas fa-star"></i> Moyenne</th>
                                <th><i class="fas fa-exclamation-triangle"></i> Incidents</th>
                                <th><i class="fas fa-cog"></i> Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            history.forEach(exam => {
                const averageColor = exam.average_score >= 10 ? '#10b981' : '#ef4444';
                
                html += `
                    <tr>
                        <td><strong>${exam.title}</strong><br><small style="color: #64748b;">${exam.subject_title || 'N/A'}</small></td>
                        <td>${exam.creator_name}</td>
                        <td>${fmtDakarDate(exam.end_time)}</td>
                        <td>
                            ${exam.total_attempts} tentative(s)<br>
                            <small style="color: #64748b;">
                                ${exam.submitted_count} soumis | 
                                ${exam.corrected_count} corrigés
                                ${exam.banned_count > 0 ? ` | <span style="color: #ef4444;">${exam.banned_count} bannis</span>` : ''}
                            </small>
                        </td>
                        <td><strong style="color: ${averageColor}; font-size: 18px;">${exam.average_score}/20</strong></td>
                        <td>
                            ${exam.incidents_count > 0 ? 
                                `<span style="color: #ef4444;"><i class="fas fa-exclamation-circle"></i> ${exam.incidents_count}</span>` : 
                                '<span style="color: #10b981;"><i class="fas fa-check"></i> Aucun</span>'
                            }
                        </td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="viewExamHistoryDetails(${exam.id})">
                                <i class="fas fa-eye"></i> Détails
                            </button>
                            <button class="btn btn-sm btn-warning" onclick="viewExamIncidents(${exam.id})">
                                <i class="fas fa-list"></i> Logs
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        document.getElementById('main-content').innerHTML = html;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function viewExamHistoryDetails(examId) {
    // Réutiliser viewOnlineExamDetails
    await viewOnlineExamDetails(examId);
}

// ============================================================================
// NOTIFICATIONS INCIDENTS PROFESSEUR
// ============================================================================

async function loadProfessorNotifications() {
    try {
        const response = await authenticatedFetch('/api/professor/recent_incidents');
        const data = await response.json();
        
        const notifBadge = document.getElementById('notif-badge');
        if (notifBadge && data.unread_count > 0) {
            notifBadge.textContent = data.unread_count;
            notifBadge.style.display = 'inline-block';
        }
        
        return data.incidents;
    } catch (error) {
        console.error('Erreur chargement notifications:', error);
        return [];
    }
}

async function showProfessorNotifications() {
    showLoader(true);
    
    try {
        const incidents = await loadProfessorNotifications();
        
        let html = `
            <h2><i class="fas fa-bell"></i> Notifications d'Incidents</h2>
            <p style="color: #64748b;">Incidents détectés dans les dernières 24h</p>
        `;
        
        if (incidents.length === 0) {
            html += `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i>
                    <div>Aucun incident détecté récemment. Tout va bien!</div>
                </div>
            `;
        } else {
            html += `
                <div class="card">
                    <table>
                        <thead>
                            <tr>
                                <th><i class="fas fa-clock"></i> Quand</th>
                                <th><i class="fas fa-laptop-code"></i> Examen</th>
                                <th><i class="fas fa-user"></i> Étudiant</th>
                                <th><i class="fas fa-exclamation-triangle"></i> Type</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            incidents.forEach(incident => {
                const eventTypeLabels = {
                    'tab_switch': 'Changement de fenêtre',
                    'copy_attempt': 'Tentative de copie',
                    'paste_attempt': 'Tentative de collage',
                    'right_click': 'Clic droit',
                    'devtools_attempt': '🔧Console développeur'
                };
                
                const eventLabel = eventTypeLabels[incident.event_type] || incident.event_type;
                const severityColor = incident.severity === 'high' ? '#ef4444' : '#f59e0b';
                
                const timeAgo = getTimeAgo(new Date(incident.timestamp));
                
                html += `
                    <tr>
                        <td>${timeAgo}</td>
                        <td><strong>${incident.exam_title}</strong></td>
                        <td>${incident.student_name}</td>
                        <td><span style="color: ${severityColor}; font-weight: bold;">${eventLabel}</span></td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        html += `
            <div style="margin-top: 20px;">
                <button class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Fermer
                </button>
            </div>
        `;
        
        showModal(html, '900px');
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    const intervals = {
        'an': 31536000,
        'mois': 2592000,
        'jour': 86400,
        'heure': 3600,
        'minute': 60
    };
    
    for (const [name, seconds_in_interval] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / seconds_in_interval);
        if (interval >= 1) {
            return `Il y a ${interval} ${name}${interval > 1 ? 's' : ''}`;
        }
    }
    
    return 'À l\'instant';
}

// Charger notifications au démarrage si professeur
if (currentUser && currentUser.role === 'professor') {
    setInterval(loadProfessorNotifications, 60000); // Toutes les minutes
}

async function downloadTranscriptPDF(transcriptId) {
    showLoader(true);
    
    try {
        const response = await fetch(`/api/transcripts/${transcriptId}/pdf`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `releve_notes_${transcriptId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('Relevé téléchargé avec succès!', 'success');
        } else {
            showAlert('Impossible de télécharger le fichier. Veuillez réessayer.', 'error');
        }
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

async function viewTranscriptDetails(transcriptId) {
    showLoader(true);
    
    try {
        // Récupérer les détails du relevé
        const response = await authenticatedFetch('/api/transcripts');
        const transcripts = await response.json();
        const transcript = transcripts.find(t => t.id === transcriptId);
        
        if (!transcript) {
            showAlert('Relevé introuvable. Veuillez actualiser la liste.', 'error');
            showLoader(false);
            return;
        }
        
        const statusClass = transcript.validated ? 'success' : 'danger';
        const statusLabel = transcript.validated ? '✅ VALIDÉ' : '❌ NON VALIDÉ';
        const gpaColor = transcript.gpa >= 10 ? '#10b981' : '#ef4444';
        
        const modalContent = `
            <h2><i class="fas fa-file-alt"></i> Détails du Relevé</h2>
            
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-user"></i> Informations Étudiant</h4>
                </div>
                <div style="padding: 15px;">
                    <p><strong>Nom:</strong> ${transcript.student_name}</p>
                    <p><strong>Email:</strong> ${transcript.student_email}</p>
                    <p><strong>Formation:</strong> ${transcript.formation_name}</p>
                    <p><strong>Semestre:</strong> ${transcript.semester_name}</p>
                </div>
            </div>
            
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-chart-bar"></i> Résultats</h4>
                </div>
                <div style="padding: 15px;">
                    <p><strong>Moyenne Générale:</strong> <span style="font-size: 24px; color: ${gpaColor}; font-weight: bold;">${transcript.gpa}/20</span></p>
                    <p><strong>Crédits:</strong> ${transcript.obtained_credits}/${transcript.total_credits}</p>
                    <p><strong>Décision:</strong> <span class="status-badge ${statusClass}">${statusLabel}</span></p>
                </div>
            </div>
            
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h4><i class="fas fa-info-circle"></i> Informations Génération</h4>
                </div>
                <div style="padding: 15px;">
                    <p><strong>Généré par:</strong> ${transcript.generated_by}</p>
                    <p><strong>Date:</strong> ${new Date(transcript.generated_at).toLocaleString('fr-FR')}</p>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px;">
                <button class="btn btn-success" onclick="closeModal(); downloadTranscriptPDF(${transcript.id})">
                    <i class="fas fa-download"></i> Télécharger PDF
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Fermer
                </button>
            </div>
        `;
        
        showModal(modalContent, '700px');
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// NOUVEAU : CRÉATION ÉTUDIANT SANS EMAIL
// ============================================================================

function showCreateStudentNoEmailModal() {
    const modalContent = `
        <h2><i class="fas fa-user-plus"></i> Créer un Étudiant (Sans Email)</h2>
        <p style="color: #64748b; margin-bottom: 20px;">
            <i class="fas fa-info-circle"></i> Pour les étudiants qui n'ont pas d'adresse email
        </p>
        <form id="create-student-noemail-form">
            <div class="form-group">
                <label><i class="fas fa-user"></i> Nom Complet *</label>
                <input type="text" id="student-fullname" required placeholder="Ex: Jean Dupont">
                <small class="form-help">
                    <i class="fas fa-lightbulb"></i> Vérifiez bien l'orthographe pour éviter les doublons
                </small>
            </div>
            
            <div class="alert alert-warning" style="margin: 20px 0;">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <strong>Important:</strong>
                    <ul style="margin: 10px 0 0 20px;">
                        <li>L'étudiant ne recevra PAS d'email de bienvenue</li>
                        <li>Mot de passe par défaut : <code>Student2025</code></li>
                        <li>Aucun email ne sera envoyé lors de la correction de ses copies</li>
                    </ul>
                </div>
            </div>
            
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-check"></i> Créer l'Étudiant
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> Annuler
                </button>
            </div>
        </form>
    `;
    
    showModal(modalContent, '600px');
    
    document.getElementById('create-student-noemail-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader(true);
        
        try {
            const response = await authenticatedFetch('/api/admin/users/student-no-email', {
                method: 'POST',
                body: JSON.stringify({
                    full_name: document.getElementById('student-fullname').value
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showAlert(`✅ Étudiant créé : ${data.user.full_name}<br>Mot de passe : ${data.temp_password}`, 'success');
                closeModal();
                loadUsers();
            } else {
                showAlert(data.error || 'Une erreur est survenue. Veuillez réessayer.', 'error');
            }
        } catch (error) {
            showAlert(humanError(error), 'error');
        } finally {
            showLoader(false);
        }
    });
}

//============================================================================
// NOUVEAU : AFFICHER LISTE DES COPIES CORRIGÉES (PROFESSEUR)
// ============================================================================

async function loadCorrectedPapersList() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    
    try {
        const endpoint = currentUser.role === 'admin' 
            ? '/api/admin/corrected_papers' 
            : '/api/professor/corrected_papers';
        
        const response = await authenticatedFetch(endpoint);
        const data = await response.json();
        
        let html = `
            <div class="page-header">
                <h2><i class="fas fa-check-circle"></i> Copies Corrigées</h2>
                <p>${data.papers ? data.papers.length : 0} copie(s) corrigée(s)</p>
            </div>
        `;
        
        if (!data.papers || data.papers.length === 0) {
            html += `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    <div>Aucune copie corrigée pour le moment</div>
                </div>
            `;
        } else {
            html += `
                <div class="card">
                    <table>
                        <thead>
                            <tr>
                                <th><i class="fas fa-user"></i> Étudiant</th>
                                <th><i class="fas fa-envelope"></i> Email</th>
                                <th><i class="fas fa-file-alt"></i> Sujet</th>
                                <th><i class="fas fa-star"></i> Note</th>
                                <th><i class="fas fa-calendar"></i> Corrigé le</th>
                                <th><i class="fas fa-envelope-open"></i> Email</th>
                                <th><i class="fas fa-cog"></i> Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            data.papers.forEach(p => {
                const scoreClass = p.score >= 10 ? 'success' : 'danger';
                const emailStatus = p.email_sent 
                    ? '<span style="color: #10b981;"><i class="fas fa-check-circle"></i> Envoyé</span>'
                    : '<span style="color: #94a3b8;"><i class="fas fa-times-circle"></i> Non envoyé</span>';
                
                html += `
                    <tr>
                        <td><strong>${p.student_name}</strong></td>
                        <td>${p.student_email}</td>
                        <td>${p.subject_title}</td>
                        <td><span class="status-badge ${scoreClass}">${p.score}/20</span></td>
                        <td>${new Date(p.corrected_at).toLocaleString('fr-FR')}</td>
                        <td>${emailStatus}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="viewPaperDetail(${p.id})">
                                <i class="fas fa-eye"></i> Détail
                            </button>
                            <button class="btn btn-sm btn-success" onclick="exportPaperPDF(${p.id})">
                                <i class="fas fa-file-pdf"></i> PDF
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        document.getElementById('main-content').innerHTML = html;
    } catch (error) {
        showAlert(humanError(error), 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// CRÉATION DE COURS AVEC SUGGESTIONS IA (VERSION AMÉLIORÉE)
// ============================================================================

async function showCreateCourseWithAISuggestionsModal() {
    showLoader(true);
    
    try {
        // Récupérer les ECs disponibles
        const ecsResponse = await authenticatedFetch('/api/ecs');
        const ecs = await ecsResponse.json();
        
        let ecsOptions = '<option value="">-- Optionnel: Lier à un EC --</option>';
        ecs.forEach(ec => {
            ecsOptions += `<option value="${ec.id}">${ec.ue_code} - ${ec.code}: ${ec.name}</option>`;
        });
        
        const modalContent = `
            <div class="ai-suggestions-modal">
                <div class="modal-header-custom">
                    <h2><i class="fas fa-magic"></i> Générer des Suggestions d'Examen avec IA</h2>
                    <p class="modal-subtitle">
                        <i class="fas fa-lightbulb"></i> Uploadez votre cours, l'IA analysera le contenu et proposera 3 sujets adaptés
                    </p>
                </div>
                
                <!-- STEP 1: Upload Formulaire -->
                <div id="upload-step" class="step-container">
                    <div class="info-box">
                        <div class="info-box-header">
                            <i class="fas fa-book-reader"></i>
                            <strong>Comment ça marche ?</strong>
                        </div>
                        <ol class="info-list">
                            <li><i class="fas fa-upload"></i> Uploadez votre fichier de cours (PDF, DOCX ou TXT)</li>
                            <li><i class="fas fa-robot"></i> L'IA analyse le contenu</li>
                            <li><i class="fas fa-check-circle"></i> Vous obtenez 3 suggestions de sujets personnalisées</li>
                        </ol>
                    </div>

                    <form id="ai-suggestions-form" class="ai-form">
                        <div class="form-group">
                            <label class="form-label">
                                <i class="fas fa-file-upload"></i> Fichier Cours <span class="required">*</span>
                                <span class="label-hint">(PDF, DOCX, TXT - Max 16MB)</span>
                            </label>
                            <div class="file-input-wrapper">
                                <input type="file" id="course-file-input" accept=".pdf,.docx,.doc,.txt" required class="file-input">
                                <div class="file-input-placeholder">
                                    <i class="fas fa-cloud-upload-alt"></i>
                                    <span>Cliquez pour sélectionner ou glissez-déposez</span>
                                </div>
                            </div>
                            <small class="form-help">
                                <i class="fas fa-info-circle"></i> Le système analysera ce document pour générer des suggestions pertinentes
                            </small>
                        </div>

                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-signal"></i> Niveau de Difficulté
                                </label>
                                <select id="ai-difficulty" class="form-select">
                                    <option value="Facile">Facile</option>
                                    <option value="Moyen" selected>Moyen</option>
                                    <option value="Difficile">Difficile</option>
                                    <option value="Très Difficile">Très Difficile</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-user-graduate"></i> Niveau des Étudiants
                                </label>
                                <select id="ai-student-level" class="form-select">
                                    <option value="Licence 1">Licence 1</option>
                                    <option value="Licence 2">Licence 2</option>
                                    <option value="Licence 3" selected>Licence 3</option>
                                    <option value="Master 1">Master 1</option>
                                    <option value="Master 2">Master 2</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label">
                                <i class="fas fa-layer-group"></i> Élément Constitutif (EC)
                                <span class="label-hint">(Optionnel)</span>
                            </label>
                            <select id="ai-ec-id" class="form-select">${ecsOptions}</select>
                        </div>

                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary btn-large">
                                <i class="fas fa-sparkles"></i> Générer les Suggestions
                            </button>
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">
                                <i class="fas fa-times"></i> Annuler
                            </button>
                        </div>
                    </form>
                </div>

                <!-- STEP 2: Résultats -->
                <div id="results-step" class="step-container" style="display: none;">
                    <!-- Résumé du cours -->
                    <div id="course-summary-section" class="summary-card">
                        <div class="summary-header">
                            <i class="fas fa-book-open"></i>
                            <h3>Résumé du Cours Analysé</h3>
                        </div>
                        <p id="course-summary-text" class="summary-text"></p>
                        <div id="main-topics-container" class="topics-container"></div>
                    </div>

                    <!-- En-tête Suggestions -->
                    <div class="suggestions-header">
                        <div class="suggestions-header-content">
                            <i class="fas fa-sparkles"></i>
                            <div>
                                <h3>Suggestions de Sujets d'Examen</h3>
                                <p>Sélectionnez le sujet qui correspond le mieux à vos besoins</p>
                            </div>
                        </div>
                    </div>

                    <!-- Liste des suggestions -->
                    <div id="suggestions-list-container" class="suggestions-grid"></div>

                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="showCreateCourseWithAISuggestionsModal()">
                            <i class="fas fa-arrow-left"></i> Nouvelle Génération
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .ai-suggestions-modal {
                    max-width: 100%;
                }

                .modal-header-custom {
                    text-align: center;
                    margin-bottom: 24px;
                    padding-bottom: 16px;
                    border-bottom: 2px solid var(--border);
                }

                .modal-header-custom h2 {
                    margin: 0 0 8px 0;
                    color: var(--text);
                    font-size: 24px;
                }

                .modal-subtitle {
                    margin: 0;
                    color: var(--text-secondary);
                    font-size: 14px;
                }

                .step-container {
                    animation: fadeIn 0.3s ease-in-out;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .info-box {
                    background: var(--card-bg);
                    border: 2px solid var(--primary);
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 24px;
                }

                .info-box-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--primary);
                    font-size: 16px;
                    margin-bottom: 12px;
                }

                .info-box-header i {
                    font-size: 20px;
                }

                .info-list {
                    margin: 0;
                    padding-left: 20px;
                    list-style: none;
                }

                .info-list li {
                    padding: 8px 0;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: start;
                    gap: 10px;
                }

                .info-list li i {
                    color: var(--primary);
                    margin-top: 2px;
                    min-width: 16px;
                }

                .ai-form {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .form-label {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-weight: 600;
                    color: var(--text);
                    margin-bottom: 8px;
                }

                .form-label i {
                    color: var(--primary);
                }

                .required {
                    color: var(--danger);
                }

                .label-hint {
                    font-weight: normal;
                    color: var(--text-secondary);
                    font-size: 13px;
                }

                .file-input-wrapper {
                    position: relative;
                    border: 2px dashed var(--border);
                    border-radius: 8px;
                    padding: 40px 20px;
                    text-align: center;
                    background: var(--bg);
                    transition: all 0.3s ease;
                    cursor: pointer;
                }

                .file-input-wrapper:hover {
                    border-color: var(--primary);
                    background: var(--card-bg);
                }

                .file-input {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    opacity: 0;
                    cursor: pointer;
                }

                .file-input-placeholder {
                    pointer-events: none;
                }

                .file-input-placeholder i {
                    font-size: 48px;
                    color: var(--primary);
                    margin-bottom: 12px;
                    display: block;
                }

                .file-input-placeholder span {
                    color: var(--text-secondary);
                    font-size: 14px;
                }

                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                }

                .form-select {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid var(--border);
                    border-radius: 6px;
                    background: var(--bg);
                    color: var(--text);
                    font-size: 14px;
                    transition: border-color 0.3s;
                }

                .form-select:focus {
                    outline: none;
                    border-color: var(--primary);
                }

                .form-help {
                    display: flex;
                    align-items: start;
                    gap: 6px;
                    color: var(--text-secondary);
                    font-size: 13px;
                    margin-top: 6px;
                }

                .form-help i {
                    color: var(--primary);
                    margin-top: 2px;
                }

                .form-actions {
                    display: flex;
                    gap: 12px;
                    margin-top: 24px;
                    flex-wrap: wrap;
                }

                .btn-large {
                    padding: 12px 24px;
                    font-size: 16px;
                }

                .summary-card {
                    background: var(--card-bg);
                    border: 1px solid var(--border);
                    border-left: 4px solid var(--primary);
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 24px;
                }

                .summary-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 16px;
                }

                .summary-header i {
                    font-size: 24px;
                    color: var(--primary);
                }

                .summary-header h3 {
                    margin: 0;
                    color: var(--text);
                    font-size: 18px;
                }

                .summary-text {
                    color: var(--text-secondary);
                    line-height: 1.6;
                    margin: 0;
                }

                .topics-container {
                    margin-top: 16px;
                    padding-top: 16px;
                    border-top: 1px solid var(--border);
                }

                .topics-label {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: var(--text);
                    font-weight: 600;
                    margin-bottom: 12px;
                }

                .topics-label i {
                    color: var(--primary);
                }

                .topics-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .topic-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: var(--primary);
                    color: white;
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 500;
                }

                .topic-tag i {
                    font-size: 11px;
                }

                .suggestions-header {
                    background: var(--success);
                    color: white;
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 24px;
                }

                .suggestions-header-content {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }

                .suggestions-header-content > i {
                    font-size: 32px;
                }

                .suggestions-header h3 {
                    margin: 0 0 4px 0;
                    font-size: 20px;
                }

                .suggestions-header p {
                    margin: 0;
                    opacity: 0.9;
                    font-size: 14px;
                }

                .suggestions-grid {
                    display: grid;
                    gap: 20px;
                }

                .suggestion-card {
                    background: var(--card-bg);
                    border: 2px solid var(--border);
                    border-radius: 12px;
                    padding: 24px;
                    transition: all 0.3s ease;
                }

                .suggestion-card:hover {
                    border-color: var(--primary);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    transform: translateY(-2px);
                }

                .suggestion-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: start;
                    gap: 16px;
                    margin-bottom: 16px;
                    flex-wrap: wrap;
                }

                .suggestion-title {
                    flex: 1;
                    min-width: 200px;
                }

                .suggestion-title h4 {
                    color: var(--text);
                    margin: 0 0 12px 0;
                    font-size: 18px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .suggestion-title h4 i {
                    color: var(--primary);
                }

                .suggestion-badges {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .badge-icon {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 500;
                    white-space: nowrap;
                }

                .badge-type {
                    background: var(--primary);
                    color: white;
                }

                .badge-difficulty {
                    background: #8b5cf6;
                    color: white;
                }

                .badge-duration {
                    background: var(--success);
                    color: white;
                }

                .badge-icon i {
                    font-size: 12px;
                }

                .suggestion-description {
                    color: var(--text-secondary);
                    line-height: 1.6;
                    margin: 16px 0;
                }

                .suggestion-section {
                    background: var(--bg);
                    border-radius: 8px;
                    padding: 16px;
                    margin: 16px 0;
                }

                .section-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--text);
                    font-weight: 600;
                    margin-bottom: 12px;
                }

                .section-title i {
                    color: var(--primary);
                }

                .suggestion-list {
                    margin: 8px 0 0 20px;
                    padding: 0;
                    list-style: none;
                }

                .suggestion-list li {
                    color: var(--text-secondary);
                    margin: 6px 0;
                    display: flex;
                    align-items: start;
                    gap: 8px;
                }

                .suggestion-list li::before {
                    content: "•";
                    color: var(--primary);
                    font-weight: bold;
                    font-size: 18px;
                    line-height: 1.4;
                }

                .ordered-list {
                    counter-reset: item;
                    list-style-type: none;
                }

                .ordered-list li {
                    counter-increment: item;
                }

                .ordered-list li::before {
                    content: counter(item) ".";
                    color: var(--primary);
                    font-weight: bold;
                    margin-right: 8px;
                }

                .grading-section {
                    background: #e0f2fe;
                    border-left: 4px solid var(--primary);
                }

                .grading-text {
                    color: var(--text);
                    margin: 8px 0 0 0;
                    white-space: pre-line;
                    line-height: 1.6;
                }

                @media (max-width: 768px) {
                    .modal-header-custom h2 {
                        font-size: 20px;
                    }

                    .form-grid {
                        grid-template-columns: 1fr;
                    }

                    .suggestion-header {
                        flex-direction: column;
                    }

                    .suggestion-title {
                        width: 100%;
                    }

                    .form-actions {
                        flex-direction: column;
                    }

                    .form-actions button {
                        width: 100%;
                    }
                }
            </style>
        `;
        
        showModal(modalContent, '900px');
        showLoader(false);
        
        // Gestionnaire pour afficher le nom du fichier sélectionné
        const fileInput = document.getElementById('course-file-input');
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                const fileName = this.files[0].name;
                const placeholder = document.querySelector('.file-input-placeholder span');
                placeholder.textContent = `✓ ${fileName}`;
                placeholder.style.color = 'var(--success)';
            }
        });
        
        // Gestionnaire de soumission
        document.getElementById('ai-suggestions-form').addEventListener('submit', handleAIFormSubmit);
        
    } catch (error) {
        showAlert('Impossible de charger le formulaire. Veuillez réessayer.', 'error');
        showLoader(false);
    }
}

async function handleAIFormSubmit(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('course-file-input');
    const file = fileInput.files[0];
    
    if (!file) {
        showAlert('Veuillez sélectionner un fichier de cours', 'warning');
        return;
    }
    
    // Taille maximale autorisée : 600 MB
    const MAX_FILE_SIZE = 600 * 1024 * 1024; // bytes
    
    // Calcul de la taille réelle du fichier
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    
    // Affichage de la taille du fichier à l'utilisateur
    showAlert(`Taille du fichier sélectionné : ${fileSizeMB} MB`, 'info');
    
    // Vérification de la taille
    if (file.size > MAX_FILE_SIZE) {
        showAlert(
            `Le fichier est trop volumineux (${fileSizeMB} MB). 
            'La taille maximale autorisée est de 600 MB.`,
            'error'
        );
        return;
    }
    
    // Vérifier l'extension
    const validExtensions = ['.pdf', '.docx', '.doc', '.txt'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(fileExtension)) {
        showAlert('Format de fichier non supporté. Veuillez utiliser un fichier PDF, DOCX ou TXT', 'error');
        return;
    }
    
    showLoader(true);
    
    try {
        // Créer FormData pour l'upload
        const formData = new FormData();
        formData.append('course_file', file);
        formData.append('difficulty', document.getElementById('ai-difficulty').value);
        formData.append('student_level', document.getElementById('ai-student-level').value);
        
        // Récupérer EC si sélectionné
        const ecId = document.getElementById('ai-ec-id').value;
        if (ecId) {
            formData.append('ec_id', ecId);
        }
        
        // Envoyer la requête
        const response = await fetch('/api/ai/generate-exam-suggestions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (!response.ok) {
            if (response.status === 413) {
                showAlert('Le fichier est trop volumineux pour être traité', 'error');
            } else if (response.status === 500) {
                showAlert('Une erreur est survenue lors de l\'analyse du fichier. Veuillez réessayer', 'error');
            } else {
                showAlert('Impossible de générer les suggestions. Veuillez vérifier votre fichier', 'error');
            }
            showLoader(false);
            return;
        }
        
        const data = await response.json();
        
        if (data.success && data.suggestions) {
            // Afficher le résumé du cours
            document.getElementById('course-summary-text').textContent = data.course_summary || 'Aucun résumé disponible';
            
            if (data.main_topics && data.main_topics.length > 0) {
                document.getElementById('main-topics-container').innerHTML = `
                    <div class="topics-label">
                        <i class="fas fa-tags"></i>
                        <span>Thèmes principaux :</span>
                    </div>
                    <div class="topics-tags">
                        ${data.main_topics.map(topic => 
                            `<span class="topic-tag"><i class="fas fa-bookmark"></i> ${topic}</span>`
                        ).join('')}
                    </div>
                `;
            }
            
            // Afficher les suggestions
            displayAISuggestions(data.suggestions);
            
            // Changer de step
            document.getElementById('upload-step').style.display = 'none';
            document.getElementById('results-step').style.display = 'block';
            
            showAlert(`${data.suggestions.length} suggestions générées avec succès`, 'success');
        } else {
            showAlert(data.error || 'Impossible de générer les suggestions. Le contenu du fichier est peut-être insuffisant', 'error');
        }
    } catch (error) {
        if (error.message.includes('Failed to fetch')) {
            showAlert('Problème de connexion au serveur. Vérifiez votre connexion internet et réessayez.', 'error');
        } else {
            showAlert('Une erreur inattendue est survenue lors de la génération. Veuillez réessayer.', 'error');
        }
    } finally {
        showLoader(false);
    }
}

function displayAISuggestions(suggestions) {
    const container = document.getElementById('suggestions-list-container');
    
    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <div>Aucune suggestion n'a pu être générée à partir de ce fichier</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = suggestions.map((suggestion, index) => `
        <div class="suggestion-card">
            <div class="suggestion-header">
                <div class="suggestion-title">
                    <h4>
                        <i class="fas fa-file-alt"></i>
                        <span>${index + 1}. ${suggestion.title}</span>
                    </h4>
                    <div class="suggestion-badges">
                        <span class="badge-icon badge-type">
                            <i class="fas fa-book"></i> ${suggestion.exam_type}
                        </span>
                        <span class="badge-icon badge-difficulty">
                            <i class="fas fa-signal"></i> ${suggestion.difficulty}
                        </span>
                        <span class="badge-icon badge-duration">
                            <i class="fas fa-clock"></i> ${suggestion.duration} min
                        </span>
                    </div>
                </div>
                <button class="btn btn-success" onclick='selectAISuggestion(${JSON.stringify(suggestion).replace(/'/g, "&#39;")})'>
                    <i class="fas fa-check"></i> Utiliser ce Sujet
                </button>
            </div>
            
            <p class="suggestion-description">${suggestion.description}</p>
            
            <div class="suggestion-section">
                <div class="section-title">
                    <i class="fas fa-list-check"></i>
                    <span>Points Clés du Cours</span>
                </div>
                <ul class="suggestion-list">
                    ${suggestion.key_points.map(point => `<li>${point}</li>`).join('')}
                </ul>
            </div>
            
            ${suggestion.questions_examples ? `
                <div class="suggestion-section">
                    <div class="section-title">
                        <i class="fas fa-question-circle"></i>
                        <span>Exemples de Questions</span>
                    </div>
                    <ol class="suggestion-list ordered-list">
                        ${suggestion.questions_examples.map(q => `<li>${q}</li>`).join('')}
                    </ol>
                </div>
            ` : ''}
            
            <div class="suggestion-section grading-section">
                <div class="section-title">
                    <i class="fas fa-clipboard-check"></i>
                    <span>Critères d'Évaluation</span>
                </div>
                <p class="grading-text">${suggestion.grading_criteria}</p>
            </div>
        </div>
    `).join('');
}

async function selectAISuggestion(suggestion) {
    const ecId = document.getElementById('ai-ec-id') ? document.getElementById('ai-ec-id').value : '';

    // Étape 1: générer l'examen complet avec questions + barème
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/subjects/generate-full-exam', {
            method: 'POST',
            body: JSON.stringify({ suggestion })
        });

        if (!response.ok) {
            showAlert('Impossible de générer le sujet complet. Veuillez réessayer.', 'error');
            showLoader(false);
            return;
        }

        const data = await response.json();
        if (!data.success) {
            showAlert(data.error || 'Erreur lors de la génération du sujet.', 'error');
            showLoader(false);
            return;
        }

        showLoader(false);
        // Étape 2: afficher la prévisualisation dans le modal
        _showGeneratedExamPreview(data.title, data.content, data.rubric, ecId);

    } catch (error) {
        showLoader(false);
        showAlert('Erreur de connexion. Veuillez réessayer.', 'error');
    }
}

function _showGeneratedExamPreview(title, content, rubric, ecId) {
    const previewContent = `
        <div style="max-width:100%;">
            <div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e2e8f0;">
                <h2 style="margin:0 0 6px;color:#0f172a;"><i class="fas fa-eye" style="color:#3b82f6;"></i> Aperçu du Sujet Généré</h2>
                <p style="margin:0;color:#64748b;font-size:14px;">L'IA a créé un sujet complet avec questions et barème de notation</p>
            </div>

            <!-- Sujet / Questions -->
            <div style="margin-bottom:16px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                    <i class="fas fa-file-lines" style="color:#3b82f6;"></i>
                    <strong style="color:#0f172a;">Sujet d'Examen &amp; Questions</strong>
                    <span style="margin-left:auto;background:#eff6ff;color:#3b82f6;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;">
                        <i class="fas fa-robot"></i> Généré par IA
                    </span>
                </div>
                <div style="max-height:300px;overflow-y:auto;padding:14px;background:#f8fafc;border-radius:8px;font-family:monospace;font-size:13px;line-height:1.7;white-space:pre-wrap;border:1px solid #e2e8f0;">${content}</div>
            </div>

            <!-- Barème -->
            <div style="margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                    <i class="fas fa-clipboard-list" style="color:#10b981;"></i>
                    <strong style="color:#0f172a;">Barème de Notation</strong>
                    <span style="margin-left:auto;background:#f0fdf4;color:#15803d;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;">
                        <i class="fas fa-check"></i> Points attribués
                    </span>
                </div>
                <div style="max-height:280px;overflow-y:auto;padding:14px;background:#f0fdf4;border-radius:8px;font-family:monospace;font-size:13px;line-height:1.8;white-space:pre-wrap;border:1px solid #bbf7d0;">${rubric}</div>
            </div>

            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:#92400e;">
                <i class="fas fa-info-circle"></i>
                <strong> Information :</strong> Ce sujet et son barème seront sauvegardés. Les étudiants verront les questions avec leurs points lors de l'examen en ligne.
            </div>

            <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;">
                <button class="btn btn-secondary" onclick="closeModal(); showCreateCourseWithAISuggestionsModal();">
                    <i class="fas fa-arrow-left"></i> Retour aux suggestions
                </button>
                <button class="btn btn-primary" id="btn-confirm-save-subject" onclick="_confirmSaveGeneratedSubject(${JSON.stringify(title).replace(/"/g, '&quot;')}, ${JSON.stringify(content).replace(/"/g, '&quot;')}, ${JSON.stringify(rubric).replace(/"/g, '&quot;')}, ${JSON.stringify(ecId || '').replace(/"/g, '&quot;')})">
                    <i class="fas fa-save"></i> Enregistrer ce Sujet
                </button>
            </div>
        </div>
    `;
    showModal(previewContent, '850px');
}

async function _confirmSaveGeneratedSubject(title, content, rubric, ecId) {
    const btn = document.getElementById('btn-confirm-save-subject');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...'; }

    try {
        const response = await authenticatedFetch('/api/subjects/create-from-suggestion', {
            method: 'POST',
            body: JSON.stringify({
                title: title,
                ec_id: ecId || null,
                content: content,
                rubric_override: rubric,
                metadata: { generated_by_ai: true }
            })
        });

        const data = await response.json();
        if (data.success) {
            closeModal();
            showSubjectCreatedPreview(data.subject);
        } else {
            showAlert(data.error || 'Impossible de sauvegarder le sujet.', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer ce Sujet'; }
        }
    } catch (error) {
        showAlert('Erreur de connexion. Veuillez réessayer.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer ce Sujet'; }
    }
}