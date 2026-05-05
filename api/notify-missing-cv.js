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

  let sent = 0;
  const errors = [];

  for (const c of candidats) {
    const prenom = c.full_name?.split(' ')[0] || 'Candidat';
    try {
      await sendMail({
        to: c.email,
        subject: 'Talenco.bj — Complétez votre profil avec votre CV',
        html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
  <h2 style="font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:22px;margin-bottom:8px;">
    Bonjour ${prenom},
  </h2>
  <p style="font-size:14px;line-height:1.6;color:#444;">
    Votre compte Talenco.bj est actif, mais il manque encore votre CV.
    Sans CV uploadé, vous ne pouvez pas postuler aux offres d'emploi.
  </p>
  <p style="font-size:14px;line-height:1.6;color:#444;">
    Ça prend moins d'une minute : connectez-vous et déposez votre CV en PDF.
  </p>
  <a href="${SITE_URL}/candidat.html?cv_requis=1#mon-cv"
     style="display:inline-block;margin:16px 0;background:#f0a500;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
    Uploader mon CV →
  </a>
  <p style="font-size:12px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">
    Talenco.bj — Recrutement au Bénin<br>
    <a href="${SITE_URL}" style="color:#888;">${SITE_URL}</a>
  </p>
</div>`
      });
      sent++;
    } catch (e) {
      errors.push(c.email);
      console.error('notify-missing-cv email error:', c.email, e.message);
    }
  }

  return res.status(200).json({
    success: true,
    sent,
    total: candidats.length,
    errors: errors.length ? errors : undefined
  });
};
