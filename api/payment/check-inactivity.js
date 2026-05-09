// Cron quotidien 06:00 UTC — cycle de vie candidats
// 3 mois inactif → avertissement | 4 mois → désactivé | 6 mois → archivé
const { supabase } = require('../../lib/supabase');
const { sendMail }  = require('../../lib/mailer');

const SITE   = process.env.SITE_URL || 'https://talenco-bj.vercel.app';
const cutoff = days => new Date(Date.now() - days * 86_400_000).toISOString();

module.exports = async (req, res) => {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: 'Non autorisé' });

  try {
    const archived  = await archiveInactive();
    const suspended = await suspendInactive();
    const warned    = await warnInactive();
    return res.status(200).json({ archived, suspended, warned });
  } catch (err) {
    console.error('check-inactivity:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Étape 3 — archiver les profils désactivés depuis ≥ 6 mois
async function archiveInactive() {
  const { data } = await supabase.from('users')
    .select('id, email, full_name')
    .in('role', ['candidat', 'candidate'])
    .eq('status', 'suspended')
    .lt('last_activity', cutoff(180));

  if (!data?.length) return 0;
  await supabase.from('users').update({ status: 'archived' }).in('id', data.map(u => u.id));
  await Promise.allSettled(data.map(u => sendMail({
    to: u.email,
    subject: 'Talenco.bj — Votre profil a été archivé',
    html: emailArchived(u.full_name),
  })));
  return data.length;
}

// Étape 2 — désactiver les profils actifs inactifs depuis ≥ 4 mois
async function suspendInactive() {
  const { data } = await supabase.from('users')
    .select('id, email, full_name')
    .in('role', ['candidat', 'candidate'])
    .eq('status', 'active')
    .lt('last_activity', cutoff(120));

  if (!data?.length) return 0;
  await supabase.from('users').update({ status: 'suspended' }).in('id', data.map(u => u.id));
  await Promise.allSettled(data.map(u => sendMail({
    to: u.email,
    subject: 'Talenco.bj — Votre profil a été désactivé',
    html: emailSuspended(u.full_name),
  })));
  return data.length;
}

// Étape 1 — avertir les profils actifs inactifs depuis ≥ 3 mois (une seule fois)
async function warnInactive() {
  const { data } = await supabase.from('users')
    .select('id, email, full_name')
    .in('role', ['candidat', 'candidate'])
    .eq('status', 'active')
    .lt('last_activity', cutoff(90))
    .is('inactivity_warned_at', null);

  if (!data?.length) return 0;
  await supabase.from('users')
    .update({ inactivity_warned_at: new Date().toISOString() })
    .in('id', data.map(u => u.id));
  await Promise.allSettled(data.map(u => sendMail({
    to: u.email,
    subject: 'Talenco.bj — Votre profil sera bientôt désactivé',
    html: emailWarning(u.full_name),
  })));
  return data.length;
}

function emailWarning(nom) {
  return `<div style="font-family:sans-serif;max-width:560px;">
    <h2 style="color:#8B4513;">Bonjour ${nom || ''},</h2>
    <p>Cela fait plus de 3 mois que vous ne vous êtes pas connecté(e) à Talenco.bj.</p>
    <div style="background:#fff8e6;border:1px solid #f5d87a;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0;font-weight:600;color:#92640a;">⚠️ Votre profil sera désactivé dans 30 jours si vous ne vous reconnectez pas.</p>
    </div>
    <p>Une seule connexion suffit à maintenir votre profil actif.</p>
    <p><a href="${SITE}/connexion.html" style="background:#8B4513;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:14px;">Me reconnecter →</a></p>
    <hr style="border:none;border-top:1px solid #e8e0d5;margin:20px 0;">
    <p style="font-size:12px;color:#a09080;">Talenco.bj</p>
  </div>`;
}

function emailSuspended(nom) {
  return `<div style="font-family:sans-serif;max-width:560px;">
    <h2 style="color:#8B4513;">Bonjour ${nom || ''},</h2>
    <p>Votre profil Talenco.bj a été <strong>désactivé</strong> après 4 mois d'inactivité.</p>
    <p>Vos données sont conservées. Vous pouvez revenir à tout moment en réactivant votre compte.</p>
    <div style="background:#f9f6f1;border:1px solid #e8e0d5;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;">
      <div style="font-size:13px;color:#706050;margin-bottom:4px;">Frais de réactivation</div>
      <div style="font-family:serif;font-size:28px;color:#8B4513;font-weight:700;">2 000 FCFA</div>
      <div style="font-size:12px;color:#a09080;">puis 1 000 FCFA/mois</div>
    </div>
    <p><a href="${SITE}/reactivation-demande.html" style="background:#8B4513;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:500;">Réactiver mon compte →</a></p>
    <hr style="border:none;border-top:1px solid #e8e0d5;margin:20px 0;">
    <p style="font-size:12px;color:#a09080;">Talenco.bj</p>
  </div>`;
}

function emailArchived(nom) {
  return `<div style="font-family:sans-serif;max-width:560px;">
    <h2 style="color:#8B4513;">Bonjour ${nom || ''},</h2>
    <p>Votre profil Talenco.bj a été <strong>archivé</strong> suite à 6 mois d'inactivité. Vos données sont intactes.</p>
    <p>Vous pouvez reprendre votre recherche d'emploi à tout moment.</p>
    <div style="background:#f9f6f1;border:1px solid #e8e0d5;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;">
      <div style="font-size:13px;color:#706050;margin-bottom:4px;">Frais de réactivation</div>
      <div style="font-family:serif;font-size:28px;color:#8B4513;font-weight:700;">2 000 FCFA</div>
      <div style="font-size:12px;color:#a09080;">puis 1 000 FCFA/mois</div>
    </div>
    <p><a href="${SITE}/reactivation-demande.html" style="background:#8B4513;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:500;">Réactiver mon compte →</a></p>
    <hr style="border:none;border-top:1px solid #e8e0d5;margin:20px 0;">
    <p style="font-size:12px;color:#a09080;">Talenco.bj</p>
  </div>`;
}
