const { createClient } = require('@supabase/supabase-js');
const { sendMail }    = require('../lib/mailer');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SITE_URL = process.env.SITE_URL || 'https://talenco-bj.vercel.app';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non autorisé.' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Non autorisé.' });

  const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Accès refusé.' });

  const { data: candidats, error: dbErr } = await supabaseAdmin
    .from('users')
    .select('id, email, full_name')
    .eq('role', 'candidate')
    .is('cv_url', null)
    .eq('is_active', true);

  if (dbErr) return res.status(500).json({ error: 'Erreur base de données.' });
  if (!candidats?.length) return res.status(200).json({ message: 'Tous les candidats actifs ont un CV.', sent: 0 });

  // Phase bêta : envoi d'un récap à l'admin plutôt qu'aux candidats directement
  // (domaine talenco.bj non encore vérifié sur Resend)
  const adminEmail = user.email;
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
      to: adminEmail,
      subject: `Talenco.bj — ${candidats.length} candidat(s) sans CV`,
      html: `
<div style="font-family:sans-serif;max-width:620px;margin:0 auto;color:#1a1a1a;">
  <h2 style="font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:22px;margin-bottom:8px;">
    Candidats sans CV
  </h2>
  <p style="font-size:13px;color:#666;margin-bottom:16px;">
    ${candidats.length} candidat(s) actif(s) n'ont pas encore uploadé leur CV.
    <br><em style="font-size:11px;">Note bêta : les emails individuels seront activés après vérification du domaine talenco.bj.</em>
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f0f0f0;">
        <th style="padding:8px 12px;text-align:left;">Nom</th>
        <th style="padding:8px 12px;text-align:left;">Email</th>
        <th style="padding:8px 12px;text-align:center;">Lien</th>
      </tr>
    </thead>
    <tbody>${lignes}</tbody>
  </table>
  <p style="font-size:11px;color:#aaa;margin-top:24px;">Talenco.bj — Admin</p>
</div>`
    });
  } catch (e) {
    console.error('notify-missing-cv recap error:', e.message);
    return res.status(500).json({ error: 'Erreur envoi email : ' + e.message });
  }

  return res.status(200).json({
    success: true,
    sent: candidats.length,
    total: candidats.length,
    recap: true
  });
};
