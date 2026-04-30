// POST /api/payment/send-reactivation (ADMIN ONLY)
const { supabase } = require('../../lib/supabase');
const { sendMail } = require('../../lib/mailer');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  try {
    const { data: user } = await supabase
      .from('users').select('*').eq('email', email).single();

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (user.status === 'active') return res.status(400).json({ error: 'Compte déjà actif' });

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    await supabase.from('reactivation_tokens').insert({
      user_id: user.id, token, expires_at: expiresAt, used: false
    });

    const reactivationUrl = `${process.env.SITE_URL}/reactivation.html?token=${token}`;

    await sendMail({
      to: email,
      subject: 'Talenco.bj — Lien de réactivation de votre compte',
      html: `<h2>Réactivez votre compte Talenco.bj</h2>
<p>Bonjour ${user.nom || ''},</p>
<p>Suite à votre contact avec notre support, voici votre lien de réactivation.</p>
<p>Frais de réactivation : <strong>2 000 FCFA</strong>. Lien valable <strong>48 heures</strong>.</p>
<a href="${reactivationUrl}" style="background:#F0A500;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:12px">
  Réactiver mon compte (2 000 FCFA) →
</a>`
    });

    return res.status(200).json({ success: true, message: `Lien envoyé à ${email}` });

  } catch (err) {
    console.error('Send reactivation error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
