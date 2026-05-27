'use strict';

// Dispatche :
//   GET  /api/jobs?type=international&pays=fr|us  → offres internationales
//   POST /api/jobs  action=score                  → scoring IA candidature (post-candidature)
//   POST /api/jobs  action=match                  → score compatibilité candidat ↔ offre (pré-candidature)
//   POST /api/jobs  action=simulate               → simulation d'entretien (questions + évaluation)
//   POST /api/jobs  action=subscribe|unsubscribe|list|notify → alertes email emploi
//   POST /api/jobs  action=subscribe_push|unsubscribe_push   → alertes push navigateur

const { createClient } = require('@supabase/supabase-js');
const { supabase }     = require('../../lib/supabase');
const { sendMail }     = require('../../lib/mailer');
const pdf              = require('pdf-parse');
const webpush          = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:contact@talenco.bj',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

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
    let signedUrl = null;
    for (const bucket of ['CVS', 'cvs']) {
      const { data: urlData } = await supabase.storage.from(bucket).createSignedUrl(cvPath, 120);
      if (urlData?.signedUrl) { signedUrl = urlData.signedUrl; break; }
    }
    if (signedUrl) {
      const pdfBuf = await fetch(signedUrl).then(r => r.arrayBuffer());
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

  if (action === 'subscribe_push' || action === 'unsubscribe_push') {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Connexion requise.' });

    if (action === 'subscribe_push') {
      const { subscription } = req.body;
      if (!subscription?.endpoint) return res.status(400).json({ error: 'Subscription invalide.' });
      const { error } = await supabaseAdmin.from('push_subscriptions').upsert(
        { user_id: user.id, subscription },
        { onConflict: 'user_id' }
      );
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    if (action === 'unsubscribe_push') {
      await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', user.id);
      return res.status(200).json({ success: true });
    }
  }

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
      .select('id, title, city, description, companies(name)').eq('id', job_id).single();
    if (!job) return res.status(404).json({ error: 'Offre introuvable.' });

    const jobText = `${job.title} ${job.city ?? ''} ${job.description ?? ''}`.toLowerCase();
    const { data: alerts } = await supabaseAdmin.from('job_alerts')
      .select('id, user_id, keywords, ville, users!job_alerts_user_id_fkey(email)');
    if (!alerts?.length) return res.status(200).json({ sent: 0 });

    const matching = alerts.filter(a => {
      const kwMatch    = jobText.includes(a.keywords);
      const villeMatch = !a.ville || (job.city ?? '').toLowerCase().includes(a.ville);
      return kwMatch && villeMatch;
    });

    // Récupérer les subscriptions push pour les utilisateurs avec des alertes correspondantes
    const matchingUserIds = [...new Set(matching.map(a => a.user_id))];
    const { data: pushSubs } = await supabaseAdmin.from('push_subscriptions')
      .select('user_id, subscription').in('user_id', matchingUserIds);
    const pushSubMap = Object.fromEntries((pushSubs ?? []).map(p => [p.user_id, p.subscription]));

    let sent = 0;
    for (const alert of matching) {
      const email = alert.users?.email;
      const offreUrl = `${SITE_URL}/offre/${job.id}`;
      const titre    = (job.title ?? 'Offre d\'emploi').replace(/</g, '&lt;');
      const entreprise = (job.companies?.name ?? '').replace(/</g, '&lt;');

      // Email
      if (email) {
        try {
          await sendMail({
            to: email,
            subject: `🔔 Nouvelle offre : ${job.title} — Talenco.bj`,
            html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
              <div style="background:#8B4513;border-radius:10px 10px 0 0;padding:20px 28px;text-align:center;">
                <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Talenco.bj 🇧🇯</p>
                <p style="margin:4px 0 0;font-size:12px;color:#f5deb3;">Alerte emploi — "${alert.keywords}"</p>
              </div>
              <div style="background:#fff;padding:24px 28px;border:1px solid #e8e0d5;border-top:none;">
                <h2 style="font-size:17px;margin:0 0 6px;color:#1a1a1a;">${titre}</h2>
                <p style="font-size:13px;color:#8B4513;font-weight:600;margin:0 0 16px;">${entreprise}${job.city ? ` · ${job.city}` : ''}</p>
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

      // Push navigateur
      const sub = pushSubMap[alert.user_id];
      if (sub && process.env.VAPID_PUBLIC_KEY) {
        try {
          await webpush.sendNotification(sub, JSON.stringify({
            title: `🔔 Nouvelle offre — ${job.title}`,
            body: `${entreprise}${job.city ? ' · ' + job.city : ''} · Correspond à votre alerte "${alert.keywords}"`,
            url: offreUrl,
          }));
        } catch (e) {
          // Subscription expirée → on la supprime
          if (e.statusCode === 410) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', alert.user_id);
          }
          console.warn('push notification:', e.message);
        }
      }
    }
    return res.status(200).json({ sent, total: matching.length });
  }

  return res.status(400).json({ error: 'action invalide' });
}

// ══════════════════════════════════════════════════════════════════════════════
// SCORE COMPATIBILITÉ (pré-candidature, basé sur le profil candidat)
// ══════════════════════════════════════════════════════════════════════════════

async function handleMatch(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Connexion requise.' });

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Token invalide.' });

  const { job_id } = req.body ?? {};
  if (!job_id) return res.status(400).json({ error: 'job_id requis.' });

  // Vérifier le cache
  const { data: cached } = await supabaseAdmin
    .from('job_match_scores')
    .select('score, breakdown, explanation')
    .eq('user_id', user.id).eq('job_id', job_id).maybeSingle();

  if (cached) return res.status(200).json({ ...cached, cached: true });

  // Charger profil candidat
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('job_title, skills, bio, level, sector')
    .eq('id', user.id).single();

  if (!profile) return res.status(404).json({ error: 'Profil introuvable.' });

  // Charger l'offre
  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('title, description, requirements, sector, city')
    .eq('id', job_id).single();

  if (!job) return res.status(404).json({ error: 'Offre introuvable.' });

  const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills ?? '');

  const prompt = `Tu es un expert RH. Évalue la compatibilité entre ce candidat et ce poste.
Réponds UNIQUEMENT avec du JSON valide.

=== POSTE ===
Titre : ${job.title}
Secteur : ${job.sector ?? ''}
Description : ${(job.description ?? '').substring(0, 800)}
Profil recherché : ${(job.requirements ?? '').substring(0, 500)}

=== CANDIDAT ===
Titre actuel : ${profile.job_title ?? 'non précisé'}
Niveau : ${profile.level ?? 'non précisé'}
Secteur : ${profile.sector ?? 'non précisé'}
Compétences : ${skills || 'non précisées'}
Bio : ${(profile.bio ?? '').substring(0, 400)}

=== FORMAT ATTENDU ===
{
  "score": <entier 0-100>,
  "breakdown": {
    "competences": <0-100>,
    "experience": <0-100>,
    "secteur": <0-100>
  },
  "explication": "<1-2 phrases : pourquoi ce score, point fort et lacune principale>"
}

Règles : score = moyenne pondérée des 3 sous-scores. Sois précis et honnête.`;

  let result;
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 256, temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Expert RH. JSON uniquement.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`);
    const raw = (await groqRes.json()).choices?.[0]?.message?.content ?? '{}';
    result = JSON.parse(raw);
  } catch (e) {
    console.error('match score:', e.message);
    return res.status(500).json({ error: 'Erreur calcul score.' });
  }

  const score = Math.min(100, Math.max(0, parseInt(result.score, 10) || 0));
  const breakdown = result.breakdown ?? {};
  const explanation = result.explication ?? '';

  // Mettre en cache
  const { error: _me } = await supabaseAdmin.from('job_match_scores').upsert({
    user_id: user.id, job_id, score, breakdown, explanation,
  }, { onConflict: 'user_id,job_id' });
  if (_me) console.warn('job_match_scores upsert:', _me.message);

  return res.status(200).json({ score, breakdown, explanation, cached: false });
}

// ══════════════════════════════════════════════════════════════════════════════
// SIMULATION D'ENTRETIEN
// ══════════════════════════════════════════════════════════════════════════════

async function handleSimulate(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Connexion requise.' });

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Token invalide.' });

  const { job_id, phase, answers } = req.body ?? {};
  if (!job_id) return res.status(400).json({ error: 'job_id requis.' });

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('title, description, requirements, sector')
    .eq('id', job_id).single();
  if (!job) return res.status(404).json({ error: 'Offre introuvable.' });

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('job_title, skills, bio, level, sector')
    .eq('id', user.id).single();

  const skills = Array.isArray(profile?.skills) ? profile.skills.join(', ') : (profile?.skills ?? '');

  // ── Phase 1 : générer 5 questions ciblées ──
  if (phase === 'questions') {
    const prompt = `Tu es un recruteur RH expérimenté. Génère exactement 5 questions d'entretien pour ce poste.
Réponds UNIQUEMENT avec du JSON valide.

=== POSTE ===
Titre : ${job.title}
Secteur : ${job.sector ?? ''}
Description : ${(job.description ?? '').substring(0, 600)}
Profil recherché : ${(job.requirements ?? '').substring(0, 400)}

=== FORMAT ATTENDU ===
{"questions":["Question 1","Question 2","Question 3","Question 4","Question 5"]}

Règles : mélange questions comportementales (méthode STAR), techniques et motivationnelles. Questions précises et adaptées au poste. En français.`;

    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 512, temperature: 0.7,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Recruteur RH. JSON uniquement. Français.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`);
      const raw = (await groqRes.json()).choices?.[0]?.message?.content ?? '{}';
      const data = JSON.parse(raw);
      return res.status(200).json({ questions: data.questions ?? [] });
    } catch (e) {
      console.error('simulate questions:', e.message);
      return res.status(500).json({ error: 'Erreur génération questions.' });
    }
  }

  // ── Phase 2 : évaluer les réponses ──
  if (phase === 'evaluation') {
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Réponses requises.' });
    }

    const qa = answers.map((a, i) =>
      `Q${i + 1} : ${a.question}\nRéponse : ${(a.answer || '(sans réponse)').substring(0, 500)}`
    ).join('\n\n');

    const prompt = `Tu es un recruteur RH senior. Évalue ces réponses d'entretien pour un poste de "${job.title}".
Réponds UNIQUEMENT avec du JSON valide.

=== POSTE ===
${(job.description ?? '').substring(0, 400)}

=== RÉPONSES ===
${qa}

=== PROFIL CANDIDAT ===
Titre : ${profile?.job_title ?? 'non précisé'} | Niveau : ${profile?.level ?? 'non précisé'} | Compétences : ${skills || 'non précisées'}

=== FORMAT ATTENDU ===
{
  "score_global": <0-100>,
  "mention": "<Excellent|Bien|À améliorer>",
  "feedbacks": [
    {"note": <0-10>, "point_fort": "...", "conseil": "..."},
    {"note": <0-10>, "point_fort": "...", "conseil": "..."},
    {"note": <0-10>, "point_fort": "...", "conseil": "..."},
    {"note": <0-10>, "point_fort": "...", "conseil": "..."},
    {"note": <0-10>, "point_fort": "...", "conseil": "..."}
  ],
  "conseil_global": "<1-2 phrases de conseil global pour améliorer ses chances>"
}`;

    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1024, temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Recruteur RH senior. JSON uniquement. Français.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`);
      const raw = (await groqRes.json()).choices?.[0]?.message?.content ?? '{}';
      return res.status(200).json(JSON.parse(raw));
    } catch (e) {
      console.error('simulate eval:', e.message);
      return res.status(500).json({ error: 'Erreur évaluation.' });
    }
  }

  return res.status(400).json({ error: 'Phase invalide (questions|evaluation).' });
}

// ══════════════════════════════════════════════════════════════════════════════
// VÉRIFICATION ÉTHIQUE (pré-publication)
// ══════════════════════════════════════════════════════════════════════════════

async function handleEthics(req, res) {
  const { content } = req.body ?? {};
  if (!content?.trim()) return res.status(200).json({ ok: true, issues: [], severity: 'ok' });

  const prompt = `Tu es expert en droit du travail et éthique RH. Analyse cette offre d'emploi et détecte tout contenu discriminatoire ou contraire à l'éthique professionnelle.

Vérifie : discrimination par l'âge ("jeune", "moins de X ans", "senior"), le genre (poste genré, stéréotypes), l'origine/nationalité, l'état de santé ou handicap, la religion, le statut marital/familial, exigences illégales ou disproportionnées.

Réponds UNIQUEMENT en JSON valide :
{
  "ok": true/false,
  "severity": "ok" | "warning" | "block",
  "issues": ["description précise du problème 1", ...]
}

Règles : severity="block" uniquement si discrimination explicite et claire. severity="warning" si formulation ambiguë ou potentiellement excluante. severity="ok" si aucun problème. Si ok=true et aucun problème, issues=[].

Offre :
${content.substring(0, 3000)}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 400, temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Expert éthique RH. JSON uniquement.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`);
    const raw = (await groqRes.json()).choices?.[0]?.message?.content ?? '{}';
    const result = JSON.parse(raw);
    return res.status(200).json({
      ok: result.ok !== false,
      severity: ['ok','warning','block'].includes(result.severity) ? result.severity : 'ok',
      issues: Array.isArray(result.issues) ? result.issues : [],
    });
  } catch (e) {
    console.error('ethics check:', e.message);
    return res.status(200).json({ ok: true, issues: [], severity: 'ok' }); // fail-open
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// SSR : page offre individuelle (Google Jobs)
// ══════════════════════════════════════════════════════════════════════════════

const CONTRACT_SCHEMA = {
  'CDI': 'FULL_TIME', 'Temps plein': 'FULL_TIME',
  'CDD': 'TEMPORARY', 'Intérim': 'TEMPORARY',
  'Stage': 'INTERN', 'Alternance': 'INTERN',
  'Freelance': 'CONTRACTOR', 'Consultant': 'CONTRACTOR',
  'Temps partiel': 'PART_TIME',
};

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function handleOffrePage(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).send('<h1>id requis</h1>');

  const { data: job, error } = await supabaseAdmin
    .from('jobs')
    .select(`
      id, title, description, requirements, benefits,
      salary_min, salary_max, salary_visible, salary_currency, salary_period,
      city, contract_type, experience_required, education_required,
      work_mode, sector, published_at, expires_at, created_at,
      stage_duree, stage_gratification, stage_gratification_montant, stage_profil_cible,
      companies ( name, logo_url, website, description, sector, city, is_verified, avg_rating, review_count ),
      apply_count
    `)
    .eq('id', id)
    .eq('status', 'published')
    .single();

  if (error || !job) {
    res.setHeader('Location', '/offres.html');
    return res.status(302).end();
  }

  const SITE = process.env.SITE_URL || 'https://talenco.bj';
  const company = job.companies || {};
  const nom = company.name || 'Entreprise';
  const salairePeriod = job.salary_period === 'year' ? 'YEAR' : 'MONTH';
  const contractSchema = CONTRACT_SCHEMA[job.contract_type] || 'FULL_TIME';

  // ── JSON-LD ──────────────────────────────────────────────────────────────
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: (job.description || '') + (job.requirements ? '\n\nProfil requis :\n' + job.requirements : ''),
    datePosted: (job.published_at || job.created_at || '').slice(0, 10),
    validThrough: job.expires_at ? job.expires_at.slice(0, 10) : undefined,
    employmentType: contractSchema,
    hiringOrganization: {
      '@type': 'Organization',
      name: nom,
      sameAs: company.website || SITE,
      logo: company.logo_url || undefined,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.city || 'Cotonou',
        addressCountry: 'BJ',
      },
    },
    ...(job.salary_visible && job.salary_min ? {
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: job.salary_currency || 'XOF',
        value: {
          '@type': 'QuantitativeValue',
          minValue: job.salary_min,
          maxValue: job.salary_max || job.salary_min,
          unitText: salairePeriod,
        },
      },
    } : {}),
  };

  // ── Formatage salaire affiché ────────────────────────────────────────────
  let salaireHtml = '';
  if (job.salary_visible && job.salary_min) {
    const fmt = n => n.toLocaleString('fr-FR');
    const cur = job.salary_currency || 'FCFA';
    const per = job.salary_period === 'year' ? '/an' : '/mois';
    salaireHtml = job.salary_max && job.salary_max !== job.salary_min
      ? `${fmt(job.salary_min)} – ${fmt(job.salary_max)} ${cur}${per}`
      : `${fmt(job.salary_min)} ${cur}${per}`;
  }

  const metaDesc = `${job.title} chez ${nom} — ${job.city || 'Cotonou'}, Bénin. ${(job.description || '').slice(0, 120).replace(/\n/g, ' ')}…`;
  const canonical = `${SITE}/offre/${job.id}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(job.title)} — ${esc(nom)} | Talenco.bj</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(job.title)} — ${esc(nom)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Talenco.bj">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<link rel="stylesheet" href="/design-system.css">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg,#F9F6F1);color:var(--text,#1a1209);font-family:'Space Grotesk',sans-serif;min-height:100vh}
.nav{height:56px;background:#fff;border-bottom:1px solid #EDE8E0;display:flex;align-items:center;padding:0 1.5rem;gap:1rem}
.nav-logo{font-family:'Instrument Serif',serif;font-style:italic;font-size:1.25rem;color:#1a1209;text-decoration:none}
.nav-back{font-size:.82rem;color:#7a6e61;text-decoration:none;margin-left:auto}
.nav-back:hover{color:#8B4513}
.wrapper{max-width:800px;margin:0 auto;padding:2.5rem 1.5rem 4rem}
.breadcrumb{font-size:.75rem;color:#9a8e80;font-family:'DM Mono',monospace;margin-bottom:1.5rem}
.breadcrumb a{color:#9a8e80;text-decoration:none}
.breadcrumb a:hover{color:#8B4513}
.job-header{margin-bottom:2rem}
.company-row{display:flex;align-items:center;gap:.75rem;margin-bottom:1rem}
.company-logo{width:48px;height:48px;border-radius:8px;border:1px solid #EDE8E0;object-fit:contain;background:#fff;padding:4px}
.company-name{font-size:.9rem;font-weight:600;color:#4a3d2e}
.company-verified{display:inline-block;width:14px;height:14px;background:#8B4513;border-radius:50%;margin-left:4px;vertical-align:middle;font-size:9px;color:#fff;text-align:center;line-height:14px}
.company-rating{font-size:12px;color:#8B4513;letter-spacing:.02em;margin-left:6px;vertical-align:middle}
.apply-count{display:inline-block;font-family:'DM Mono',monospace;font-size:10px;color:var(--text-muted);margin-top:4px}
h1{font-family:'Instrument Serif',serif;font-style:italic;font-size:clamp(1.6rem,4vw,2.2rem);line-height:1.15;margin-bottom:1rem;color:#1a1209}
.tags{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.5rem}
.tag{display:inline-flex;align-items:center;gap:.35rem;font-size:.75rem;font-family:'DM Mono',monospace;padding:.3rem .7rem;border-radius:100px;border:1px solid #EDE8E0;background:#fff;color:#4a3d2e}
.tag.salary{background:#FEF3E2;border-color:#F0A500;color:#8B4513;font-weight:600}
.apply-bar{background:#fff;border:1px solid #EDE8E0;border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:2rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.apply-bar p{font-size:.85rem;color:#7a6e61;line-height:1.5}
.btn-apply{background:#8B4513;color:#fff;border:none;border-radius:8px;padding:.75rem 1.5rem;font-family:'Space Grotesk',sans-serif;font-size:.93rem;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .2s}
.btn-apply:hover{background:#6d3510}
.section-title{font-family:'DM Mono',monospace;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:#9a8e80;margin-bottom:.75rem;margin-top:1.75rem}
.prose{font-size:.93rem;line-height:1.78;color:#2a2018;white-space:pre-wrap}
hr.sep{border:none;border-top:1px solid #EDE8E0;margin:2rem 0}
.share-bar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:1.5rem}
.share-label{font-family:'DM Mono',monospace;font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:#9a8e80;margin-right:.25rem}
.share-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.3rem .75rem;border-radius:100px;font-family:'DM Mono',monospace;font-size:.7rem;font-weight:600;text-decoration:none;border:1px solid transparent;cursor:pointer;transition:opacity .15s;white-space:nowrap}
.share-btn:hover{opacity:.8}
.share-btn-wa{background:#25D366;color:#fff}
.share-btn-li{background:#0A66C2;color:#fff}
.share-btn-copy{background:#fff;color:#4a3d2e;border-color:#EDE8E0}
</style>
</head>
<body>
<nav class="nav">
  <a href="/" class="nav-logo">Talenco.bj</a>
  <a href="/offres.html" class="nav-back">← Toutes les offres</a>
</nav>

<div class="wrapper">
  <div class="breadcrumb">
    <a href="/">Accueil</a> › <a href="/offres.html">Offres</a> › ${esc(job.title)}
  </div>

  <div class="job-header">
    <div class="company-row">
      ${company.logo_url ? `<img class="company-logo" src="${esc(company.logo_url)}" alt="${esc(nom)}">` : ''}
      <span class="company-name">${esc(nom)}${company.is_verified ? '<span class="company-verified" title="Entreprise certifiée Talenco">✓</span>' : ''}</span>
      ${company.avg_rating ? `<span class="company-rating">${'★'.repeat(Math.round(company.avg_rating))}${'☆'.repeat(5 - Math.round(company.avg_rating))} <span style="font-size:11px;color:var(--text-muted)">(${company.review_count})</span></span>` : ''}
    </div>
    ${job.apply_count > 0 ? `<div class="apply-count">${job.apply_count} candidat${job.apply_count > 1 ? 's' : ''} ont postulé</div>` : ''}
    <h1>${esc(job.title)}</h1>
    <div class="tags">
      ${job.city ? `<span class="tag">📍 ${esc(job.city)}</span>` : ''}
      ${job.contract_type === 'Stage' ? `<span class="tag" style="background:rgba(124,58,237,.1);border-color:#7C3AED;color:#7C3AED;font-weight:600;">📄 STAGE</span>` : job.contract_type ? `<span class="tag">📄 ${esc(job.contract_type)}</span>` : ''}
      ${job.work_mode ? `<span class="tag">🏠 ${esc(job.work_mode)}</span>` : ''}
      ${job.contract_type === 'Stage' && job.stage_duree ? `<span class="tag" style="background:rgba(124,58,237,.07);border-color:#7C3AED;color:#7C3AED;">📅 ${esc(job.stage_duree)}</span>` : ''}
      ${job.experience_required ? `<span class="tag">⏱ ${esc(job.experience_required)}</span>` : ''}
      ${job.sector ? `<span class="tag">🏷 ${esc(job.sector)}</span>` : ''}
      ${job.contract_type === 'Stage' && job.stage_gratification ? `<span class="tag salary">💶 ${job.stage_gratification_montant ? job.stage_gratification_montant.toLocaleString('fr-FR') + ' FCFA/mois' : 'Rémunéré'}</span>` : salaireHtml ? `<span class="tag salary">💰 ${esc(salaireHtml)}</span>` : job.salary_visible === false ? `<span class="tag" style="color:var(--text-muted);font-style:italic;">Salaire non communiqué</span>` : ''}
    </div>
  </div>

  <div class="share-bar">
    <span class="share-label">Partager</span>
    <a href="https://wa.me/?text=${encodeURIComponent(`🎯 Offre : ${job.title}\n🏢 ${nom} — ${job.city || ''}\n📋 ${job.contract_type || ''}\n\nPostulez sur Talenco.bj :\n${canonical}`)}" target="_blank" rel="noopener" class="share-btn share-btn-wa">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.109.549 4.09 1.512 5.812L0 24l6.374-1.481A11.953 11.953 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.817 9.817 0 01-5.003-1.372l-.36-.213-3.727.977.994-3.634-.234-.374A9.786 9.786 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
      WhatsApp
    </a>
    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}" target="_blank" rel="noopener" class="share-btn share-btn-li">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      LinkedIn
    </a>
    <button onclick="navigator.clipboard.writeText('${canonical}').then(()=>{this.textContent='✓ Copié !';setTimeout(()=>this.textContent='Copier le lien',2000)})" class="share-btn share-btn-copy">Copier le lien</button>
  </div>

  <div class="apply-bar">
    <p>Postulez via Talenco.bj — profil vérifié, suivi de candidature inclus.</p>
    <a href="/offre-detail.html?id=${esc(job.id)}" class="btn-apply">Postuler à cette offre →</a>
  </div>

  ${job.description ? `<div class="section-title">Description du poste</div><div class="prose">${esc(job.description)}</div>` : ''}
  ${job.requirements ? `<hr class="sep"><div class="section-title">Profil recherché</div><div class="prose">${esc(job.requirements)}</div>` : ''}
  ${job.benefits ? `<hr class="sep"><div class="section-title">Avantages</div><div class="prose">${esc(job.benefits)}</div>` : ''}
  ${job.education_required ? `<hr class="sep"><div class="section-title">Formation requise</div><div class="prose">${esc(job.education_required)}</div>` : ''}
  ${job.contract_type === 'Stage' ? `<hr class="sep"><div class="section-title" style="color:#7C3AED;">Conditions du stage</div><div style="display:flex;flex-wrap:wrap;gap:1rem;margin-top:.5rem">${job.stage_duree ? `<div style="background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.2);border-radius:10px;padding:.75rem 1.25rem;min-width:130px"><div style="font-size:.68rem;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.08em;color:#7C3AED;margin-bottom:.3rem">Durée</div><div style="font-weight:600;color:#4a3d2e">${esc(job.stage_duree)}</div></div>` : ''}<div style="background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.2);border-radius:10px;padding:.75rem 1.25rem;min-width:130px"><div style="font-size:.68rem;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.08em;color:#7C3AED;margin-bottom:.3rem">Gratification</div><div style="font-weight:600;color:#4a3d2e">${job.stage_gratification ? (job.stage_gratification_montant ? job.stage_gratification_montant.toLocaleString('fr-FR') + ' FCFA / mois' : 'Rémunéré') : 'Non rémunéré'}</div></div>${job.stage_profil_cible ? `<div style="background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.2);border-radius:10px;padding:.75rem 1.25rem;min-width:130px"><div style="font-size:.68rem;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.08em;color:#7C3AED;margin-bottom:.3rem">Profil ciblé</div><div style="font-weight:600;color:#4a3d2e">${esc(job.stage_profil_cible)}</div></div>` : ''}</div>` : ''}

  <hr class="sep">
  <div style="text-align:center;padding:1.5rem 0">
    <a href="/offre-detail.html?id=${esc(job.id)}" class="btn-apply">Postuler à cette offre →</a>
  </div>
</div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return res.status(200).send(html);
}

// ══════════════════════════════════════════════════════════════════════════════
// SSR : sitemap.xml
// ══════════════════════════════════════════════════════════════════════════════

async function handleSitemap(req, res) {
  const SITE = process.env.SITE_URL || 'https://talenco.bj';

  const { data: jobs } = await supabaseAdmin
    .from('jobs')
    .select('id, updated_at, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1000);

  const staticPages = [
    { loc: `${SITE}/presentation.html`,                    priority: '1.0', freq: 'weekly'  },
    { loc: `${SITE}/offres.html`,                          priority: '0.9', freq: 'daily'   },
    { loc: `${SITE}/blog.html`,                            priority: '0.8', freq: 'weekly'  },
    { loc: `${SITE}/blog/cv-marche-beninois.html`,         priority: '0.7', freq: 'monthly' },
    { loc: `${SITE}/blog/recruter-au-benin-5-erreurs.html`,priority: '0.7', freq: 'monthly' },
    { loc: `${SITE}/entreprises.html`,                     priority: '0.7', freq: 'weekly'  },
    { loc: `${SITE}/inscription.html`,                     priority: '0.6', freq: 'monthly' },
    { loc: `${SITE}/connexion.html`,                       priority: '0.4', freq: 'monthly' },
  ];

  const urls = [
    ...staticPages.map(p => `  <url>
    <loc>${p.loc}</loc>
    <changefreq>${p.freq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),
    ...(jobs || []).map(j => {
      const lastmod = (j.updated_at || j.published_at || '').slice(0, 10);
      return `  <url>
    <loc>${SITE}/offre/${j.id}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return res.status(200).send(xml);
}

// ROUTER PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    if (req.query.render === 'offre')    return handleOffrePage(req, res);
    if (req.query.render === 'sitemap')  return handleSitemap(req, res);
    return handleInternational(req, res);
  }

  // POST → dispatcher sur action
  if (req.method === 'POST') {
    const { action } = req.body ?? {};
    if (action === 'score')    return handleScore(req, res);
    if (action === 'match')    return handleMatch(req, res);
    if (action === 'simulate') return handleSimulate(req, res);
    if (action === 'ethics')   return handleEthics(req, res);
    return handleAlerts(req, res);
  }

  return res.status(405).end();
};
