'use strict';

// POST /api/jobs/alerts  action=subscribe|unsubscribe|list
// Appelé depuis candidat.html + depuis publish-job au moment de la publication

const { createClient } = require('@supabase/supabase-js');
const { sendMail }     = require('../../lib/mailer');

const SITE_URL = process.env.SITE_URL || 'https://talenco-bj.vercel.app';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user ?? null;
}

// ── subscribe ─────────────────────────────────────────────────────────────────
async function handleSubscribe(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Connexion requise.' });

  const { keywords, ville } = req.body ?? {};
  if (!keywords?.trim()) return res.status(400).json({ error: 'Mots-clés requis.' });

  const { error } = await supabaseAdmin.from('job_alerts').upsert({
    user_id:  user.id,
    keywords: keywords.trim().toLowerCase(),
    ville:    ville?.trim().toLowerCase() || null,
  }, { onConflict: 'user_id,keywords,ville' });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}

// ── unsubscribe ───────────────────────────────────────────────────────────────
async function handleUnsubscribe(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Connexion requise.' });

  const { alert_id } = req.body ?? {};
  if (!alert_id) return res.status(400).json({ error: 'alert_id requis.' });

  await supabaseAdmin.from('job_alerts').delete().eq('id', alert_id).eq('user_id', user.id);
  return res.status(200).json({ success: true });
}

// ── list ──────────────────────────────────────────────────────────────────────
async function handleList(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Connexion requise.' });

  const { data, error } = await supabaseAdmin
    .from('job_alerts')
    .select('id, keywords, ville, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ alerts: data ?? [] });
}

// ── notify (appelé après publication d'une offre, admin authentifié) ─────────
async function handleNotify(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Connexion requise.' });
  const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Admin requis.' });

  const { job_id } = req.body ?? {};
  if (!job_id) return res.status(400).json({ error: 'job_id requis.' });

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('id, titre, ville, description, entreprise')
    .eq('id', job_id)
    .single();

  if (!job) return res.status(404).json({ error: 'Offre introuvable.' });

  const jobText = `${job.titre} ${job.ville ?? ''} ${job.description ?? ''}`.toLowerCase();

  const { data: alerts } = await supabaseAdmin
    .from('job_alerts')
    .select('id, user_id, keywords, ville, users!job_alerts_user_id_fkey(email)')
    .eq('users.role', 'candidate');

  if (!alerts?.length) return res.status(200).json({ sent: 0 });

  const matching = alerts.filter(a => {
    const kwMatch = jobText.includes(a.keywords);
    const villeMatch = !a.ville || (job.ville ?? '').toLowerCase().includes(a.ville);
    return kwMatch && villeMatch;
  });

  let sent = 0;
  for (const alert of matching) {
    const email = alert.users?.email;
    if (!email) continue;
    try {
      await sendMail({
        to: email,
        subject: `🔔 Nouvelle offre : ${job.titre} — Talenco.bj`,
        html: buildAlertEmail({ job, keywords: alert.keywords }),
      });
      sent++;
    } catch (e) {
      console.warn('job alert email failed:', e.message);
    }
  }

  return res.status(200).json({ sent, total: matching.length });
}

function buildAlertEmail({ job, keywords }) {
  const offreUrl = `${SITE_URL}/offre-detail.html?id=${job.id}`;
  const titre    = (job.titre ?? 'Offre d\'emploi').replace(/</g, '&lt;');
  const ville    = job.ville ? ` · ${job.ville}` : '';
  const entreprise = (job.entreprise ?? '').replace(/</g, '&lt;');

  return `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
    <div style="background:#8B4513;border-radius:10px 10px 0 0;padding:20px 28px;text-align:center;">
      <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Talenco.bj 🇧🇯</p>
      <p style="margin:4px 0 0;font-size:12px;color:#f5deb3;">Alerte emploi — "${keywords}"</p>
    </div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #e8e0d5;border-top:none;">
      <p style="font-size:20px;margin:0 0 4px;">🔔</p>
      <h2 style="font-size:17px;margin:0 0 6px;color:#1a1a1a;">${titre}</h2>
      <p style="font-size:13px;color:#8B4513;font-weight:600;margin:0 0 16px;">${entreprise}${ville}</p>
      <p style="font-size:13px;color:#555;line-height:1.6;margin:0 0 20px;">
        Une nouvelle offre correspond à votre alerte <strong>"${keywords}"</strong>.
        Soyez parmi les premiers à postuler !
      </p>
      <a href="${offreUrl}"
         style="display:inline-block;background:#8B4513;color:#fff;text-decoration:none;
                padding:11px 24px;border-radius:8px;font-size:13px;font-weight:600;">
        Voir l'offre →
      </a>
    </div>
    <div style="background:#f9f6f1;border:1px solid #e8e0d5;border-top:none;
                border-radius:0 0 10px 10px;padding:12px 28px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">
        Talenco.bj — <a href="${SITE_URL}/candidat.html#alertes" style="color:#8B4513;">Gérer mes alertes</a>
      </p>
    </div>
  </div>`;
}

// ── Router ────────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action } = req.body ?? {};
  if (action === 'subscribe')   return handleSubscribe(req, res);
  if (action === 'unsubscribe') return handleUnsubscribe(req, res);
  if (action === 'list')        return handleList(req, res);
  if (action === 'notify')      return handleNotify(req, res);
  return res.status(400).json({ error: 'action invalide : subscribe | unsubscribe | list | notify' });
};
