/**
 * badge-nouveau.js — Talenco
 * Badge "Nouveau" pour les offres de moins de 24h.
 *
 * Inclure dans chaque page : <script src="/badge-nouveau.js"></script>
 * L'objet global `badgeNouveau` expose toutes les fonctions.
 */

const SEUIL_MS = 86_400_000; // 24h en millisecondes

const CSS = `
.badge-nouveau {
  position: absolute;
  top: 10px;
  right: 10px;
  background: #16a34a;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 3px 8px;
  border-radius: 99px;
  letter-spacing: 0.03em;
  z-index: 10;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(22,163,74,0.25);
}
/* La carte doit être position:relative pour que le badge se positionne correctement */
.badge-nouveau-host {
  position: relative;
}
/* Filtre "Moins de 24h" — bouton dans la barre de filtres */
.filtre-nouveautes.actif {
  background: #16a34a !important;
  color: #ffffff !important;
  border-color: #16a34a !important;
}
`;

(function injecterCSS() {
  if (document.getElementById('badge-nouveau-css')) return;
  const el = document.createElement('style');
  el.id = 'badge-nouveau-css';
  el.textContent = CSS;
  document.head.appendChild(el);
})();

// ── Utilitaires ────────────────────────────────────────────────────────────

/** Retourne true si created_at est inférieur à 24h */
function isNew(created_at) {
  if (!created_at) return false;
  return Date.now() - new Date(created_at).getTime() < SEUIL_MS;
}

/**
 * Retourne le HTML du badge si l'offre est récente, sinon ''.
 * Utilisation dans un template literal :
 *   `<div class="job-card badge-nouveau-host">
 *      ${badgeNouveau.badge(offre.created_at)}
 *      ...
 *    </div>`
 */
function badge(created_at) {
  return isNew(created_at)
    ? '<span class="badge-nouveau" aria-label="Nouvelle offre">Nouveau</span>'
    : '';
}

/**
 * Texte relatif dynamique :
 *   < 1h  → "Publiée il y a 45 min"
 *   < 24h → "Publiée il y a 3h"
 *   = 1j  → "Publiée hier"
 *   > 1j  → "Publiée il y a 3 jours"
 */
function tempsRelatif(created_at) {
  if (!created_at) return '';
  const delta = Date.now() - new Date(created_at).getTime();
  const min  = Math.floor(delta / 60_000);
  const h    = Math.floor(delta / 3_600_000);
  const j    = Math.floor(delta / 86_400_000);

  if (min < 60)  return `Publiée il y a ${min} min`;
  if (h  < 24)   return `Publiée il y a ${h}h`;
  if (j  === 1)  return 'Publiée hier';
  return `Publiée il y a ${j} jours`;
}

// ── Filtre "Moins de 24h" (offres.html) ───────────────────────────────────

let _filtreNouveautesActif = false;

/**
 * Injecte le bouton "Moins de 24h" dans la barre de filtres.
 * @param {string} selecteurBarre  Sélecteur CSS de la barre de filtres existante
 * @param {Function} onToggle      Callback appelé après chaque toggle (re-lancer le rendu)
 */
function injecterFiltreNouveautes(selecteurBarre, onToggle) {
  const barre = document.querySelector(selecteurBarre);
  if (!barre || document.getElementById('btn-filtre-nouveautes')) return;

  const btn = document.createElement('button');
  btn.id = 'btn-filtre-nouveautes';
  btn.className = 'filtre-nouveautes'; // s'adapte aux classes existantes de la barre
  btn.setAttribute('type', 'button');
  btn.setAttribute('aria-pressed', 'false');
  btn.textContent = '🕐 Moins de 24h';

  btn.addEventListener('click', () => {
    _filtreNouveautesActif = !_filtreNouveautesActif;
    btn.classList.toggle('actif', _filtreNouveautesActif);
    btn.setAttribute('aria-pressed', String(_filtreNouveautesActif));
    if (typeof onToggle === 'function') onToggle(_filtreNouveautesActif);
  });

  barre.appendChild(btn);
}

/** Retourne true si le filtre "Moins de 24h" est actuellement actif */
function filtreActif() {
  return _filtreNouveautesActif;
}

/**
 * Filtre un tableau d'offres : si le filtre est actif, ne garde que <24h.
 * Combine avec les autres filtres secteur/ville sans les écraser.
 * @param {Array} offres  Tableau d'objets offre
 * @returns {Array}
 */
function filtrerOffres(offres) {
  if (!_filtreNouveautesActif) return offres;
  return offres.filter((o) => isNew(o.created_at));
}

// ── Export global ──────────────────────────────────────────────────────────

window.badgeNouveau = { isNew, badge, tempsRelatif, injecterFiltreNouveautes, filtreActif, filtrerOffres };
