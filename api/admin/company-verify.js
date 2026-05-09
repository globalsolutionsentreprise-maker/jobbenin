/**
 * Endpoint unifié pour la vérification des entreprises.
 * Body: { action, company_id, ... }
 *
 * Actions :
 *  - notify_admin   : appelé à l'inscription, notifie l'admin (pas d'auth requise)
 *  - approve_docs   : valide les documents RCCM/IFU
 *  - reject_docs    : rejette les documents (reason?)
 *  - schedule       : planifie l'entretien (interview_date, format, link_or_contact, responsible?)
 *  - certify        : certifie l'entreprise après entretien (notes?)
 *  - reject_final   : refuse après entretien (notes?)
 */
const { supabase } = require('../../lib/supabase');
const { sendMail }  = require('../../lib/mailer');

async function requireAdmin(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, company_id, reason, notes, interview_date, format, link_or_contact, responsible } = req.body ?? {};
  if (!action || !company_id) return res.status(400).json({ error: 'action et company_id requis' });

  // ── Notification admin à l'inscription (sans auth) ──────────────────────
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
          <a href="${process.env.SITE_URL||'https://talenco-bj.vercel.app'}/admin.html" style="background:#8B4513;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:13px;">Gérer dans l'admin →</a>
        </div>
      </div>`,
    }).catch(e => console.warn('notify_admin email:', e.message));
    return res.status(200).json({ ok: true });
  }

  // ── Actions admin (auth requise) ─────────────────────────────────────────
  const adminUser = await requireAdmin(req);
  if (!adminUser) return res.status(403).json({ error: 'Admin requis' });

  const { data: company } = await supabase.from('users')
    .select('email,full_name,company_name').eq('id', company_id).single();
  if (!company) return res.status(404).json({ error: 'Entreprise introuvable' });
  const nom = company.company_name || company.full_name || company.email;

  // ── Valider documents ──
  if (action === 'approve_docs') {
    await supabase.from('users').update({ verification_status:'docs_verified', verified_at: new Date().toISOString() }).eq('id', company_id);
    await sendMail({ to: company.email, subject: 'Talenco.bj — Documents vérifiés ✓',
      html: `<div style="font-family:sans-serif;max-width:560px;">
        <h2 style="color:#8B4513;">Bonjour ${nom},</h2>
        <p>Vos documents (RCCM et IFU) ont été vérifiés et validés.</p>
        <p>Nous vous contacterons prochainement pour un <strong>entretien de certification de 30 minutes</strong> afin d'activer votre profil sur Talenco.bj.</p>
        <hr style="border:none;border-top:1px solid #e8e0d5;margin:20px 0;">
        <p style="font-size:12px;color:#a09080;">Talenco.bj</p>
      </div>` }).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  // ── Rejeter documents ──
  if (action === 'reject_docs') {
    await supabase.from('users').update({ verification_status:'rejected', certif_notes: reason||null }).eq('id', company_id);
    await sendMail({ to: company.email, subject: 'Talenco.bj — Vérification de vos documents',
      html: `<div style="font-family:sans-serif;max-width:560px;">
        <h2 style="color:#8B4513;">Bonjour ${nom},</h2>
        <p>Nous n'avons pas pu valider vos documents d'entreprise.</p>
        ${reason ? `<p><strong>Motif :</strong> ${reason}</p>` : ''}
        <p>Pour toute question, répondez directement à cet email.</p>
        <hr style="border:none;border-top:1px solid #e8e0d5;margin:20px 0;">
        <p style="font-size:12px;color:#a09080;">Talenco.bj</p>
      </div>` }).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  // ── Planifier entretien ──
  if (action === 'schedule') {
    if (!interview_date || !format || !link_or_contact)
      return res.status(400).json({ error: 'interview_date, format et link_or_contact requis' });

    await supabase.from('users').update({
      verification_status:     'interview_scheduled',
      certif_interview_date:   interview_date,
      certif_interview_format: format,
      certif_interview_link:   link_or_contact,
      certif_responsible:      responsible||null,
    }).eq('id', company_id);

    const dateStr = new Date(interview_date).toLocaleString('fr-FR', {
      weekday:'long', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit',
    });
    const isMeet = format === 'google_meet';
    const contactBlock = isMeet
      ? `<p><strong>Lien Google Meet :</strong> <a href="${link_or_contact}">${link_or_contact}</a></p>`
      : `<p><strong>Format :</strong> Appel WhatsApp<br><strong>Numéro :</strong> ${link_or_contact}</p>`;

    await sendMail({ to: company.email, subject: 'Talenco.bj — Entretien de certification 📅',
      html: `<div style="font-family:sans-serif;max-width:560px;">
        <h2 style="color:#8B4513;">Bonjour ${nom},</h2>
        <p>Votre entretien de certification Talenco est confirmé.</p>
        <div style="background:#f9f6f1;border:1px solid #e8e0d5;border-radius:8px;padding:20px 24px;margin:20px 0;">
          <p style="margin:0 0 8px;"><strong>📅 Date :</strong> ${dateStr}</p>
          ${contactBlock}
          ${responsible ? `<p style="margin:4px 0 0;"><strong>Interlocuteur :</strong> ${responsible}</p>` : ''}
        </div>
        <p>L'entretien dure environ 30 minutes. En cas d'empêchement, répondez à cet email.</p>
        <hr style="border:none;border-top:1px solid #e8e0d5;margin:20px 0;">
        <p style="font-size:12px;color:#a09080;">Talenco.bj</p>
      </div>` }).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  // ── Certifier ──
  if (action === 'certify') {
    await supabase.from('users').update({
      verification_status:  'certified',
      status:               'active',
      certified_at_company: new Date().toISOString(),
      certif_notes:         notes||null,
    }).eq('id', company_id);

    await sendMail({ to: company.email, subject: 'Talenco.bj — Profil certifié 🎉 Bienvenue !',
      html: `<div style="font-family:sans-serif;max-width:560px;">
        <h2 style="color:#8B4513;">Félicitations ${nom} !</h2>
        <p>Votre entreprise est désormais <strong>certifiée sur Talenco.bj</strong>. Votre profil est visible et vous pouvez commencer à recruter.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px 24px;margin:20px 0;">
          <p style="margin:0 0 8px;font-weight:600;color:#15803d;">Vous pouvez maintenant :</p>
          <ul style="margin:0;padding-left:20px;color:#166534;font-size:14px;">
            <li>Publier des offres d'emploi</li><li>Accéder à la CVthèque</li>
            <li>Gérer vos candidatures en Kanban</li><li>Contacter directement les candidats</li>
          </ul>
        </div>
        <p><a href="${process.env.SITE_URL||'https://talenco-bj.vercel.app'}/connexion.html" style="background:#8B4513;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:500;">Accéder à mon espace recruteur →</a></p>
        <hr style="border:none;border-top:1px solid #e8e0d5;margin:20px 0;">
        <p style="font-size:12px;color:#a09080;">Talenco.bj</p>
      </div>` }).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  // ── Rejeter final ──
  if (action === 'reject_final') {
    await supabase.from('users').update({ verification_status:'rejected', certif_notes: notes||null }).eq('id', company_id);
    await sendMail({ to: company.email, subject: 'Talenco.bj — Suite de votre demande de certification',
      html: `<div style="font-family:sans-serif;max-width:560px;">
        <h2 style="color:#8B4513;">Bonjour ${nom},</h2>
        <p>À la suite de notre entretien, nous ne pouvons pas activer votre profil pour le moment.</p>
        ${notes ? `<p><strong>Motif :</strong> ${notes}</p>` : ''}
        <p>Si votre situation évolue, répondez à cet email.</p>
        <hr style="border:none;border-top:1px solid #e8e0d5;margin:20px 0;">
        <p style="font-size:12px;color:#a09080;">Talenco.bj</p>
      </div>` }).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: `Action inconnue : ${action}` });
};
