/**
 * kanban.js — Talenco
 * Kanban drag & drop pour l'espace recruteur (entreprises.html)
 *
 * Usage :
 *   <div id="kanban"></div>
 *   <script src="/kanban.js"></script>
 *   <script>
 *     supabase.auth.getSession().then(({ data: { session } }) => {
 *       if (session) kanban.init(supabase, 'kanban', session.user.id);
 *     });
 *   </script>
 */

const SUPABASE_URL     = 'https://ywteoxnkkdgdpbkrlkar.supabase.co';
const SITE_URL         = 'https://talenco.bj';
const ANON_KEY         = window.SUPABASE_ANON_KEY ?? '';

// Mapping statut DB → libellé colonne
const COLONNES = [
  { statut: 'envoyée',   label: 'Reçues',          color: '#3b82f6', bg: '#eff6ff' },
  { statut: 'vue',       label: 'Présélectionnés',  color: '#f59e0b', bg: '#fffbeb' },
  { statut: 'entretien', label: 'Entretien',         color: '#16a34a', bg: '#f0fdf4' },
  { statut: 'refusée',   label: 'Refusées',          color: '#ef4444', bg: '#fef2f2' },
];

// ── Utilitaires ───────────────────────────────────────────────────────────────

function relDate(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (d < 60)  return `il y a ${d}min`;
  if (d < 1440) return `il y a ${Math.floor(d / 60)}h`;
  if (d < 2880) return 'hier';
  return `il y a ${Math.floor(d / 1440)}j`;
}

function initials(email = '') {
  const parts = email.split('@')[0].replace(/[._+]/g, ' ').trim().split(' ');
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function avatarColor(email = '') {
  const PALETTE = ['#16a34a','#7c3aed','#2563eb','#d97706','#0891b2','#db2777'];
  let h = 0;
  for (const c of email) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Injection CSS ─────────────────────────────────────────────────────────────

(function injectCSS() {
  if (document.getElementById('kanban-css')) return;
  const s = document.createElement('style');
  s.id = 'kanban-css';
  s.textContent = `
/* ── Toolbar ── */
.kb-toolbar {
  display: flex; align-items: center; gap: 12px;
  padding: 0 0 16px; flex-wrap: wrap;
}
.kb-filter-label { font-size: 13px; color: #6b7280; white-space: nowrap; }
.kb-filter-select {
  border: 1.5px solid #e5e7eb; border-radius: 8px;
  padding: 7px 12px; font-size: 13px; color: #111827;
  background: #fff; cursor: pointer; outline: none;
  transition: border-color .15s;
}
.kb-filter-select:focus { border-color: #16a34a; }
.kb-count-badge {
  font-size: 12px; color: #6b7280;
  margin-left: auto; white-space: nowrap;
}

/* ── Board ── */
.kb-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(240px, 1fr));
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}
@media (max-width: 900px) { .kb-board { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .kb-board { grid-template-columns: 1fr; } }

/* ── Column ── */
.kb-col {
  background: #f9fafb;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  display: flex; flex-direction: column;
  min-height: 180px;
  transition: border-color .15s, box-shadow .15s;
}
.kb-col.drag-over {
  border-color: #16a34a;
  box-shadow: 0 0 0 3px rgba(22,163,74,.15);
  background: #f0fdf4;
}
.kb-col-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1.5px solid #e5e7eb;
}
.kb-col-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.kb-col-title { font-size: 13px; font-weight: 600; color: #111827; flex: 1; }
.kb-col-count {
  background: #e5e7eb; color: #374151;
  font-size: 11px; font-weight: 700;
  padding: 2px 7px; border-radius: 99px;
}
.kb-cards { flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.kb-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: #d1d5db; padding: 20px; text-align: center;
}

/* ── Card ── */
.kb-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  cursor: grab;
  transition: box-shadow .15s, opacity .15s;
  user-select: none;
}
.kb-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.kb-card.dragging { opacity: .45; cursor: grabbing; }
.kb-card-top { display: flex; align-items: flex-start; gap: 10px; }
.kb-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
}
.kb-card-info { flex: 1; min-width: 0; }
.kb-card-email {
  font-size: 13px; font-weight: 600; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.kb-card-job {
  font-size: 11px; color: #6b7280; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.kb-card-date { font-size: 11px; color: #9ca3af; margin-top: 6px; }

/* Bouton CV */
.kb-cv-btn {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 8px; background: none;
  border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 4px 10px; font-size: 11px; color: #374151;
  cursor: pointer; transition: border-color .15s;
}
.kb-cv-btn:hover { border-color: #16a34a; color: #16a34a; }
.kb-cv-btn:disabled { opacity: .4; cursor: not-allowed; }

/* Note interne */
.kb-note {
  margin-top: 8px;
  width: 100%; border: 1px dashed #e5e7eb; border-radius: 6px;
  padding: 6px 8px; font-size: 11px; color: #374151;
  font-family: inherit; resize: none; outline: none;
  transition: border-color .15s;
  min-height: 36px;
  line-height: 1.4;
}
.kb-note:focus { border-color: #16a34a; border-style: solid; }
.kb-note::placeholder { color: #d1d5db; }
.kb-note-saving { color: #9ca3af; font-size: 10px; margin-top: 2px; }

/* Boutons mobiles ← → */
.kb-arrows {
  display: none;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
}
@media (pointer: coarse) { .kb-arrows { display: flex; } }
.kb-arrow-btn {
  background: #f3f4f6; border: 1px solid #e5e7eb;
  border-radius: 6px; padding: 4px 10px;
  font-size: 13px; cursor: pointer;
  transition: background .15s;
}
.kb-arrow-btn:hover { background: #e5e7eb; }
.kb-arrow-btn:disabled { opacity: .3; cursor: default; }

/* Loading overlay */
.kb-loading {
  display: flex; align-items: center; justify-content: center;
  padding: 40px; color: #6b7280; font-size: 14px; gap: 10px;
}
.kb-spinner {
  width: 18px; height: 18px; border: 2px solid #e5e7eb;
  border-top-color: #16a34a; border-radius: 50%;
  animation: kb-spin .7s linear infinite;
}
@keyframes kb-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(s);
})();

// ── État global ───────────────────────────────────────────────────────────────

let _sb, _userId, _container;
let _jobs     = [];   // offres du recruteur
let _apps     = [];   // candidatures chargées
let _jobFilter = 'all';
let _dragging  = null; // { appId, fromStatut }
let _rtChannel = null;

// ── Chargement données ────────────────────────────────────────────────────────

async function loadJobs() {
  const { data } = await _sb.from('jobs')
    .select('id, titre, title')
    .eq('user_id', _userId)
    .order('created_at', { ascending: false });
  _jobs = data ?? [];
}

async function loadApplications() {
  const jobIds = _jobFilter === 'all'
    ? _jobs.map(j => j.id)
    : [_jobFilter];

  if (!jobIds.length) { _apps = []; return; }

  const { data } = await _sb.from('applications')
    .select(`
      id, job_id, user_id, statut, cv_path, message, note_recruteur, created_at,
      users!applications_user_id_fkey ( email ),
      jobs ( id, titre, title, entreprise, company )
    `)
    .in('job_id', jobIds)
    .order('created_at', { ascending: false });

  _apps = (data ?? []).map(a => ({
    ...a,
    email:    (a.users)?.email ?? '',
    jobTitre: (a.jobs)?.titre ?? (a.jobs)?.title ?? '—',
  }));
}

// ── Rendu ─────────────────────────────────────────────────────────────────────

function renderToolbar() {
  const opts = _jobs.map(j =>
    `<option value="${j.id}">${j.titre ?? j.title}</option>`
  ).join('');
  const total = _apps.length;
  return `
    <div class="kb-toolbar">
      <label class="kb-filter-label" for="kb-job-filter">Filtrer par offre :</label>
      <select class="kb-filter-select" id="kb-job-filter">
        <option value="all">Toutes les offres</option>
        ${opts}
      </select>
      <span class="kb-count-badge">${total} candidature${total !== 1 ? 's' : ''}</span>
    </div>
  `;
}

function renderCard(app, colIndex) {
  const col     = COLONNES[colIndex];
  const color   = avatarColor(app.email);
  const inits   = initials(app.email);
  const hasCv   = !!app.cv_path;
  const canPrev = colIndex > 0;
  const canNext = colIndex < COLONNES.length - 1;
  const note    = (app.note_recruteur ?? '').replace(/"/g, '&quot;');

  return `
    <div class="kb-card" draggable="true"
         data-id="${app.id}" data-statut="${app.statut}">
      <div class="kb-card-top">
        <div class="kb-avatar" style="background:${color}">${inits}</div>
        <div class="kb-card-info">
          <div class="kb-card-email" title="${app.email}">${app.email}</div>
          <div class="kb-card-job" title="${app.jobTitre}">📋 ${app.jobTitre}</div>
        </div>
      </div>
      <div class="kb-card-date">🕐 ${relDate(app.created_at)}</div>
      ${hasCv
        ? `<button class="kb-cv-btn" data-cv="${app.cv_path}" data-appid="${app.id}">
             📄 Voir le CV
           </button>`
        : `<span style="font-size:11px;color:#d1d5db;margin-top:8px;display:block;">Pas de CV</span>`
      }
      <textarea class="kb-note" data-appid="${app.id}"
        placeholder="Note interne (visible uniquement par vous)…"
        rows="2">${note ? app.note_recruteur : ''}</textarea>
      <div class="kb-note-saving" id="kb-note-saving-${app.id}" style="display:none;">Sauvegarde…</div>
      <div class="kb-arrows">
        <button class="kb-arrow-btn" data-move="-1" data-appid="${app.id}"
          data-statut="${app.statut}" ${!canPrev ? 'disabled' : ''}>←</button>
        <button class="kb-arrow-btn" data-move="1"  data-appid="${app.id}"
          data-statut="${app.statut}" ${!canNext ? 'disabled' : ''}>→</button>
      </div>
    </div>
  `;
}

function renderColumn(colIndex) {
  const col  = COLONNES[colIndex];
  const apps = _apps.filter(a => a.statut === col.statut);
  const cards = apps.map(a => renderCard(a, colIndex)).join('');

  return `
    <div class="kb-col" data-statut="${col.statut}">
      <div class="kb-col-header">
        <div class="kb-col-dot" style="background:${col.color}"></div>
        <span class="kb-col-title">${col.label}</span>
        <span class="kb-col-count">${apps.length}</span>
      </div>
      <div class="kb-cards">
        ${cards || '<div class="kb-empty">Déposer ici</div>'}
      </div>
    </div>
  `;
}

function renderBoard() {
  return `
    ${renderToolbar()}
    <div class="kb-board">
      ${COLONNES.map((_, i) => renderColumn(i)).join('')}
    </div>
  `;
}

async function render() {
  _container.innerHTML = `<div class="kb-loading"><div class="kb-spinner"></div> Chargement…</div>`;
  await loadApplications();
  _container.innerHTML = renderBoard();
  attachEvents();
  setupRealtime();
}

// ── Events ────────────────────────────────────────────────────────────────────

function attachEvents() {
  // Filtre offre
  _container.querySelector('#kb-job-filter')?.addEventListener('change', (e) => {
    _jobFilter = e.target.value;
    render();
  });

  // Drag source
  _container.querySelectorAll('.kb-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      _dragging = { appId: card.dataset.id, fromStatut: card.dataset.statut };
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  // Drop targets (colonnes)
  _container.querySelectorAll('.kb-col').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', (e) => {
      // Ignorer les events enfants
      if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (!_dragging) return;
      const newStatut = col.dataset.statut;
      if (newStatut !== _dragging.fromStatut) {
        moveCard(_dragging.appId, _dragging.fromStatut, newStatut);
      }
      _dragging = null;
    });
  });

  // Bouton Voir CV
  _container.querySelectorAll('.kb-cv-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cvPath = btn.dataset.cv;
      btn.disabled = true;
      btn.textContent = '⏳';
      const { data, error } = await _sb.storage.from('cvs').createSignedUrl(cvPath, 3600);
      btn.disabled = false;
      btn.innerHTML = '📄 Voir le CV';
      if (error || !data?.signedUrl) { alert('Impossible d\'accéder au CV.'); return; }
      window.open(data.signedUrl, '_blank');
    });
  });

  // Note interne (autosave 1s après arrêt frappe)
  const debouncedNote = debounce(async (appId, value) => {
    const indicator = document.getElementById(`kb-note-saving-${appId}`);
    if (indicator) indicator.style.display = 'block';
    await _sb.from('applications').update({ note_recruteur: value }).eq('id', appId);
    if (indicator) indicator.style.display = 'none';
    // Mettre à jour en mémoire
    const app = _apps.find(a => a.id === appId);
    if (app) app.note_recruteur = value;
  }, 900);

  _container.querySelectorAll('.kb-note').forEach(ta => {
    ta.addEventListener('input', () => debouncedNote(ta.dataset.appid, ta.value));
    // Empêcher le drag depuis la textarea
    ta.addEventListener('mousedown', e => e.stopPropagation());
  });

  // Boutons mobiles ← →
  _container.querySelectorAll('.kb-arrow-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const appId   = btn.dataset.appid;
      const statut  = btn.dataset.statut;
      const dir     = parseInt(btn.dataset.move, 10);
      const colIdx  = COLONNES.findIndex(c => c.statut === statut);
      const newCol  = COLONNES[colIdx + dir];
      if (newCol) moveCard(appId, statut, newCol.statut);
    });
  });
}

// ── Déplacer une carte (optimistic UI + DB) ───────────────────────────────────

async function moveCard(appId, fromStatut, toStatut) {
  // Mise à jour optimiste en mémoire
  const app = _apps.find(a => a.id === appId);
  if (!app) return;
  app.statut = toStatut;

  // Re-render immédiat (sans rechargement DB)
  _container.querySelector('.kb-board').innerHTML =
    COLONNES.map((_, i) => renderColumn(i)).join('');
  attachColumnEvents();

  // Persistance DB
  const { error } = await _sb.from('applications')
    .update({ statut: toStatut })
    .eq('id', appId);

  if (error) {
    // Rollback
    app.statut = fromStatut;
    _container.querySelector('.kb-board').innerHTML =
      COLONNES.map((_, i) => renderColumn(i)).join('');
    attachColumnEvents();
    console.error('Erreur mise à jour statut:', error);
    return;
  }

  // Notification email candidat (fire-and-forget)
  if (['entretien', 'refusée'].includes(toStatut)) {
    fetch(`${SUPABASE_URL}/functions/v1/notify-statut-change`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ application_id: appId, nouveau_statut: toStatut }),
    }).catch(err => console.warn('Notification non critique:', err));
  }
}

// Re-attache seulement les events colonnes (après re-render partiel)
function attachColumnEvents() {
  _container.querySelectorAll('.kb-col').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault(); col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (!_dragging) return;
      const newStatut = col.dataset.statut;
      if (newStatut !== _dragging.fromStatut) moveCard(_dragging.appId, _dragging.fromStatut, newStatut);
      _dragging = null;
    });
  });

  _container.querySelectorAll('.kb-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      _dragging = { appId: card.dataset.id, fromStatut: card.dataset.statut };
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  _container.querySelectorAll('.kb-cv-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '⏳';
      const { data, error } = await _sb.storage.from('cvs').createSignedUrl(btn.dataset.cv, 3600);
      btn.disabled = false; btn.innerHTML = '📄 Voir le CV';
      if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank');
    });
  });

  const debouncedNote = debounce(async (appId, value) => {
    const ind = document.getElementById(`kb-note-saving-${appId}`);
    if (ind) ind.style.display = 'block';
    await _sb.from('applications').update({ note_recruteur: value }).eq('id', appId);
    if (ind) ind.style.display = 'none';
    const app = _apps.find(a => a.id === appId);
    if (app) app.note_recruteur = value;
  }, 900);

  _container.querySelectorAll('.kb-note').forEach(ta => {
    ta.addEventListener('input', () => debouncedNote(ta.dataset.appid, ta.value));
    ta.addEventListener('mousedown', e => e.stopPropagation());
  });

  _container.querySelectorAll('.kb-arrow-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const colIdx = COLONNES.findIndex(c => c.statut === btn.dataset.statut);
      const newCol = COLONNES[colIdx + parseInt(btn.dataset.move, 10)];
      if (newCol) moveCard(btn.dataset.appid, btn.dataset.statut, newCol.statut);
    });
  });
}

// ── Realtime ──────────────────────────────────────────────────────────────────

function setupRealtime() {
  // Nettoyer l'ancienne subscription
  if (_rtChannel) { _sb.removeChannel(_rtChannel); _rtChannel = null; }

  const jobIds = _jobs.map(j => j.id);
  if (!jobIds.length) return;

  _rtChannel = _sb.channel('kanban-' + _userId)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'applications',
    }, (payload) => {
      const updated = payload.new;
      // Ne traiter que les candidatures de nos offres
      if (!jobIds.includes(updated.job_id)) return;
      // Ignorer si c'est notre propre mise à jour (déjà appliquée en optimiste)
      const local = _apps.find(a => a.id === updated.id);
      if (!local || local.statut === updated.statut) return;

      // Mise à jour distante (autre recruteur du même compte)
      local.statut = updated.statut;
      if (updated.note_recruteur !== undefined) local.note_recruteur = updated.note_recruteur;
      _container.querySelector('.kb-board').innerHTML =
        COLONNES.map((_, i) => renderColumn(i)).join('');
      attachColumnEvents();
    })
    .subscribe();
}

// ── Init public ───────────────────────────────────────────────────────────────

async function init(supabase, containerId, userId) {
  _sb        = supabase;
  _userId    = userId;
  _container = document.getElementById(containerId);
  if (!_container) return;

  _container.innerHTML = `<div class="kb-loading"><div class="kb-spinner"></div> Chargement…</div>`;
  await loadJobs();
  await render();
}

window.kanban = { init };
