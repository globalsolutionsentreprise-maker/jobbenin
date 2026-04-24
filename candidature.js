/**
 * candidature.js — Talenco
 * Module client : upload CV (candidat.html) + bouton Postuler 1 clic
 * (offres.html, offre-detail.html)
 *
 * Usage : <script src="/candidature.js"></script>
 * Nécessite que `supabase` (client Supabase initialisé) soit disponible
 * sur window.supabase ou passé en argument.
 */

const SUPABASE_URL  = 'https://ywteoxnkkdgdpbkrlkar.supabase.co';
const SITE_URL      = 'https://talenco.bj';
const CV_BUCKET     = 'cvs';
const MAX_CV_SIZE   = 5 * 1024 * 1024; // 5 Mo

// ════════════════════════════════════════════════════════════
// SECTION CANDIDAT.HTML — Upload CV
// ════════════════════════════════════════════════════════════

/**
 * Initialise la zone d'upload CV dans candidat.html.
 * @param {object} supabase  Client Supabase initialisé
 * @param {string} anchorId  ID de l'élément conteneur (ex: "mon-cv")
 *
 * Intégration dans candidat.html :
 *   <div id="mon-cv"></div>
 *   <script>
 *     supabase.auth.getSession().then(({ data: { session } }) => {
 *       if (session) candidature.initUploadCV(supabase, 'mon-cv');
 *     });
 *   </script>
 */
async function initUploadCV(supabase, anchorId = 'mon-cv') {
  const container = document.getElementById(anchorId);
  if (!container) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Récupérer l'état actuel du CV
  const { data: profile } = await supabase
    .from('users')
    .select('cv_path, cv_uploaded_at')
    .eq('id', user.id)
    .single();

  container.innerHTML = _buildUploadUI(profile);
  _attachUploadEvents(container, supabase, user.id);
}

function _buildUploadUI(profile) {
  const hasCv = !!profile?.cv_path;
  const uploadedAt = profile?.cv_uploaded_at
    ? new Date(profile.cv_uploaded_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return `
    <style>
      #cv-dropzone {
        border: 2px dashed #d1d5db;
        border-radius: 12px;
        padding: 32px 24px;
        text-align: center;
        cursor: pointer;
        transition: border-color 0.2s, background 0.2s;
        background: #fafafa;
        position: relative;
      }
      #cv-dropzone.dragover { border-color: #16a34a; background: #f0fdf4; }
      #cv-dropzone input[type="file"] {
        position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
      }
      .cv-status {
        margin-top: 14px;
        font-size: 13px;
        color: #6b7280;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .cv-status.ok { color: #15803d; }
      #btn-preview-cv {
        background: none;
        border: 1px solid #16a34a;
        color: #16a34a;
        border-radius: 6px;
        padding: 4px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      #btn-preview-cv:hover { background: #f0fdf4; }
      #cv-upload-msg {
        margin-top: 10px;
        font-size: 13px;
        padding: 8px 14px;
        border-radius: 8px;
        display: none;
      }
      #cv-upload-msg.ok    { background: #dcfce7; color: #15803d; display: block; }
      #cv-upload-msg.error { background: #fee2e2; color: #b91c1c; display: block; }
    </style>

    <div id="cv-dropzone">
      <input type="file" id="cv-file-input" accept="application/pdf">
      <div style="pointer-events:none;">
        <div style="font-size:28px;margin-bottom:10px;">📄</div>
        <p style="margin:0;font-size:14px;font-weight:600;color:#374151;">
          ${hasCv ? 'Remplacer votre CV' : 'Déposer votre CV ici'}
        </p>
        <p style="margin:6px 0 0 0;font-size:12px;color:#9ca3af;">
          PDF uniquement — 5 Mo maximum
        </p>
      </div>
    </div>

    <div class="cv-status ${hasCv ? 'ok' : ''}">
      ${hasCv
        ? `<span>✅ CV uploadé le ${uploadedAt}</span>
           <button id="btn-preview-cv" type="button">Prévisualiser</button>`
        : '<span>Aucun CV uploadé</span>'
      }
    </div>
    <div id="cv-upload-msg"></div>
  `;
}

function _attachUploadEvents(container, supabase, userId) {
  const dropzone  = container.querySelector('#cv-dropzone');
  const fileInput = container.querySelector('#cv-file-input');
  const msg       = container.querySelector('#cv-upload-msg');

  // Drag & drop visuel
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file) _handleCvFile(file, supabase, userId, msg, container);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) _handleCvFile(file, supabase, userId, msg, container);
  });

  // Prévisualisation
  const btnPreview = container.querySelector('#btn-preview-cv');
  if (btnPreview) {
    btnPreview.addEventListener('click', () => _previewCV(supabase, userId));
  }
}

async function _handleCvFile(file, supabase, userId, msgEl, container) {
  msgEl.className = '';
  msgEl.textContent = '';

  if (file.type !== 'application/pdf') {
    msgEl.className = 'error';
    msgEl.textContent = '❌ Seuls les fichiers PDF sont acceptés.';
    return;
  }
  if (file.size > MAX_CV_SIZE) {
    msgEl.className = 'error';
    msgEl.textContent = '❌ Le fichier dépasse la limite de 5 Mo.';
    return;
  }

  msgEl.className = '';
  msgEl.style.display = 'block';
  msgEl.style.background = '#f3f4f6';
  msgEl.style.color = '#374151';
  msgEl.textContent = '⏳ Upload en cours…';

  const cvPath = `${userId}/cv.pdf`;

  // Upload (upsert : remplace si déjà existant)
  const { error: uploadErr } = await supabase.storage
    .from(CV_BUCKET)
    .upload(cvPath, file, { contentType: 'application/pdf', upsert: true });

  if (uploadErr) {
    msgEl.className = 'error';
    msgEl.textContent = `❌ Erreur upload : ${uploadErr.message}`;
    return;
  }

  // Mettre à jour le profil
  const { error: updateErr } = await supabase
    .from('users')
    .update({ cv_path: cvPath, cv_uploaded_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateErr) {
    msgEl.className = 'error';
    msgEl.textContent = `❌ Erreur sauvegarde : ${updateErr.message}`;
    return;
  }

  msgEl.style.display = 'none';
  // Ré-afficher l'UI avec le nouvel état
  const { data: profile } = await supabase
    .from('users')
    .select('cv_path, cv_uploaded_at')
    .eq('id', userId)
    .single();

  container.innerHTML = _buildUploadUI(profile);
  _attachUploadEvents(container, supabase, userId);

  const newMsg = container.querySelector('#cv-upload-msg');
  newMsg.className = 'ok';
  newMsg.textContent = '✅ CV uploadé avec succès !';
}

async function _previewCV(supabase, userId) {
  const cvPath = `${userId}/cv.pdf`;
  const { data, error } = await supabase.storage
    .from(CV_BUCKET)
    .createSignedUrl(cvPath, 3600); // expire dans 1h

  if (error || !data?.signedUrl) {
    alert('Impossible d\'accéder au CV. Vérifiez que votre CV est bien uploadé.');
    return;
  }
  window.open(data.signedUrl, '_blank');
}

// ════════════════════════════════════════════════════════════
// SECTION OFFRES.HTML / OFFRE-DETAIL.HTML — Bouton Postuler
// ════════════════════════════════════════════════════════════

/**
 * Initialise le bouton "Postuler" sur une carte ou une page offre.
 * @param {object} supabase     Client Supabase initialisé
 * @param {string} jobId        UUID de l'offre
 * @param {string} containerId  ID de l'élément où rendre le bouton
 * @param {object} [opts]       Options optionnelles
 * @param {string} [opts.message] Lettre d'accompagnement pré-remplie
 *
 * Intégration dans offres.html (dans renderCard) :
 *   return `
 *     <div class="job-card">
 *       ...
 *       <div id="postuler-${offre.id}"></div>
 *     </div>`;
 *   // Puis après insertion dans le DOM :
 *   candidature.initPostulerBtn(supabase, offre.id, `postuler-${offre.id}`);
 *
 * Intégration dans offre-detail.html :
 *   <div id="postuler-btn"></div>
 *   // Après chargement de l'offre :
 *   candidature.initPostulerBtn(supabase, offre.id, 'postuler-btn');
 */
async function initPostulerBtn(supabase, jobId, containerId, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div style="height:36px"></div>'; // placeholder

  const { data: { user } } = await supabase.auth.getUser();

  // ── Non connecté ──────────────────────────────────────────
  if (!user) {
    container.innerHTML = _btnHtml('login', jobId);
    return;
  }

  // ── Profil candidat ───────────────────────────────────────
  const [profileRes, alreadyAppliedRes] = await Promise.all([
    supabase.from('users').select('cv_path').eq('id', user.id).single(),
    supabase.from('applications').select('id').eq('job_id', jobId).eq('user_id', user.id).maybeSingle(),
  ]);

  const hasCv         = !!profileRes.data?.cv_path;
  const alreadyApplied = !!alreadyAppliedRes.data;

  // ── Déjà postulé ──────────────────────────────────────────
  if (alreadyApplied) {
    container.innerHTML = _btnHtml('applied');
    return;
  }

  // ── Connecté mais sans CV ─────────────────────────────────
  if (!hasCv) {
    container.innerHTML = _btnHtml('no-cv');
    container.querySelector('#btn-postuler-nocv')?.addEventListener('click', () => {
      sessionStorage.setItem('cv-upload-notice', '1');
      window.location.href = `${SITE_URL}/candidat.html#mon-cv`;
    });
    return;
  }

  // ── Prêt à postuler ───────────────────────────────────────
  container.innerHTML = _btnHtml('ready');
  container.querySelector('#btn-postuler-1clic')?.addEventListener('click', () =>
    _soumettreCandidature(supabase, user, jobId, profileRes.data.cv_path, container, opts.message),
  );
}

function _btnHtml(state, jobId = '') {
  switch (state) {
    case 'login':
      return `<a href="${SITE_URL}/connexion.html?redirect=/offre-detail.html?id=${jobId}"
                 style="${_btnStyle('#6b7280')}text-decoration:none;display:inline-block;">
                🔑 Se connecter pour postuler
              </a>`;
    case 'no-cv':
      return `<button id="btn-postuler-nocv" type="button" style="${_btnStyle('#f59e0b')}">
                📎 Postuler (CV requis)
              </button>
              <p style="margin:6px 0 0 0;font-size:12px;color:#92400e;">
                Uploadez votre CV pour postuler en 1 clic
              </p>`;
    case 'applied':
      return `<button disabled type="button" style="${_btnStyle('#16a34a')}opacity:0.7;cursor:default;">
                ✅ Candidature envoyée
              </button>`;
    case 'ready':
      return `<button id="btn-postuler-1clic" type="button" style="${_btnStyle('#16a34a')}">
                ⚡ Postuler en 1 clic
              </button>`;
    case 'sending':
      return `<button disabled type="button" style="${_btnStyle('#16a34a')}opacity:0.7;">
                ⏳ Envoi en cours…
              </button>`;
    case 'done':
      return `<button disabled type="button" style="${_btnStyle('#16a34a')}opacity:0.85;cursor:default;">
                ✅ Candidature envoyée !
              </button>
              <p style="margin:6px 0 0 0;font-size:12px;color:#15803d;">
                Vous serez notifié(e) dès qu'elle sera consultée.
              </p>`;
    case 'error':
      return `<p style="font-size:13px;color:#b91c1c;">
                ❌ Erreur lors de l'envoi. Réessayez.
              </p>`;
  }
}

function _btnStyle(bg) {
  return `background:${bg};color:#fff;border:none;border-radius:8px;
          padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;
          display:inline-block;transition:opacity 0.15s;`;
}

async function _soumettreCandidature(supabase, user, jobId, cvPath, container, message) {
  container.innerHTML = _btnHtml('sending');

  // 1. Insérer la candidature
  const { data: app, error: insertErr } = await supabase
    .from('applications')
    .insert({
      job_id:  jobId,
      user_id: user.id,
      cv_path: cvPath,
      statut:  'envoyée',
      message: message ?? null,
    })
    .select('id')
    .single();

  if (insertErr) {
    // Doublon = déjà postulé (contrainte unique)
    if (insertErr.code === '23505') {
      container.innerHTML = _btnHtml('applied');
      return;
    }
    console.error('Candidature insert error:', insertErr);
    container.innerHTML = _btnHtml('error');
    return;
  }

  // 2. Déclencher la notification recruteur (fire-and-forget)
  fetch(`${SUPABASE_URL}/functions/v1/notify-application`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${window.SUPABASE_ANON_KEY ?? ''}`,
    },
    body: JSON.stringify({ application_id: app.id }),
  }).catch((err) => console.warn('Notification recruteur non critique:', err));

  // 3. Confirmation inline
  container.innerHTML = _btnHtml('done');
}

// ── Notice sur candidat.html après redirection sans CV ────────────────────

function afficherNoticeUpload(containerId = 'notice-cv-upload') {
  if (!sessionStorage.getItem('cv-upload-notice')) return;
  sessionStorage.removeItem('cv-upload-notice');

  const el = document.getElementById(containerId);
  if (!el) return;
  el.style.cssText = `
    background:#fef9c3;border:1px solid #fde047;border-radius:10px;
    padding:12px 16px;font-size:13px;color:#854d0e;margin-bottom:16px;
  `;
  el.textContent = '💡 Uploadez votre CV ci-dessous pour pouvoir postuler en 1 clic.';
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Export global ──────────────────────────────────────────────────────────

window.candidature = { initUploadCV, initPostulerBtn, afficherNoticeUpload };
