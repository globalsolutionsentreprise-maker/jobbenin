'use strict';

// Dispatche :
//   DELETE /api/admin                          → suppression utilisateur
//   POST   /api/admin  action=notify_missing_cv → relance candidats sans CV
//   POST   /api/admin  action=*                 → vérification entreprise

const { createClient } = require('@supabase/supabase-js');
const { supabase }     = require('../../lib/supabase');
const { sendMail }     = require('../../lib/mailer');

const SITE_URL = process.env.SITE_URL || 'https://talenco-bj.vercel.app';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function requireAdmin(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user : null;
}

// ── DELETE : supprimer un utilisateur ────────────────────────────────────────
async function handleDeleteUser(req, res) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) return res.status(403).json({ error: 'Admin requis.' });

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  if (userId === adminUser.id) return res.status(400).json({ error: 'Impossible de supprimer son propre compte.' });

  await supabaseAdmin.from('users').delete().eq('id', userId);
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}

// ── POST notify_missing_cv : relancer les candidats sans CV ──────────────────
async function handleNotifyMissingCv(req, res) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) return res.status(403).json({ error: 'Admin requis.' });

  const { data: candidats, error: dbErr } = await supabaseAdmin
    .from('users')
    .select('id, email, full_name')
    .eq('role', 'candidate')
    .is('cv_url', null)
    .eq('is_active', true);

  if (dbErr) return res.status(500).json({ error: 'Erreur base de données.' });
  if (!candidats?.length) return res.status(200).json({ message: 'Tous les candidats actifs ont un CV.', sent: 0 });

  const lignes = candidats.map((c, i) =>
    `<tr style="background:${i%2?'#f9f9f9':'#fff'}">
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${c.full_name || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${c.email}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">
        <a href="${SITE_URL}/candidat.html?cv_requis=1#mon-cv" style="color:#f0a500;font-size:12px;">Lien profil →</a>
      </td>
    </tr>`
  ).join('');

  try {
    await sendMail({
      to: adminUser.email,
      subject: `Talenco.bj — ${candidats.length} candidat(s) sans CV`,
      html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;color:#1a1a1a;">
        <h2 style="font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:22px;margin-bottom:8px;">Candidats sans CV</h2>
        <p style="font-size:13px;color:#666;margin-bottom:16px;">${candidats.length} candidat(s) actif(s) n'ont pas encore uploadé leur CV.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f0f0f0;">
            <th style="padding:8px 12px;text-align:left;">Nom</th>
            <th style="padding:8px 12px;text-align:left;">Email</th>
            <th style="padding:8px 12px;text-align:center;">Lien</th>
          </tr></thead>
          <tbody>${lignes}</tbody>
        </table>
        <p style="font-size:11px;color:#aaa;margin-top:24px;">Talenco.bj — Admin</p>
      </div>`
    });
  } catch (e) {
    return res.status(500).json({ error: 'Erreur envoi email : ' + e.message });
  }
  return res.status(200).json({ success: true, sent: candidats.length, total: candidats.length, recap: true });
}

// ── POST : vérification entreprise ───────────────────────────────────────────
async function handleCompanyVerify(req, res) {
  const { action, company_id, reason, notes, interview_date, format, link_or_contact, responsible } = req.body ?? {};
  if (!action || !company_id) return res.status(400).json({ error: 'action et company_id requis' });

  if (action === 'notify_admin') {
    const { data: c } = await supabase.from('users')
      .select('email,full_name,company_name,company_sector,company_size,phone,rccm,ifu,certif_interview_format')
      .eq('id', company_id).single();
    if (!c) return res.status(404).json({ error: 'Introuvable' });
    const nom = c.company_name || c.full_name || c.email;
    const fmt = c.certif_interview_format === 'whatsapp' ? '📱 Appel WhatsApp' : '📹 Google Meet';
    await sendMail({
      to: process.env.SMTP_FROM,
      subject: `[Talenco] Nouveau dossier entreprise — ${nom}`,
      html: `<div style="font-family:sans-serif;max-width:560px;">
        <h2 style="color:#8B4513;">Nouveau dossier entreprise</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:6px 0;color:#706050;width:140px;">Entreprise</td><td style="font-weight:600;">${nom}</td></tr>
          <tr><td style="padding:6px 0;color:#706050;">Contact</td><td>${c.full_name||'—'}</td></tr>
          <tr><td style="padding:6px 0;color:#706050;">Email</td><td><a href="mailto:${c.email}">${c.email}</a></td></tr>
          <tr><td style="padding:6px 0;color:#706050;">Téléphone</td><td>${c.phone||'—'}</td></tr>
          <tr><td style="padding:6px 0;color:#706050;">Secteur</td><td>${c.company_sector||'—'}</td></tr>
          <tr><td style="padding:6px 0;color:#706050;">Taille</td><td>${c.company_size||'—'}</td></tr>
          <tr><td style="padding:6px 0;color:#706050;">RCCM</td><td style="font-family:monospace;">${c.rccm||'—'}</td></tr>
          <tr><td style="padding:6px 0;color:#706050;">IFU</td><td style="font-family:monospace;">${c.ifu||'—'}</td></tr>
          <tr><td style="padding:6px 0;color:#706050;">Format souhaité</td><td>${fmt}</td></tr>
        </table>
        <div style="margin-top:20px;">
          <a href="${SITE_URL}/admin.html" style="background:#8B4513;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:13px;">Gérer dans l'admin →</a>
        </div>
      </div>`,
    }).catch(e => console.warn('notify_admin email:', e.message));
    return res.status(200).json({ ok: true });
  }

  const adminUser = await requireAdmin(req);
  if (!adminUser) return res.status(403).json({ error: 'Admin requis' });

  const { data: company } = await supabase.from('users')
    .select('email,full_name,company_name').eq('id', company_id).single();
  if (!company) return res.status(404).json({ error: 'Entreprise introuvable' });
  const nom = company.company_name || company.full_name || company.email;

  if (action === 'approve_docs') {
    await supabase.from('users').update({ verification_status:'docs_verified', verified_at: new Date().toISOString() }).eq('id', company_id);
    await sendMail({ to: company.email, subject: 'Talenco.bj — Documents vérifiés ✓',
      html: `<div style="font-family:sans-serif;max-width:560px;"><h2 style="color:#8B4513;">Bonjour ${nom},</h2><p>Vos documents (RCCM et IFU) ont été vérifiés et validés.</p><p>Nous vous contacterons prochainement pour un <strong>entretien de certification de 30 minutes</strong>.</p></div>` }).catch(()=>{});
    return res.status(200).json({ ok: true });
  }

  if (action === 'reject_docs') {
    await supabase.from('users').update({ verification_status:'rejected', certif_notes: reason||null }).eq('id', company_id);
    await sendMail({ to: company.email, subject: 'Talenco.bj — Vérification de vos documents',
      html: `<div style="font-family:sans-serif;max-width:560px;"><h2 style="color:#8B4513;">Bonjour ${nom},</h2><p>Nous n'avons pas pu valider vos documents d'entreprise.</p>${reason ? `<p><strong>Motif :</strong> ${reason}</p>` : ''}</div>` }).catch(()=>{});
    return res.status(200).json({ ok: true });
  }

  if (action === 'schedule') {
    if (!interview_date || !format || !link_or_contact)
      return res.status(400).json({ error: 'interview_date, format et link_or_contact requis' });
    await supabase.from('users').update({
      verification_status:'interview_scheduled',
      certif_interview_date: interview_date, certif_interview_format: format,
      certif_interview_link: link_or_contact, certif_responsible: responsible||null,
    }).eq('id', company_id);
    const dateStr = new Date(interview_date).toLocaleString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const contactBlock = format === 'google_meet'
      ? `<p><strong>Lien Google Meet :</strong> <a href="${link_or_contact}">${link_or_contact}</a></p>`
      : `<p><strong>Format :</strong> Appel WhatsApp<br><strong>Numéro :</strong> ${link_or_contact}</p>`;
    await sendMail({ to: company.email, subject: 'Talenco.bj — Entretien de certification 📅',
      html: `<div style="font-family:sans-serif;max-width:560px;"><h2 style="color:#8B4513;">Bonjour ${nom},</h2><p>Votre entretien de certification est confirmé.</p><div style="background:#f9f6f1;border:1px solid #e8e0d5;border-radius:8px;padding:20px 24px;margin:20px 0;"><p style="margin:0 0 8px;"><strong>📅 Date :</strong> ${dateStr}</p>${contactBlock}${responsible ? `<p><strong>Interlocuteur :</strong> ${responsible}</p>` : ''}</div></div>` }).catch(()=>{});
    return res.status(200).json({ ok: true });
  }

  if (action === 'certify') {
    await supabase.from('users').update({
      verification_status:'certified', status:'active',
      certified_at_company: new Date().toISOString(), certif_notes: notes||null,
    }).eq('id', company_id);
    await sendMail({ to: company.email, subject: 'Talenco.bj — Profil certifié 🎉 Bienvenue !',
      html: `<div style="font-family:sans-serif;max-width:560px;"><h2 style="color:#8B4513;">Félicitations ${nom} !</h2><p>Votre entreprise est désormais <strong>certifiée sur Talenco.bj</strong>.</p><p><a href="${SITE_URL}/connexion.html" style="background:#8B4513;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;">Accéder à mon espace recruteur →</a></p></div>` }).catch(()=>{});
    return res.status(200).json({ ok: true });
  }

  if (action === 'reject_final') {
    await supabase.from('users').update({ verification_status:'rejected', certif_notes: notes||null }).eq('id', company_id);
    await sendMail({ to: company.email, subject: 'Talenco.bj — Suite de votre demande de certification',
      html: `<div style="font-family:sans-serif;max-width:560px;"><h2 style="color:#8B4513;">Bonjour ${nom},</h2><p>À la suite de notre entretien, nous ne pouvons pas activer votre profil pour le moment.</p>${notes ? `<p><strong>Motif :</strong> ${notes}</p>` : ''}</div>` }).catch(()=>{});
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: `Action inconnue : ${action}` });
}

// ── GET cv_signed_url : URL signée pour lire un CV (contourne RLS) ───────────
async function handleCvSignedUrl(req, res) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) return res.status(403).json({ error: 'Admin requis.' });

  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const { data: profile } = await supabaseAdmin.from('users').select('cv_url, cv_path').eq('id', userId).single();
  const cvRaw = profile?.cv_url || profile?.cv_path || `${userId}/cv.pdf`;

  // URL externe (données de test ou upload direct) → retourner telle quelle
  if (cvRaw.startsWith('http')) return res.status(200).json({ signedUrl: cvRaw });

  // Essayer les deux casses du bucket (CVS créé manuellement vs cvs en migration)
  for (const bucket of ['CVS', 'cvs']) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(cvRaw, 3600);
    if (!error && data?.signedUrl) return res.status(200).json({ signedUrl: data.signedUrl });
  }
  return res.status(404).json({ error: `CV introuvable (chemin: ${cvRaw})` });
}

// ── Router ────────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET' && req.query.action === 'cv_signed_url') return handleCvSignedUrl(req, res);
  if (req.method === 'DELETE') return handleDeleteUser(req, res);
  if (req.method === 'POST') {
    if (req.body?.action === 'notify_missing_cv') return handleNotifyMissingCv(req, res);
    return handleCompanyVerify(req, res);
  }
  return res.status(405).end();
};
