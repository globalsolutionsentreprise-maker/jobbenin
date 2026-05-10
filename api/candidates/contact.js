'use strict';

// POST /api/candidates/contact
// Contacter un candidat — coûte 1 crédit à l'entreprise

const { createClient } = require('@supabase/supabase-js');
const { sendMail }     = require('../../lib/mailer');

const SITE_URL = process.env.SITE_URL || 'https://talenco-bj.vercel.app';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Auth
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Connexion requise.' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token invalide.' });

  const { data: company } = await supabaseAdmin
    .from('users')
    .select('id, role, credits, company_name, full_name, email')
    .eq('id', user.id).single();

  if (!company || company.role !== 'entreprise')
    return res.status(403).json({ error: 'Réservé aux entreprises.' });

  if ((company.credits ?? 0) < 1)
    return res.status(402).json({ error: 'Crédits insuffisants. Achetez un pack pour continuer.', credits: 0 });

  const { candidate_id, message } = req.body ?? {};
  if (!candidate_id) return res.status(400).json({ error: 'candidate_id requis.' });

  // Vérifier que le candidat existe
  const { data: candidate } = await supabaseAdmin
    .from('users')
    .select('id, full_name, email, job_title')
    .eq('id', candidate_id).eq('role', 'candidate').single();

  if (!candidate) return res.status(404).json({ error: 'Candidat introuvable.' });

  // Déduire 1 crédit (opération atomique via RPC ou update conditionnel)
  const { error: creditErr } = await supabaseAdmin
    .from('users')
    .update({ credits: (company.credits - 1) })
    .eq('id', company.id)
    .gt('credits', 0);  // sécurité : n'update que si credits > 0

  if (creditErr) return res.status(500).json({ error: 'Erreur déduction crédit.' });

  // Enregistrer le contact
  await supabaseAdmin.from('candidate_contacts').insert({
    company_id:   company.id,
    candidate_id: candidate.id,
    message:      message || null,
  }).catch(() => {});  // non-bloquant si la table n'existe pas encore

  const companyName = company.company_name || company.full_name || company.email;

  // Email au candidat
  try {
    await sendMail({
      to: candidate.email,
      subject: `${companyName} souhaite vous contacter — Talenco.bj`,
      html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
        <div style="background:#8B4513;border-radius:10px 10px 0 0;padding:20px 28px;text-align:center;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Talenco.bj 🇧🇯</p>
          <p style="margin:4px 0 0;font-size:12px;color:#f5deb3;">Une entreprise s'intéresse à votre profil</p>
        </div>
        <div style="background:#fff;padding:24px 28px;border:1px solid #e8e0d5;border-top:none;">
          <p style="font-size:22px;margin:0 0 12px;">📩</p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
            Bonjour ${candidate.full_name || 'Candidat'}, <strong>${companyName}</strong>
            a consulté votre profil et souhaite vous contacter.
          </p>
          ${message ? `<div style="background:#f9f6f1;border-left:3px solid #8B4513;padding:12px 16px;border-radius:4px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.6;">${message.replace(/</g,'&lt;')}</div>` : ''}
          <p style="font-size:13px;color:#555;line-height:1.6;margin:0 0 20px;">
            Connectez-vous à Talenco.bj pour voir les coordonnées de l'entreprise et répondre.
          </p>
          <a href="${SITE_URL}/candidat.html"
             style="display:inline-block;background:#8B4513;color:#fff;text-decoration:none;
                    padding:11px 24px;border-radius:8px;font-size:13px;font-weight:600;">
            Voir mon profil →
          </a>
        </div>
        <div style="background:#f9f6f1;border:1px solid #e8e0d5;border-top:none;
                    border-radius:0 0 10px 10px;padding:12px 28px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#aaa;">Talenco.bj — Recrutement au Bénin</p>
        </div>
      </div>`,
    });
  } catch (e) {
    console.warn('contact email failed:', e.message);
  }

  const newCredits = company.credits - 1;
  return res.status(200).json({
    success: true,
    credits_remaining: newCredits,
    message: `Contact envoyé. Il vous reste ${newCredits} crédit(s).`,
  });
};
