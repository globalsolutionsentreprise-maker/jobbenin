// POST /api/payment/send-reactivation
// Mode admin   : header x-admin-key requis, email dans le body
// Mode self-service : pas de clé, accessible par le candidat lui-même
const { supabase } = require('../../lib/supabase');
const { sendMail } = require('../../lib/mailer');
const { v4: uuidv4 } = require('uuid');

const SITE = process.env.SITE_URL || 'https://talenco-bj.vercel.app';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_SECRET_KEY;
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'Email requis' });

  try {
    const { data: user } = await supabase
      .from('users').select('id, nom, prenom, status, role').eq('email', email).single();

    // En self-service : réponse générique pour ne pas révéler l'existence des comptes
    if (!user || !['candidat', 'candidate'].includes(user.role)) {
      if (!isAdmin) return res.status(200).json({ ok: true });
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    if (user.status === 'active') {
      if (!isAdmin) return res.status(200).json({ ok: true });
      return res.status(400).json({ error: 'Compte déjà actif' });
    }

    // Suspendre ou archivé → on génère le lien
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    await supabase.from('reactivation_tokens').insert({
      user_id: user.id, token, expires_at: expiresAt, used: false,
    });

    const nom = user.prenom || user.nom || '';
    const reactivationUrl = `${SITE}/reactivation.html?token=${token}`;
    const isArchived = user.status === 'archived';

    await sendMail({
      to: email,
      subject: 'Talenco.bj — Votre lien de réactivation',
      html: `<div style="font-family:sans-serif;max-width:560px;">
        <h2 style="color:#8B4513;">Bonjour ${nom},</h2>
        <p>${isArchived
          ? 'Votre profil Talenco.bj a été archivé, mais vos données sont intactes.'
          : 'Votre profil Talenco.bj est actuellement désactivé.'
        } Pour reprendre votre recherche d'emploi, réglez les frais de réactivation.</p>
        <div style="background:#f9f6f1;border:1px solid #e8e0d5;border-radius:8px;padding:20px 24px;margin:20px 0;text-align:center;">
          <div style="font-size:13px;color:#706050;margin-bottom:6px;">Frais de réactivation</div>
          <div style="font-family:serif;font-size:32px;font-weight:700;color:#8B4513;">2 000 FCFA</div>
          <div style="font-size:12px;color:#a09080;margin-top:4px;">puis 1 000 FCFA/mois · Accès restauré immédiatement</div>
        </div>
        <p><a href="${reactivationUrl}" style="background:#8B4513;color:#fff;padding:13px 28px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:500;display:inline-block;">Réactiver mon compte →</a></p>
        <p style="font-size:12px;color:#a09080;">Ce lien est valable <strong>48 heures</strong>. Passé ce délai, revenez sur cette page pour en obtenir un nouveau.</p>
        <hr style="border:none;border-top:1px solid #e8e0d5;margin:20px 0;">
        <p style="font-size:12px;color:#a09080;">Talenco.bj</p>
      </div>`,
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('send-reactivation:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
