/**
 * bug-report.js — Talenco.bj
 * Widget flottant de remontée de bugs structurée.
 * S'auto-injecte sur toutes les pages utilisateurs.
 */
(function () {
  'use strict';

  const SUPABASE_URL      = 'https://ywteoxnkkdgdpbkrlkar.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3dGVveG5ra2RnZHBia3Jsa2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MjA1MjYsImV4cCI6MjA5MDA5NjUyNn0.jzgNVgYR6iCEV_GIpvBTs4aN3RzK3E3MJW9YtBmLI3c';

  // Ne pas afficher sur les pages admin
  if (window.location.pathname.includes('admin')) return;

  const PAGE_NAMES = {
    '/':                        'Accueil',
    '/index.html':              'Accueil',
    '/offres.html':             'Offres',
    '/offre-detail.html':       'Détail offre',
    '/candidat.html':           'Mon profil candidat',
    '/entreprises.html':        'Espace entreprise',
    '/entreprise-profil.html':  'Profil entreprise',
    '/ajouter-offre.html':      'Publier une offre',
    '/cvtheque.html':           'CVthèque',
    '/inscription.html':        'Inscription',
    '/connexion.html':          'Connexion',
    '/presentation.html':       'Présentation bêta',
    '/invitation-entreprise.html': 'Invitation entreprise',
    '/paiement-candidat.html':  'Paiement candidat',
    '/paiement-entreprise.html':'Paiement entreprise',
    '/paiement-succes.html':    'Succès paiement',
    '/paiement-erreur.html':    'Erreur paiement',
    '/bienvenue.html':          'Bienvenue',
    '/cgv.html':                'CGV',
    '/coach.html':              'Coach emploi',
  };

  const pageName = PAGE_NAMES[window.location.pathname] || window.location.pathname;

  // ── CSS ──
  const style = document.createElement('style');
  style.textContent = `
    #br-trigger {
      position: fixed; bottom: 24px; left: 24px; z-index: 9998;
      background: #1A1A1A; color: #fff;
      border: none; border-radius: 999px;
      padding: 9px 16px 9px 12px;
      display: flex; align-items: center; gap: 8px;
      font-family: 'Hanken Grotesk', system-ui, sans-serif;
      font-size: 12px; font-weight: 500;
      cursor: pointer; box-shadow: 0 2px 12px rgba(0,0,0,.18);
      transition: transform .15s, box-shadow .15s;
      opacity: .85;
    }
    #br-trigger:hover { transform: translateY(-2px); box-shadow: 0 4px 18px rgba(0,0,0,.22); opacity: 1; }
    #br-trigger svg { flex-shrink: 0; }

    #br-panel {
      position: fixed; bottom: 72px; left: 24px; z-index: 9999;
      width: min(340px, calc(100vw - 32px));
      background: #fff; border: 1px solid #E0D8CF;
      border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,.14);
      font-family: 'Hanken Grotesk', system-ui, sans-serif;
      display: none; flex-direction: column;
      overflow: hidden;
    }
    #br-panel.open { display: flex; }

    .br-header {
      background: #1A1A1A; color: #fff;
      padding: 16px 18px; display: flex; align-items: center; justify-content: space-between;
    }
    .br-header-left { display: flex; align-items: center; gap: 10px; }
    .br-header-title { font-size: 13px; font-weight: 600; }
    .br-header-sub { font-size: 10px; opacity: .55; margin-top: 1px; }
    .br-close {
      background: none; border: none; color: rgba(255,255,255,.6);
      cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;
      border-radius: 4px; transition: background .15s;
    }
    .br-close:hover { background: rgba(255,255,255,.1); color: #fff; }

    .br-body { padding: 18px; display: flex; flex-direction: column; gap: 12px; }

    .br-label {
      font-size: 10px; font-weight: 600; letter-spacing: .07em;
      text-transform: uppercase; color: #706050; margin-bottom: 4px; display: block;
    }
    .br-select, .br-textarea, .br-input {
      width: 100%; font-family: inherit; font-size: 12px;
      border: 1px solid #E0D8CF; border-radius: 8px;
      background: #FAF8F5; color: #1A1A1A;
      padding: 9px 11px; box-sizing: border-box;
      transition: border-color .15s;
    }
    .br-select:focus, .br-textarea:focus, .br-input:focus {
      outline: none; border-color: #8B4513;
    }
    .br-textarea { resize: vertical; min-height: 80px; line-height: 1.55; }

    .br-severity-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .br-sev-btn {
      padding: 5px 11px; font-size: 11px; font-weight: 500;
      border: 1px solid #E0D8CF; border-radius: 999px;
      background: #FAF8F5; color: #706050;
      cursor: pointer; transition: all .12s; font-family: inherit;
    }
    .br-sev-btn.active { border-color: #8B4513; background: #8B4513; color: #fff; }

    .br-page-info {
      font-size: 10px; color: #A09080;
      background: #F5F0EB; border-radius: 6px;
      padding: 7px 10px; display: flex; align-items: center; gap: 6px;
    }

    .br-submit {
      width: 100%; padding: 11px;
      background: #1A1A1A; color: #fff;
      border: none; border-radius: 8px;
      font-family: inherit; font-size: 13px; font-weight: 500;
      cursor: pointer; transition: opacity .15s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .br-submit:hover { opacity: .88; }
    .br-submit:disabled { opacity: .4; cursor: default; }

    .br-success {
      padding: 32px 18px; text-align: center;
      display: none; flex-direction: column; align-items: center; gap: 10px;
    }
    .br-success.show { display: flex; }
    .br-success-icon {
      width: 44px; height: 44px; border-radius: 50%;
      background: #F0F9F0; display: flex; align-items: center; justify-content: center;
      color: #2E7D32;
    }
    .br-success-title { font-weight: 600; font-size: 14px; }
    .br-success-sub { font-size: 12px; color: #706050; line-height: 1.5; }
    .br-success-close {
      padding: 9px 20px; background: #1A1A1A; color: #fff;
      border: none; border-radius: 8px; font-family: inherit;
      font-size: 12px; font-weight: 500; cursor: pointer; margin-top: 4px;
    }
  `;
  document.head.appendChild(style);

  // ── HTML ──
  const trigger = document.createElement('button');
  trigger.id = 'br-trigger';
  trigger.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    Signaler un bug
  `;

  const panel = document.createElement('div');
  panel.id = 'br-panel';
  panel.innerHTML = `
    <div class="br-header">
      <div class="br-header-left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div>
          <div class="br-header-title">Signaler un problème</div>
          <div class="br-header-sub">Phase bêta — votre retour nous aide</div>
        </div>
      </div>
      <button class="br-close" id="br-close-btn" aria-label="Fermer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div class="br-body" id="br-form-body">
      <div class="br-page-info">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Page : <strong>${pageName}</strong>
      </div>

      <div>
        <label class="br-label">Type de problème</label>
        <select class="br-select" id="br-type">
          <option value="">Choisir…</option>
          <option value="affichage">Problème d'affichage</option>
          <option value="fonctionnalite">Fonctionnalité qui ne marche pas</option>
          <option value="erreur">Message d'erreur inattendu</option>
          <option value="lenteur">Lenteur / chargement</option>
          <option value="autre">Autre</option>
        </select>
      </div>

      <div>
        <label class="br-label">Sévérité</label>
        <div class="br-severity-row">
          <button class="br-sev-btn" data-sev="bloquant">Bloquant</button>
          <button class="br-sev-btn active" data-sev="normale">Normale</button>
          <button class="br-sev-btn" data-sev="mineure">Mineure</button>
        </div>
      </div>

      <div>
        <label class="br-label">Description <span style="color:#8B4513">*</span></label>
        <textarea class="br-textarea" id="br-desc" placeholder="Décrivez ce que vous faisiez et ce qui s'est passé…"></textarea>
      </div>

      <div id="br-msg" style="font-size:11px;color:#C62828;display:none;"></div>

      <button class="br-submit" id="br-submit-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Envoyer le rapport
      </button>
    </div>

    <div class="br-success" id="br-success">
      <div class="br-success-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="br-success-title">Rapport envoyé</div>
      <p class="br-success-sub">Merci pour votre retour. Nous allons examiner ce problème dans les meilleurs délais.</p>
      <button class="br-success-close" id="br-success-close">Fermer</button>
    </div>
  `;

  document.body.appendChild(trigger);
  document.body.appendChild(panel);

  // ── Logique ──
  let selectedSeverity = 'normale';

  trigger.addEventListener('click', () => {
    panel.classList.toggle('open');
  });
  document.getElementById('br-close-btn').addEventListener('click', () => {
    panel.classList.remove('open');
  });
  document.getElementById('br-success-close').addEventListener('click', () => {
    panel.classList.remove('open');
    // reset
    setTimeout(() => {
      document.getElementById('br-success').classList.remove('show');
      document.getElementById('br-form-body').style.display = 'flex';
      document.getElementById('br-desc').value = '';
      document.getElementById('br-type').value = '';
    }, 300);
  });

  panel.querySelectorAll('.br-sev-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.br-sev-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSeverity = btn.dataset.sev;
    });
  });

  document.getElementById('br-submit-btn').addEventListener('click', async () => {
    const type = document.getElementById('br-type').value;
    const desc = document.getElementById('br-desc').value.trim();
    const msgEl = document.getElementById('br-msg');

    if (!type) { msgEl.textContent = 'Choisissez un type de problème.'; msgEl.style.display = 'block'; return; }
    if (!desc)  { msgEl.textContent = 'Décrivez le problème rencontré.'; msgEl.style.display = 'block'; return; }
    msgEl.style.display = 'none';

    const btn = document.getElementById('br-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> Envoi…';

    // Récupérer session Supabase si disponible
    let userEmail = null;
    let userId    = null;
    let userRole  = null;
    try {
      if (window.supabase && window._sb) {
        const { data: { session } } = await window._sb.auth.getSession();
        if (session) {
          userId    = session.user.id;
          userEmail = session.user.email;
        }
      }
    } catch(e) {}

    const payload = {
      user_id:    userId,
      user_email: userEmail,
      user_role:  userRole,
      page_url:   window.location.href,
      page_name:  pageName,
      bug_type:   type,
      description:desc,
      severity:   selectedSeverity,
      status:     'ouvert'
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/bug_reports`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer':         'return=minimal'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok || res.status === 201) {
        document.getElementById('br-form-body').style.display = 'none';
        document.getElementById('br-success').classList.add('show');
      } else {
        const err = await res.json().catch(() => ({}));
        msgEl.textContent = 'Erreur d\'envoi. Code : ' + res.status;
        msgEl.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = 'Envoyer le rapport';
      }
    } catch(e) {
      msgEl.textContent = 'Erreur réseau. Vérifiez votre connexion.';
      msgEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = 'Envoyer le rapport';
    }
  });
})();
