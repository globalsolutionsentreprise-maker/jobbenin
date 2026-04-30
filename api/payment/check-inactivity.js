// GET /api/payment/check-inactivity — Cron job quotidien (6h du matin)
// Suspend les comptes candidats inactifs depuis 3 mois et envoie les emails
const { supabase } = require('../../lib/supabase');
const { sendMail } = require('../../lib/mailer');

module.exports = async (req, res) => {
  const cronSecret = req.headers['authorization'];
  if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: toSuspend } = await supabase
      .from('users')
      .select('*')
      .eq('status', 'active')
      .eq('role', 'candidat')
      .lt('last_activity', threeMonthsAgo);

    if (!toSuspend || toSuspend.length === 0) {
      return res.status(200).json({ message: 'Aucun compte à suspendre', suspended: 0 });
    }

    const ids = toSuspend.map(u => u.id);
    await supabase.from('users').update({ status: 'suspended' }).in('id', ids);

    for (const user of toSuspend) {
      await sendMail({
        to: user.email,
        subject: 'Talenco.bj — Votre compte a été suspendu',
        html: `<h2>Votre compte Talenco.bj est suspendu</h2>
<p>Bonjour ${user.nom || ''},</p>
<p>Votre compte a été suspendu après <strong>3 mois d'inactivité</strong>.</p>
<p>Pour réactiver votre accès, contactez notre support :</p>
<ul>
  <li>Téléphone : <strong>${process.env.SUPPORT_PHONE}</strong></li>
  <li>Email : <strong>${process.env.SUPPORT_EMAIL}</strong></li>
</ul>
<p>Frais de réactivation : <strong>2 000 FCFA</strong>.</p>`
      });
    }

    return res.status(200).json({
      message: `${toSuspend.length} compte(s) suspendu(s)`,
      suspended: toSuspend.length
    });

  } catch (err) {
    console.error('Inactivity check error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
