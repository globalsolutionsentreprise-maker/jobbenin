'use strict';

// Dispatche :
//   GET  /api/jobs?type=international&pays=fr|us  → offres internationales
//   POST /api/jobs  action=score                  → scoring IA candidature
//   POST /api/jobs  action=subscribe|…            → alertes emploi

const { createClient } = require('@supabase/supabase-js');
const { supabase }     = require('../../lib/supabase');
const { sendMail }     = require('../../lib/mailer');
const pdf              = require('pdf-parse');

const SITE_URL = process.env.SITE_URL || 'https://talenco-bj.vercel.app';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ══════════════════════════════════════════════════════════════════════════════
// INTERNATIONAL (France Travail + Adzuna)
// ══════════════════════════════════════════════════════════════════════════════

const FT_TOKEN_URL  = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const FT_SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';

const DEPT_FR = {
  paris:'75', lyon:'69', marseille:'13', toulouse:'31', nice:'06',
  bordeaux:'33', lille:'59', strasbourg:'67', nantes:'44', montpellier:'34',
  rennes:'35', grenoble:'38', rouen:'76', toulon:'83', dijon:'21',
  angers:'49', brest:'29', reims:'51', metz:'57', nancy:'54',
  caen:'14', orleans:'45', limoges:'87', tours:'37', amiens:'80',
  perpignan:'66', mulhouse:'68', lorient:'56', chartres:'28', pau:'64',
};
const CONTRACT_FR = { CDI:'CDI', CDD:'CDD', MIS:'Intérim', SAI:'Saisonnier', LIB:'Libéral', PRO:'Professionnalisation', APP:'Apprentissage' };

function norm(str) { return (str||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,''); }
function stripHtml(str) { return (str||'').replace(/<[^>]*>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim(); }
function apiErr(msg, code) { return Object.assign(new Error(msg), { httpCode: code || 500 }); }

async function getFranceToken() {
  const id = process.env.FRANCE_TRAVAIL_CLIENT_ID;
  const secret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;
  if (!id || !secret) throw apiErr('FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET non configurés.', 503);
  const res = await fetch(FT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&scope=api_offresdemploiv2%20o2dsoffre`,
  });
  if (!res.ok) throw apiErr(`France Travail auth: ${res.status}`, 502);
  const { access_token } = await res.json();
  return access_token;
}

async function searchFrance(q, ville) {
  const token = await getFranceToken();
  const params = new URLSearchParams({ range: '0-14', sort: '1' });
  if (q) params.set('motsCles', q);
  const dept = DEPT_FR[norm(ville)];
  if (dept) params.set('departement', dept);
  else if (ville) params.set('motsCles', q ? `${q} ${ville}` : ville);
  const res = await fetch(`${FT_SEARCH_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw apiErr(`France Travail API: ${res.status}`, 502);
  const data = await res.json();
  return (data.resultats || []).map(j => ({
    id: j.id, title: j.intitule, company: j.entreprise?.nom || null,
    location: j.lieuTravail?.libelle || null,
    description: stripHtml(j.description).substring(0, 240),
    url: j.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${j.id}`,
    date: j.dateCreation, source: 'France Travail',
    contract: CONTRACT_FR[j.typeContrat] || j.typeContrat || null,
    salary: j.salaire?.libelle || null,
  }));
}

async function searchUSA(q, ville) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) throw apiErr('ADZUNA_APP_ID / ADZUNA_APP_KEY non configurés.', 503);
  const params = new URLSearchParams({ app_id: appId, app_key: appKey, results_per_page: '15', 'content-type': 'application/json' });
  if (q) params.set('what', q);
  if (ville) params.set('where', ville);
  const res = await fetch(`https://api.adzuna.com/v1/api/jobs/us/search/1?${params}`);
  if (!res.ok) throw apiErr(`Adzuna: ${res.status}`, 502);
  const data = await res.json();
  return (data.results || []).map(j => ({
    id: j.id, title: j.title, company: j.company?.display_name || null,
    location: j.location?.display_name || null,
    description: stripHtml(j.description).substring(0, 240),
    url: j.redirect_url, date: j.created, source: 'Adzuna',
    contract: j.contract_time === 'full_time' ? 'Temps plein' : j.contract_time === 'part_time' ? 'Temps partiel' : null,
    salary: j.salary_min && j.salary_max ? `$${Math.round(j.salary_min/1000)}k – $${Math.round(j.salary_max/1000)}k / an` : null,
  }));
}

async function handleInternational(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  const { pays, q, ville } = req.query;
  if (!['fr', 'us'].includes(pays)) return res.status(400).json({ error: 'Paramètre pays requis : fr ou us' });
  try {
    const jobs = pays === 'fr' ? await searchFrance(q, ville) : await searchUSA(q, ville);
    return res.status(200).json({ jobs, total: jobs.length });
  } catch (e) {
    console.error('[international]', e.message);
    return res.status(e.httpCode || 500).json({ error: e.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SCORE APPLICATION (IA Groq)
// ══════════════════════════════════════════════════════════════════════════════

async function handleScore(req, res) {
  const { application_id } = req.body ?? {};
  if (!application_id) return res.status(400).json({ error: 'application_id requis' });

  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, user_id, cv_path, message, jobs ( titre, title, description, competences_requises ), users!applications_user_id_fkey ( email )')
    .eq('id', application_id).single();

  if (appErr || !app) return res.status(404).json({ error: 'Candidature introuvable' });

  const job = app.jobs ?? {};
  const jobTitre = job.titre ?? job.title ?? '';
  let cvText = '';
  const cvPath = app.cv_path ?? `${app.user_id}/cv.pdf`;
  try {
    const { data: urlData } = await supabase.storage.from('cvs').createSignedUrl(cvPath, 120);
    if (urlData?.signedUrl) {
      const pdfBuf = await fetch(urlData.signedUrl).then(r => r.arrayBuffer());
      const parsed = await pdf(Buffer.from(pdfBuf));
      cvText = parsed.text.replace(/\s+/g, ' ').trim().substring(0, 4000);
    }
  } catch (e) { console.warn('PDF parse:', e.message); }

  const prompt = `Tu es un expert RH senior. Évalue l'adéquation entre ce candidat et ce poste.
Réponds UNIQUEMENT avec du JSON valide.

=== POSTE ===
Titre : ${jobTitre}
Description : ${(job.description??'').substring(0,1200)}
Compétences : ${(job.competences_requises??'').substring(0,600)}

=== CANDIDAT ===
${cvText ? `CV :\n${cvText}` : '(CV non parsable)'}
${app.message ? `\nMotivation :\n${app.message.substring(0,600)}` : ''}

=== FORMAT ===
{"score":<0-100>,"breakdown":{"experience":<0-100>,"competences":<0-100>,"formation":<0-100>},"explication":"<2 phrases>"}`;

  let scoring;
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 300, temperature: 0.1, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: 'Expert RH. JSON uniquement.' }, { role: 'user', content: prompt }] }),
    });
    if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`);
    const raw = (await groqRes.json()).choices?.[0]?.message?.content ?? '{}';
    scoring = JSON.parse(raw.replace(/^```json?\s*/i,'').replace(/\s*```$/,''));
  } catch (e) {
    console.error('score-application:', e.message);
    return res.status(500).json({ error: 'Erreur scoring IA' });
  }

  const finalScore = Math.min(100, Math.max(0, parseInt(scoring.score, 10) || 0));
  const { error: updateErr } = await supabase.from('applications').update({
    match_score: finalScore, match_breakdown: scoring.breakdown ?? {}, match_explanation: scoring.explication ?? '',
  }).eq('id', application_id);

  if (updateErr) return res.status(500).json({ error: 'Erreur sauvegarde score' });
  return res.status(200).json({ ok: true, score: finalScore });
}

// ══════════════════════════════════════════════════════════════════════════════
// ALERTES EMPLOI
// ══════════════════════════════════════════════════════════════════════════════

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user ?? null;
}

async function handleAlerts(req, res) {
  const { action } = req.body ?? {};

  if (action === 'list' || action === 'subscribe' || action === 'unsubscribe') {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Connexion requise.' });

    if (action === 'list') {
      const { data, error } = await supabaseAdmin.from('job_alerts')
        .select('id, keywords, ville, created_at').eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ alerts: data ?? [] });
    }

    if (action === 'subscribe') {
      const { keywords, ville } = req.body;
      if (!keywords?.trim()) return res.status(400).json({ error: 'Mots-clés requis.' });
      const { error } = await supabaseAdmin.from('job_alerts').upsert({
        user_id: user.id, keywords: keywords.trim().toLowerCase(), ville: ville?.trim().toLowerCase() || null,
      }, { onConflict: 'user_id,keywords,ville' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    if (action === 'unsubscribe') {
      const { alert_id } = req.body;
      if (!alert_id) return res.status(400).json({ error: 'alert_id requis.' });
      await supabaseAdmin.from('job_alerts').delete().eq('id', alert_id).eq('user_id', user.id);
      return res.status(200).json({ success: true });
    }
  }

  if (action === 'notify') {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Connexion requise.' });
    const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ error: 'Admin requis.' });

    const { job_id } = req.body ?? {};
    if (!job_id) return res.status(400).json({ error: 'job_id requis.' });

    const { data: job } = await supabaseAdmin.from('jobs')
      .select('id, titre, ville, description, entreprise').eq('id', job_id).single();
    if (!job) return res.status(404).json({ error: 'Offre introuvable.' });

    const jobText = `${job.titre} ${job.ville ?? ''} ${job.description ?? ''}`.toLowerCase();
    const { data: alerts } = await supabaseAdmin.from('job_alerts')
      .select('id, user_id, keywords, ville, users!job_alerts_user_id_fkey(email)');
    if (!alerts?.length) return res.status(200).json({ sent: 0 });

    const matching = alerts.filter(a => {
      const kwMatch    = jobText.includes(a.keywords);
      const villeMatch = !a.ville || (job.ville ?? '').toLowerCase().includes(a.ville);
      return kwMatch && villeMatch;
    });

    let sent = 0;
    for (const alert of matching) {
      const email = alert.users?.email;
      if (!email) continue;
      const offreUrl = `${SITE_URL}/offre-detail.html?id=${job.id}`;
      const titre    = (job.titre ?? 'Offre d\'emploi').replace(/</g, '&lt;');
      const entreprise = (job.entreprise ?? '').replace(/</g, '&lt;');
      try {
        await sendMail({
          to: email,
          subject: `🔔 Nouvelle offre : ${job.titre} — Talenco.bj`,
          html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
            <div style="background:#8B4513;border-radius:10px 10px 0 0;padding:20px 28px;text-align:center;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Talenco.bj 🇧🇯</p>
              <p style="margin:4px 0 0;font-size:12px;color:#f5deb3;">Alerte emploi — "${alert.keywords}"</p>
            </div>
            <div style="background:#fff;padding:24px 28px;border:1px solid #e8e0d5;border-top:none;">
              <h2 style="font-size:17px;margin:0 0 6px;color:#1a1a1a;">${titre}</h2>
              <p style="font-size:13px;color:#8B4513;font-weight:600;margin:0 0 16px;">${entreprise}${job.ville ? ` · ${job.ville}` : ''}</p>
              <a href="${offreUrl}" style="display:inline-block;background:#8B4513;color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:600;">Voir l'offre →</a>
            </div>
            <div style="background:#f9f6f1;border:1px solid #e8e0d5;border-top:none;border-radius:0 0 10px 10px;padding:12px 28px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#aaa;">Talenco.bj — <a href="${SITE_URL}/candidat.html#alertes" style="color:#8B4513;">Gérer mes alertes</a></p>
            </div>
          </div>`,
        });
        sent++;
      } catch (e) { console.warn('alert email:', e.message); }
    }
    return res.status(200).json({ sent, total: matching.length });
  }

  return res.status(400).json({ error: 'action invalide' });
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTER PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET → offres internationales
  if (req.method === 'GET') return handleInternational(req, res);

  // POST → dispatcher sur action
  if (req.method === 'POST') {
    const { action } = req.body ?? {};
    if (action === 'score') return handleScore(req, res);
    return handleAlerts(req, res);
  }

  return res.status(405).end();
};
