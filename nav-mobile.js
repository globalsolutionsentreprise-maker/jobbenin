/**
 * nav-mobile.js — Talenco.bj
 * Auto-inject hamburger + drawer sur les pages qui n'ont pas de menu mobile.
 * À inclure avant </body> sur toutes les pages utilisateurs.
 */
(function () {
  if (document.getElementById('nav-drawer')) return; // déjà présent

  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  // ── Bouton hamburger ──
  const toggle = document.createElement('button');
  toggle.className = 'navbar-toggle';
  toggle.id        = 'nav-toggle';
  toggle.setAttribute('aria-label', 'Menu');
  toggle.innerHTML = '<span></span><span></span><span></span>';
  navbar.appendChild(toggle);

  // ── Construire les liens du drawer depuis la navbar ──
  const existingLinks = Array.from(navbar.querySelectorAll('.navbar-links a'));
  const drawerLinksHtml = existingLinks.map(a => {
    const i18n = a.getAttribute('data-i18n') ? ` data-i18n="${a.getAttribute('data-i18n')}"` : '';
    return `<li><a href="${a.getAttribute('href')}"${i18n}>${a.textContent.trim()}</a></li>`;
  }).join('');

  // ── Ajouter l'action principale (dernier bouton navbar-actions) ──
  const actionBtn = navbar.querySelector('.navbar-actions a:not(#i18n-toggle), .navbar-actions button:not(#i18n-toggle):not(.lang-btn)');
  let actionHtml = '';
  if (actionBtn) {
    const href  = actionBtn.getAttribute('href') || '#';
    const label = actionBtn.textContent.trim();
    const i18n  = actionBtn.getAttribute('data-i18n') ? ` data-i18n="${actionBtn.getAttribute('data-i18n')}"` : '';
    actionHtml  = `<div style="margin-top:auto;padding-top:16px;border-top:1px solid var(--border);">
      <a href="${href}"${i18n} style="display:block;padding:12px;text-align:center;background:var(--text);color:var(--bg);border-radius:var(--radius-sm);font-size:13px;font-weight:600;font-family:var(--font-body);text-decoration:none;">${label}</a>
    </div>`;
  }

  // ── Injection du drawer ──
  const drawer = document.createElement('div');
  drawer.className = 'nav-drawer';
  drawer.id        = 'nav-drawer';
  drawer.innerHTML = `
    <div class="nav-drawer-overlay" id="nav-overlay"></div>
    <div class="nav-drawer-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-family:var(--font-serif);font-style:italic;font-size:18px;">Talenco<span style="color:var(--accent)">.</span>bj</span>
        <button class="nav-drawer-close" id="nav-close" aria-label="Fermer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <ul class="nav-drawer-links">${drawerLinksHtml}</ul>
      ${actionHtml}
    </div>
  `;
  document.body.appendChild(drawer);

  // ── Logique ouverture / fermeture ──
  function openDrawer()  { drawer.classList.add('open');    document.body.style.overflow = 'hidden'; }
  function closeDrawer() { drawer.classList.remove('open'); document.body.style.overflow = '';       }

  toggle.addEventListener('click', openDrawer);
  document.getElementById('nav-close').addEventListener('click', closeDrawer);
  document.getElementById('nav-overlay').addEventListener('click', closeDrawer);

  // Fermer si on clique un lien du drawer
  drawer.querySelectorAll('.nav-drawer-links a').forEach(a =>
    a.addEventListener('click', closeDrawer)
  );
})();
