'use strict';

const FT_TOKEN_URL  = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const FT_SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';

// Villes françaises → codes département
const DEPT_FR = {
  paris:'75', lyon:'69', marseille:'13', toulouse:'31', nice:'06',
  bordeaux:'33', lille:'59', strasbourg:'67', nantes:'44', montpellier:'34',
  rennes:'35', grenoble:'38', rouen:'76', toulon:'83', dijon:'21',
  angers:'49', brest:'29', reims:'51', metz:'57', nancy:'54',
  caen:'14', orleans:'45', limoges:'87', tours:'37', amiens:'80',
  perpignan:'66', mulhouse:'68', lorient:'56', chartres:'28', pau:'64',
};

const CONTRACT_FR = {
  CDI:'CDI', CDD:'CDD', MIS:'Intérim', SAI:'Saisonnier',
  LIB:'Libéral', PRO:'Professionnalisation', APP:'Apprentissage',
};

function norm(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,'');
}

function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
}

function err(msg, code) {
  return Object.assign(new Error(msg), { httpCode: code || 500 });
}

async function getFranceToken() {
  const id     = process.env.FRANCE_TRAVAIL_CLIENT_ID;
  const secret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;
  if (!id || !secret) throw err('FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET non configurés dans Vercel.', 503);
  const res = await fetch(FT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&scope=api_offresdemploiv2%20o2dsoffre`,
  });
  if (!res.ok) throw err(`France Travail auth: ${res.status}`, 502);
  const { access_token } = await res.json();
  return access_token;
}

async function searchFrance(q, ville) {
  const token  = await getFranceToken();
  const params = new URLSearchParams({ range: '0-14', sort: '1' });
  if (q) params.set('motsCles', q);

  const dept = DEPT_FR[norm(ville)];
  if (dept) {
    params.set('departement', dept);
  } else if (ville) {
    params.set('motsCles', q ? `${q} ${ville}` : ville);
  }

  const res = await fetch(`${FT_SEARCH_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw err(`France Travail API: ${res.status}`, 502);
  const data = await res.json();

  return (data.resultats || []).map(j => ({
    id:          j.id,
    title:       j.intitule,
    company:     j.entreprise?.nom || null,
    location:    j.lieuTravail?.libelle || null,
    description: stripHtml(j.description).substring(0, 240),
    url:         j.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${j.id}`,
    date:        j.dateCreation,
    source:      'France Travail',
    contract:    CONTRACT_FR[j.typeContrat] || j.typeContrat || null,
    salary:      j.salaire?.libelle || null,
  }));
}

async function searchUSA(q, ville) {
  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) throw err('ADZUNA_APP_ID / ADZUNA_APP_KEY non configurés dans Vercel.', 503);

  const params = new URLSearchParams({
    app_id: appId, app_key: appKey,
    results_per_page: '15',
    'content-type': 'application/json',
  });
  if (q)     params.set('what',  q);
  if (ville) params.set('where', ville);

  const res = await fetch(`https://api.adzuna.com/v1/api/jobs/us/search/1?${params}`);
  if (!res.ok) throw err(`Adzuna: ${res.status}`, 502);
  const data = await res.json();

  return (data.results || []).map(j => ({
    id:          j.id,
    title:       j.title,
    company:     j.company?.display_name || null,
    location:    j.location?.display_name || null,
    description: stripHtml(j.description).substring(0, 240),
    url:         j.redirect_url,
    date:        j.created,
    source:      'Adzuna',
    contract:    j.contract_time === 'full_time' ? 'Temps plein' : j.contract_time === 'part_time' ? 'Temps partiel' : null,
    salary:      j.salary_min && j.salary_max
                   ? `$${Math.round(j.salary_min/1000)}k – $${Math.round(j.salary_max/1000)}k / an`
                   : null,
  }));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).end();

  const { pays, q, ville } = req.query;
  if (!['fr', 'us'].includes(pays)) {
    return res.status(400).json({ error: 'Paramètre pays requis : fr ou us' });
  }

  try {
    const jobs = pays === 'fr' ? await searchFrance(q, ville) : await searchUSA(q, ville);
    res.status(200).json({ jobs, total: jobs.length });
  } catch (e) {
    console.error('[international]', e.message);
    res.status(e.httpCode || 500).json({ error: e.message });
  }
};
