// ============================================================================
// GESTION COMPLÈTE DE LA MAQUETTE PÉDAGOGIQUE
// À ajouter dans app.js
// ============================================================================

// ============================================================================
// CHARGEMENT MAQUETTE AVEC BOUTONS CRUD
// ============================================================================
async function loadMaquetteAdmin() {
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    
    try {
        const response = await authenticatedFetch('/api/formations');
        const formations = await response.json();
        
        let html = `
            <div class="page-header">
                <h2>📚 Maquette Pédagogique - Gestion Complète</h2>
                <p>Gérez les formations, semestres, UEs et ECs</p>
            </div>
            
            <div class="card mb-3">
                <div class="card-header">
                    <h3>🎓 Formations</h3>
                </div>
                <button class="btn btn-primary" onclick="showCreateFormationModal()">
                    ➕ Créer une Formation
                </button>
            </div>
        `;
        
        if (formations.length === 0) {
            html += '<div class="alert alert-info">Aucune formation. Créez-en une pour commencer.</div>';
        } else {
            formations.forEach(formation => {
                html += `
                    <div class="card mb-3">
                        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h3>🎓 ${formation.name}</h3>
                                <p style="color: #64748b; margin: 5px 0;">
                                    <strong>Code:</strong> ${formation.code} | 
                                    <strong>Niveau:</strong> ${formation.level || 'N/A'} | 
                                    <strong>Semestres:</strong> ${formation.semesters_count || 0}
                                </p>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-sm btn-success" onclick="showAddSemesterModal(${formation.id})">
                                    ➕ Semestre
                                </button>
                                <button class="btn btn-sm btn-primary" onclick="showEditFormationModal(${formation.id})">
                                    ✏️ Modifier
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteFormation(${formation.id})">
                                    🗑️ Supprimer
                                </button>
                            </div>
                        </div>
                        <div id="formation-${formation.id}-content" style="padding: 20px;">
                            <button class="btn btn-secondary" onclick="loadFormationSemesters(${formation.id})">
                                📖 Voir les Semestres
                            </button>
                        </div>
                    </div>
                `;
            });
        }
        
        document.getElementById('main-content').innerHTML = html;
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// CHARGEMENT DES SEMESTRES D'UNE FORMATION
// ============================================================================
async function loadFormationSemesters(formationId) {
    showLoader(true);
    
    try {
        const response = await authenticatedFetch(`/api/formations/${formationId}/semesters`);
        const semesters = await response.json();
        
        let html = '<div style="margin-top: 20px;">';
        
        if (semesters.length === 0) {
            html += '<div class="alert alert-info">Aucun semestre. Ajoutez-en un.</div>';
        } else {
            semesters.forEach(semester => {
                html += `
                    <div class="card mb-2" style="margin-left: 20px;">
                        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                            <div>
                                <strong>📖 ${semester.name}</strong> 
                                (${semester.total_credits} crédits) - 
                                ${semester.ues_count || 0} UE(s)
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-sm btn-success" onclick="showAddUEModal(${semester.id})">
                                    ➕ UE
                                </button>
                                <button class="btn btn-sm btn-primary" onclick="showEditSemesterModal(${semester.id})">
                                    ✏️
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteSemester(${semester.id})">
                                    🗑️
                                </button>
                                <button class="btn btn-sm btn-secondary" onclick="toggleSemesterUEs(${semester.id})">
                                    👁️ UEs
                                </button>
                            </div>
                        </div>
                        <div id="semester-${semester.id}-ues" style="display: none; padding: 15px; background: #f1f5f9;"></div>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        
        document.getElementById(`formation-${formationId}-content`).innerHTML = html;
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// CHARGEMENT DES UEs D'UN SEMESTRE
// ============================================================================
async function toggleSemesterUEs(semesterId) {
    const container = document.getElementById(`semester-${semesterId}-ues`);
    
    if (container.style.display === 'none') {
        showLoader(true);
        
        try {
            const response = await authenticatedFetch(`/api/semesters/${semesterId}/ues`);
            const ues = await response.json();
            
            let html = '';
            
            if (ues.length === 0) {
                html = '<div class="alert alert-info">Aucune UE. Ajoutez-en une.</div>';
            } else {
                ues.forEach(ue => {
                    html += `
                        <div class="card mb-2" style="border-left: 4px solid #2563eb;">
                            <div style="padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong style="color: #2563eb;">${ue.code}:</strong> ${ue.name} 
                                    (${ue.credits} crédits) - ${ue.ecs_count || 0} EC(s)
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button class="btn btn-sm btn-success" onclick="showAddECModal(${ue.id})">
                                        ➕ EC
                                    </button>
                                    <button class="btn btn-sm btn-primary" onclick="showEditUEModal(${ue.id})">
                                        ✏️
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="deleteUE(${ue.id})">
                                        🗑️
                                    </button>
                                    <button class="btn btn-sm btn-secondary" onclick="toggleUEECs(${ue.id})">
                                        👁️ ECs
                                    </button>
                                </div>
                            </div>
                            <div id="ue-${ue.id}-ecs" style="display: none; padding: 15px; background: white;"></div>
                        </div>
                    `;
                });
            }
            
            container.innerHTML = html;
            container.style.display = 'block';
        } catch (error) {
            showAlert('Erreur: ' + error.message, 'error');
        } finally {
            showLoader(false);
        }
    } else {
        container.style.display = 'none';
    }
}

// ============================================================================
// CHARGEMENT DES ECs D'UNE UE
// ============================================================================
async function toggleUEECs(ueId) {
    const container = document.getElementById(`ue-${ueId}-ecs`);
    
    if (container.style.display === 'none') {
        showLoader(true);
        
        try {
            const response = await authenticatedFetch(`/api/ues/${ueId}/ecs`);
            const ecs = await response.json();
            
            let html = '<table style="width: 100%; font-size: 13px;"><thead><tr><th>Code</th><th>Nom</th><th>CM</th><th>TD</th><th>TP</th><th>TPE</th><th>VHT</th><th>Coef</th><th>Actions</th></tr></thead><tbody>';
            
            if (ecs.length === 0) {
                html += '<tr><td colspan="9">Aucun EC</td></tr>';
            } else {
                ecs.forEach(ec => {
                    html += `
                        <tr>
                            <td><strong>${ec.code}</strong></td>
                            <td>${ec.name}</td>
                            <td>${ec.cm}h</td>
                            <td>${ec.td}h</td>
                            <td>${ec.tp}h</td>
                            <td>${ec.tpe}h</td>
                            <td><strong>${ec.vht}h</strong></td>
                            <td>${ec.coefficient}</td>
                            <td>
                                <button class="btn btn-sm btn-primary" onclick="showEditECModal(${ec.id})">✏️</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteEC(${ec.id})">🗑️</button>
                            </td>
                        </tr>
                    `;
                });
            }
            
            html += '</tbody></table>';
            container.innerHTML = html;
            container.style.display = 'block';
        } catch (error) {
            showAlert('Erreur: ' + error.message, 'error');
        } finally {
            showLoader(false);
        }
    } else {
        container.style.display = 'none';
    }
}

// ============================================================================
// MODALS CRÉATION - FORMATION
// ============================================================================
function showCreateFormationModal() {
    const modalContent = `
        <h2>➕ Créer une Formation</h2>
        <form id="create-formation-form">
            <div class="form-group">
                <label>Code Formation *</label>
                <input type="text" id="formation-code" required placeholder="Ex: MASTER_TR_CYBER">
            </div>
            <div class="form-group">
                <label>Nom Complet *</label>
                <input type="text" id="formation-name" required placeholder="Ex: Master Télécommunications & Réseaux">
            </div>
            <div class="form-group">
                <label>Niveau</label>
                <select id="formation-level">
                    <option value="Master 1">Master 1</option>
                    <option value="Master 2">Master 2</option>
                    <option value="Licence 3">Licence 3</option>
                </select>
            </div>
            <div class="form-group">
                <label>Département</label>
                <input type="text" id="formation-department" placeholder="Ex: Tronc Commun">
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="formation-description" rows="3"></textarea>
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-primary">Créer</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
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
                showAlert('Formation créée!', 'success');
                closeModal();
                loadMaquetteAdmin();
            } else {
                showAlert('Erreur: ' + data.error, 'error');
            }
        } catch (error) {
            showAlert('Erreur: ' + error.message, 'error');
        } finally {
            showLoader(false);
        }
    });
}

// ============================================================================
// MODALS CRÉATION - SEMESTRE
// ============================================================================
function showAddSemesterModal(formationId) {
    const modalContent = `
        <h2>➕ Ajouter un Semestre</h2>
        <form id="create-semester-form">
            <div class="form-group">
                <label>Numéro *</label>
                <input type="number" id="semester-number" required min="1" max="10" value="1">
            </div>
            <div class="form-group">
                <label>Nom *</label>
                <input type="text" id="semester-name" required placeholder="Ex: Semestre 1">
            </div>
            <div class="form-group">
                <label>Crédits Totaux *</label>
                <input type="number" id="semester-credits" required value="30">
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-primary">Créer</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
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
                showAlert('Semestre créé!', 'success');
                closeModal();
                loadFormationSemesters(formationId);
            } else {
                showAlert('Erreur: ' + data.error, 'error');
            }
        } catch (error) {
            showAlert('Erreur: ' + error.message, 'error');
        } finally {
            showLoader(false);
        }
    });
}

// ============================================================================
// MODALS CRÉATION - UE
// ============================================================================
function showAddUEModal(semesterId) {
    const modalContent = `
        <h2>➕ Ajouter une UE</h2>
        <form id="create-ue-form">
            <div class="form-group">
                <label>Code UE *</label>
                <input type="text" id="ue-code" required placeholder="Ex: UEM111">
            </div>
            <div class="form-group">
                <label>Nom *</label>
                <input type="text" id="ue-name" required placeholder="Ex: Informatique générale">
            </div>
            <div class="form-group">
                <label>Crédits *</label>
                <input type="number" id="ue-credits" required value="6" min="1">
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-primary">Créer</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
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
                showAlert('UE créée!', 'success');
                closeModal();
                // Recharger les UEs du semestre
                toggleSemesterUEs(semesterId);
                toggleSemesterUEs(semesterId); // Pour forcer le rechargement
            } else {
                showAlert('Erreur: ' + data.error, 'error');
            }
        } catch (error) {
            showAlert('Erreur: ' + error.message, 'error');
        } finally {
            showLoader(false);
        }
    });
}

// ============================================================================
// MODALS CRÉATION - EC
// ============================================================================
function showAddECModal(ueId) {
    const modalContent = `
        <h2>➕ Ajouter un EC</h2>
        <form id="create-ec-form">
            <div class="form-group">
                <label>Code EC *</label>
                <input type="text" id="ec-code" required placeholder="Ex: M1111">
            </div>
            <div class="form-group">
                <label>Nom *</label>
                <input type="text" id="ec-name" required placeholder="Ex: Bases de données">
            </div>
            <div class="grid" style="grid-template-columns: repeat(2, 1fr);">
                <div class="form-group">
                    <label>CM (heures)</label>
                    <input type="number" id="ec-cm" value="0" min="0">
                </div>
                <div class="form-group">
                    <label>TD (heures)</label>
                    <input type="number" id="ec-td" value="0" min="0">
                </div>
                <div class="form-group">
                    <label>TP (heures)</label>
                    <input type="number" id="ec-tp" value="0" min="0">
                </div>
                <div class="form-group">
                    <label>TPE (heures)</label>
                    <input type="number" id="ec-tpe" value="0" min="0">
                </div>
            </div>
            <div class="form-group">
                <label>VHT Total (heures) *</label>
                <input type="number" id="ec-vht" required value="40" min="1">
            </div>
            <div class="form-group">
                <label>Coefficient *</label>
                <input type="number" id="ec-coefficient" required value="1" min="1">
            </div>
            <div class="d-flex gap-2 mt-2">
                <button type="submit" class="btn btn-primary">Créer</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
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
                showAlert('EC créé!', 'success');
                closeModal();
                // Recharger les ECs de l'UE
                toggleUEECs(ueId);
                toggleUEECs(ueId); // Pour forcer le rechargement
            } else {
                showAlert('Erreur: ' + data.error, 'error');
            }
        } catch (error) {
            showAlert('Erreur: ' + error.message, 'error');
        } finally {
            showLoader(false);
        }
    });
}

// ============================================================================
// FONCTIONS DE SUPPRESSION
// ============================================================================
async function deleteFormation(formationId) {
    if (!confirm('⚠️ Supprimer cette formation supprimera TOUS ses semestres, UEs et ECs. Confirmer?')) return;
    
    showLoader(true);
    try {
        const response = await authenticatedFetch(`/api/admin/formations/${formationId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            showAlert('Formation supprimée!', 'success');
            loadMaquetteAdmin();
        } else {
            showAlert('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'error');
    } finally {
        showLoader(false);
    }
}

async function deleteSemester(semesterId) {
    if (!confirm('⚠️ Supprimer ce semestre supprimera toutes ses UEs et ECs. Confirmer?')) return;
    
    showLoader(true);
    try {
        const response = await authenticatedFetch(`/api/admin/semesters/${semesterId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            showAlert('Semestre supprimé!', 'success');
            loadMaquetteAdmin();
        } else {
            showAlert('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'error');
    } finally {
        showLoader(false);
    }
}

async function deleteUE(ueId) {
    if (!confirm('⚠️ Supprimer cette UE supprimera tous ses ECs. Confirmer?')) return;
    
    showLoader(true);
    try {
        const response = await authenticatedFetch(`/api/admin/ues/${ueId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            showAlert('UE supprimée!', 'success');
            loadMaquetteAdmin();
        } else {
            showAlert('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'error');
    } finally {
        showLoader(false);
    }
}

async function deleteEC(ecId) {
    if (!confirm('Confirmer la suppression de cet EC?')) return;
    
    showLoader(true);
    try {
        const response = await authenticatedFetch(`/api/admin/ecs/${ecId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            showAlert('EC supprimé!', 'success');
            loadMaquetteAdmin();
        } else {
            showAlert('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'error');
    } finally {
        showLoader(false);
    }
}

// ============================================================================
// BOUTON EXPORT PDF DANS LE DASHBOARD ÉTUDIANT
// ============================================================================
function addExportButtonToPaper(paperId) {
    return `<button class="btn btn-sm btn-success" onclick="exportPaperPDF(${paperId})">
        📄 Exporter PDF
    </button>`;
}

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
            showAlert('PDF téléchargé!', 'success');
        } else {
            showAlert('Erreur lors de l\'export', 'error');
        }
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'error');
    } finally {
        showLoader(false);
    }
}

// MODIFICATION: Mettre à jour loadMaquette() pour utiliser la nouvelle fonction
function loadMaquette() {
    if (currentUser.role === 'admin') {
        loadMaquetteAdmin();
    } else {
        // Version lecture seule pour les autres rôles
        loadMaquetteReadOnly();
    }
}

async function loadMaquetteReadOnly() {
    // Garder l'ancienne fonction pour les non-admins
    if (window.event && window.event.target) setActiveTab(window.event.target);
    showLoader(true);
    try {
        const response = await authenticatedFetch('/api/formations');
        const formations = await response.json();
        let formationsHTML = '';
        for (const formation of formations) {
            formationsHTML += `
                <div class="card mb-3">
                    <div class="card-header">
                        <h3>🎓 ${formation.name}</h3>
                        <p><strong>Code:</strong> ${formation.code} | <strong>Niveau:</strong> ${formation.level}</p>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="loadFormationDetails(${formation.id})">📚 Voir les semestres</button>
                </div>
            `;
        }
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h2>📚 Maquette Pédagogique</h2>
                <p>Consultation des formations, UE et EC</p>
            </div>
            ${formationsHTML}
        `;
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'error');
    } finally {
        showLoader(false);
    }
}
