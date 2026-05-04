#!/usr/bin/env node
/**
 * qa-test.js — Talenco.bj QA Test Suite
 * Tests : HTTP pages, JS assets, Supabase schema, API endpoints, devises logic
 */

const https = require('https');
const http  = require('http');

const BASE  = 'https://talenco-bj.vercel.app';
const SB    = 'https://ywteoxnkkdgdpbkrlkar.supabase.co';
const ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3dGVveG5ra2RnZHBia3Jsa2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MjA1MjYsImV4cCI6MjA5MDA5NjUyNn0.jzgNVgYR6iCEV_GIpvBTs4aN3RzK3E3MJW9YtBmLI3c';
const ADMIN = 'talenco2025';

let pass = 0, fail = 0, warn = 0;
const results = [];

// ── helpers ──────────────────────────────────────────────────────────────────
function get(url) {
  return new Promise((res, rej) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'apikey': ANON, 'Authorization': `Bearer ${ANON}` } }, (r) => {
      let body = '';
      r.on('data', d => body += d);
      r.on('end', () => res({ status: r.statusCode, body }));
    });
    req.on('error', rej);
    req.setTimeout(12000, () => { req.destroy(); rej(new Error('timeout')); });
  });
}

function post(url, data) {
  return new Promise((res, rej) => {
    const body   = JSON.stringify(data);
    const parsed = new URL(url);
    const opts   = {
      hostname: parsed.hostname,
      path:     parsed.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
                  'apikey': ANON, 'Authorization': `Bearer ${ANON}` }
    };
    const req = https.request(opts, (r) => {
      let b = '';
      r.on('data', d => b += d);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    });
    req.on('error', rej);
    req.setTimeout(12000, () => { req.destroy(); rej(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function ok(label, detail = '')   { pass++; results.push({ s: '✅', label, detail }); }
function ko(label, detail = '')   { fail++; results.push({ s: '❌', label, detail }); }
function wo(label, detail = '')   { warn++; results.push({ s: '⚠️ ', label, detail }); }

function section(title) {
  results.push({ s: '──', label: title, detail: '', section: true });
}

// ── TEST SUITES ───────────────────────────────────────────────────────────────

async function testPages() {
  section('PAGES HTML');
  const pages = [
    ['/', 'Accueil (index)'],
    ['/presentation.html', 'Page bêta'],
    ['/inscription.html', 'Inscription'],
    ['/connexion.html', 'Connexion'],
    ['/offres.html', 'Offres'],
    ['/offre-detail.html', 'Détail offre'],
    ['/ajouter-offre.html', 'Ajouter offre'],
    ['/candidat.html', 'Profil candidat'],
    ['/entreprises.html', 'Espace entreprise'],
    ['/entreprise-profil.html', 'Profil entreprise'],
    ['/cvtheque.html', 'CVthèque'],
    ['/bienvenue.html', 'Bienvenue'],
    ['/invitation-entreprise.html', 'Invitation entreprise'],
    ['/cgv.html', 'CGV'],
    ['/mentions-legales.html', 'Mentions légales'],
    ['/paiement-candidat.html', 'Paiement candidat'],
    ['/paiement-entreprise.html', 'Paiement entreprise'],
    ['/paiement-succes.html', 'Paiement succès'],
    ['/paiement-erreur.html', 'Paiement erreur'],
    ['/reactivation.html', 'Réactivation'],
    ['/admin.html', 'Admin dashboard'],
    ['/admin-analytics.html', 'Admin analytics'],
    ['/admin-invites.html', 'Admin invites'],
  ];
  for (const [path, label] of pages) {
    try {
      const r = await get(BASE + path);
      const expected = path === '/' ? [200, 307] : [200];
      expected.includes(r.status) ? ok(label, `HTTP ${r.status}`) : ko(label, `HTTP ${r.status}`);
    } catch(e) { ko(label, e.message); }
  }
}

async function testAssets() {
  section('ASSETS JS / CSS');
  const assets = [
    ['/design-system.css', 'Design system CSS'],
    ['/devises.js', 'Moteur devises'],
    ['/bug-report.js', 'Widget bug-report'],
    ['/nav-mobile.js', 'Nav mobile'],
    ['/badge-nouveau.js', 'Badge nouveau'],
  ];
  for (const [path, label] of assets) {
    try {
      const r = await get(BASE + path);
      if (r.status !== 200) { ko(label, `HTTP ${r.status}`); continue; }
      ok(label, `HTTP ${r.status}`);
    } catch(e) { ko(label, e.message); }
  }
}

async function testAssetContent() {
  section('CONTENU ASSETS');
  // devises.js
  try {
    const r = await get(BASE + '/devises.js');
    const checks = [
      ['renderTriple', 'devises.js — fonction renderTriple'],
      ['toFCFA',       'devises.js — fonction toFCFA'],
      ['655.957',      'devises.js — taux EUR fixe officiel'],
      ['USD',          'devises.js — devise USD'],
    ];
    for (const [needle, label] of checks) {
      r.body.includes(needle) ? ok(label) : ko(label, 'chaîne absente');
    }
  } catch(e) { ko('devises.js content', e.message); }

  // bug-report.js
  try {
    const r = await get(BASE + '/bug-report.js');
    const checks = [
      ['br-trigger',    'bug-report.js — bouton trigger'],
      ['bug_reports',   'bug-report.js — table Supabase'],
      ['Signaler',      'bug-report.js — texte bouton'],
      ['admin',        'bug-report.js — exclusion pages admin'],
    ];
    for (const [needle, label] of checks) {
      r.body.includes(needle) ? ok(label) : ko(label, 'chaîne absente');
    }
  } catch(e) { ko('bug-report.js content', e.message); }

  // nav-mobile.js
  try {
    const r = await get(BASE + '/nav-mobile.js');
    r.body.includes('nav-drawer') ? ok('nav-mobile.js — drawer injecté') : ko('nav-mobile.js — drawer absent');
    r.body.includes('navbar-toggle') ? ok('nav-mobile.js — hamburger toggle') : ko('nav-mobile.js — toggle absent');
  } catch(e) { ko('nav-mobile.js content', e.message); }
}

async function testPageContent() {
  section('CONTENU PAGES CLÉS');

  // inscription.html : diaspora + nav-mobile + bug-report
  try {
    const r = await get(BASE + '/inscription.html');
    [
      ['nav-mobile.js', 'inscription — nav-mobile injecté'],
      ['bug-report.js', 'inscription — bug-report injecté'],
      ['is-diaspora',   'inscription — champ diaspora opt-in'],
      ['TEST_PHASE_END','inscription — logique phase test'],
    ].forEach(([n, l]) => r.body.includes(n) ? ok(l) : ko(l));
  } catch(e) { ko('inscription.html content', e.message); }

  // offres.html : filtre diaspora + salary
  try {
    const r = await get(BASE + '/offres.html');
    [
      ['is_diaspora_open', 'offres — filtre diaspora dans requête'],
      ['is_remote',        'offres — filtre remote'],
      ['salary_min',       'offres — champ salaire dans select'],
      ['bug-report.js',    'offres — bug-report injecté'],
      ['devises.js',       'offres — devises.js chargé'],
    ].forEach(([n, l]) => r.body.includes(n) ? ok(l) : ko(l));
  } catch(e) { ko('offres.html content', e.message); }

  // ajouter-offre.html : salaire structuré + diaspora
  try {
    const r = await get(BASE + '/ajouter-offre.html');
    [
      ['champ-salary-min',      'ajouter-offre — input salary_min'],
      ['champ-salary-currency', 'ajouter-offre — sélecteur devise'],
      ['champ-diaspora',        'ajouter-offre — case diaspora'],
      ['champ-remote',          'ajouter-offre — case remote'],
      ['salary-preview',        'ajouter-offre — preview live devise'],
      ['devises.js',            'ajouter-offre — devises.js chargé'],
    ].forEach(([n, l]) => r.body.includes(n) ? ok(l) : ko(l));
  } catch(e) { ko('ajouter-offre.html content', e.message); }

  // offre-detail.html : triple devise + badges
  try {
    const r = await get(BASE + '/offre-detail.html');
    [
      ['salary_min',         'offre-detail — salary_min dans select'],
      ['is_diaspora_open',   'offre-detail — badge diaspora'],
      ['Devises.renderTriple','offre-detail — triple devise call'],
      ['bug-report.js',      'offre-detail — bug-report injecté'],
    ].forEach(([n, l]) => r.body.includes(n) ? ok(l) : ko(l));
  } catch(e) { ko('offre-detail.html content', e.message); }

  // admin-analytics.html : bugs section
  try {
    const r = await get(BASE + '/admin-analytics.html');
    [
      ['bkpi-bloquants', 'admin-analytics — KPI bloquants'],
      ['bugs-table',     'admin-analytics — table bugs'],
      ['loadBugs',       'admin-analytics — fonction loadBugs'],
      ['admin-bugs',     'admin-analytics — appel api/admin-bugs'],
    ].forEach(([n, l]) => r.body.includes(n) ? ok(l) : ko(l));
  } catch(e) { ko('admin-analytics.html content', e.message); }

  // presentation.html : countdown + bêta
  try {
    const r = await get(BASE + '/presentation.html');
    [
      ['2026-07-12',   'presentation — date fin bêta'],
      ['beta-badge',   'presentation — badge bêta'],
      ['cd-days',      'presentation — countdown jours'],
      ['nav-mobile.js','presentation — nav-mobile injecté'],
    ].forEach(([n, l]) => r.body.includes(n) ? ok(l) : ko(l));
  } catch(e) { ko('presentation.html content', e.message); }
}

async function testSupabaseTables() {
  section('SCHÉMA SUPABASE');

  const tables = [
    ['users',              'id,role,status,city,credits,subscription_end,is_diaspora,salary_currency_pref'],
    ['jobs',               'id,salary_min,salary_max,salary_currency,salary_period,is_diaspora_open,is_remote'],
    ['enterprise_invites', 'id,token,status,company_name'],
    ['bug_reports',        'id,bug_type,severity,status,description,page_name'],
    ['transactions',       'id,amount,type,status'],
  ];

  for (const [table, cols] of tables) {
    try {
      const r = await get(`${SB}/rest/v1/${table}?select=${cols}&limit=1`);
      if (r.status === 200) {
        ok(`Table ${table}`, `colonnes : ${cols.split(',').length} vérifiées`);
      } else {
        const parsed = JSON.parse(r.body);
        ko(`Table ${table}`, parsed.message || `HTTP ${r.status}`);
      }
    } catch(e) { ko(`Table ${table}`, e.message); }
  }
}

async function testApiEndpoints() {
  section('API ENDPOINTS');

  // generate-invites
  try {
    const r = await post(`${BASE}/api/generate-invites`, { secret: ADMIN });
    const d = JSON.parse(r.body);
    (r.status === 200 && (d.success || d.already_done || d.message))
      ? ok('POST /api/generate-invites', d.message || `${d.created || 0} créés`)
      : ko('POST /api/generate-invites', `HTTP ${r.status} — ${r.body.slice(0, 80)}`);
  } catch(e) { ko('POST /api/generate-invites', e.message); }

  // admin-bugs — liste
  try {
    const r = await post(`${BASE}/api/admin-bugs`, { secret: ADMIN });
    const d = JSON.parse(r.body);
    (r.status === 200 && Array.isArray(d.bugs))
      ? ok('POST /api/admin-bugs (liste)', `${d.bugs.length} rapport(s)`)
      : ko('POST /api/admin-bugs (liste)', `HTTP ${r.status}`);
  } catch(e) { ko('POST /api/admin-bugs', e.message); }

  // admin-bugs — auth check
  try {
    const r = await post(`${BASE}/api/admin-bugs`, { secret: 'MAUVAIS_MDP' });
    r.status === 401
      ? ok('POST /api/admin-bugs auth guard', 'Rejet 401 correct')
      : ko('POST /api/admin-bugs auth guard', `Attendu 401, reçu ${r.status}`);
  } catch(e) { ko('POST /api/admin-bugs auth guard', e.message); }

  // enterprise-invite-setup — validation token invalide
  try {
    const r = await post(`${BASE}/api/enterprise-invite-setup`, {
      token: '00000000-0000-0000-0000-000000000000',
      company: 'Test', prenom: 'A', nom: 'B',
      email: 'test@test.com', password: 'testpassword'
    });
    (r.status === 404 || r.status === 409)
      ? ok('POST /api/enterprise-invite-setup (token invalide)', `Rejet ${r.status} correct`)
      : wo('POST /api/enterprise-invite-setup', `HTTP ${r.status} — comportement inattendu`);
  } catch(e) { ko('POST /api/enterprise-invite-setup', e.message); }

  // check-inactivity (GET)
  try {
    const r = await get(`${BASE}/api/payment/check-inactivity`);
    r.status === 200
      ? ok('GET /api/payment/check-inactivity', `HTTP ${r.status}`)
      : wo('GET /api/payment/check-inactivity', `HTTP ${r.status} — cron peut nécessiter header auth`);
  } catch(e) { ko('GET /api/payment/check-inactivity', e.message); }
}

async function testDevisesLogic() {
  section('LOGIQUE CONVERSION DEVISE (locale)');
  // On simule le moteur Devises directement
  const RATES = { FCFA: 1, EUR: 655.957, USD: 600 };
  const toFCFA    = (a, c) => Math.round(a * RATES[c]);
  const fromFCFA  = (a, c) => Math.round(a / RATES[c]);

  const tests = [
    [() => toFCFA(100, 'FCFA') === 100,            '100 FCFA → 100 FCFA'],
    [() => toFCFA(1, 'EUR') === 656,               '1 EUR → 656 FCFA'],
    [() => toFCFA(1, 'USD') === 600,               '1 USD → 600 FCFA'],
    [() => fromFCFA(655957, 'EUR') === 1000,       '655 957 FCFA → 1 000 EUR'],
    [() => fromFCFA(600000, 'USD') === 1000,       '600 000 FCFA → 1 000 USD'],
    [() => toFCFA(300000, 'FCFA') === 300000,      'Salaire 300k FCFA conservé'],
    [() => fromFCFA(toFCFA(500, 'EUR'), 'EUR') === 500, 'Aller-retour EUR stable'],
  ];

  for (const [fn, label] of tests) {
    try { fn() ? ok(label) : ko(label, 'résultat incorrect'); }
    catch(e) { ko(label, e.message); }
  }
}

async function testMobileNav() {
  section('MOBILE — nav-mobile.js injecté');
  // offres.html a un drawer mobile natif inline (pas nav-mobile.js externe)
  const mobilePages = [
    '/inscription.html', '/connexion.html', '/presentation.html',
    '/invitation-entreprise.html', '/cgv.html', '/paiement-candidat.html',
    '/paiement-entreprise.html', '/bienvenue.html',
  ];
  for (const path of mobilePages) {
    try {
      const r = await get(BASE + path);
      r.body.includes('nav-mobile.js')
        ? ok(path.replace('/', ''), 'nav-mobile.js présent')
        : ko(path.replace('/', ''), 'nav-mobile.js ABSENT');
    } catch(e) { ko(path, e.message); }
  }
  // offres.html : drawer natif inline
  try {
    const r = await get(BASE + '/offres.html');
    r.body.includes('nav-drawer')
      ? ok('offres.html', 'drawer mobile natif intégré')
      : ko('offres.html', 'aucun drawer mobile');
  } catch(e) { ko('offres.html mobile', e.message); }
}

async function testBugReportInject() {
  section('BUG-REPORT — widget injecté (pages utilisateurs)');
  const pages = [
    '/offres.html', '/offre-detail.html', '/ajouter-offre.html',
    '/inscription.html', '/connexion.html', '/invitation-entreprise.html',
  ];
  for (const path of pages) {
    try {
      const r = await get(BASE + path);
      r.body.includes('bug-report.js')
        ? ok(path.replace('/', ''), 'bug-report.js présent')
        : ko(path.replace('/', ''), 'bug-report.js ABSENT');
    } catch(e) { ko(path, e.message); }
  }
  // Admin : ne doit PAS avoir le widget
  try {
    const r = await get(BASE + '/admin.html');
    !r.body.includes('bug-report.js')
      ? ok('admin.html', 'bug-report.js correctement absent')
      : wo('admin.html', 'bug-report.js présent — logique exclusion admin à vérifier');
  } catch(e) {}
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(64));
  console.log('  TALENCO.BJ — QA TEST SUITE');
  console.log('  ' + new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Porto-Novo' }) + ' (heure Bénin)');
  console.log('═'.repeat(64) + '\n');

  await testPages();
  await testAssets();
  await testAssetContent();
  await testPageContent();
  await testSupabaseTables();
  await testApiEndpoints();
  await testDevisesLogic();
  await testMobileNav();
  await testBugReportInject();

  // ── Rapport ──
  console.log('');
  let currentSection = '';
  for (const r of results) {
    if (r.section) {
      console.log('\n' + '─'.repeat(54));
      console.log(`  ${r.label}`);
      console.log('─'.repeat(54));
    } else {
      const detail = r.detail ? `  (${r.detail})` : '';
      console.log(`  ${r.s}  ${r.label}${detail}`);
    }
  }

  const total = pass + fail + warn;
  const pct   = total > 0 ? Math.round(pass / total * 100) : 0;

  console.log('\n' + '═'.repeat(64));
  console.log(`  RÉSULTATS FINAUX`);
  console.log('─'.repeat(64));
  console.log(`  ✅  Passés   : ${pass}`);
  console.log(`  ❌  Échoués  : ${fail}`);
  console.log(`  ⚠️   Warnings : ${warn}`);
  console.log(`  📊  Score    : ${pct}% (${pass}/${total})`);
  console.log('═'.repeat(64));

  if (fail === 0) {
    console.log('\n  🚀  Plateforme prête. Aucun blocant détecté.\n');
  } else {
    console.log(`\n  ⛔  ${fail} test(s) en échec — voir détails ci-dessus.\n`);
  }
}

main().catch(console.error);
