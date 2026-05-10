'use strict';
// Gestion d'équipe multi-comptes recruteurs
//   GET  /api/entreprise                  → liste des membres de l'équipe (owner)
//   GET  /api/entreprise?token=<tok>      → détails d'une invitation (public)
//   POST /api/entreprise action=invite    → inviter un recruteur par email
//   POST /api/entreprise action=accept    → accepter une invitation (token)
//   POST /api/entreprise action=remove    → retirer un membre de l'équipe

const { createClient } = require('@supabase/supabase-js');
const { sendMail }     = require('../../lib/mailer');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getOwner(token) {
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data } = await supabaseAdmin
    .from('users').select('id, role, company_name, company_owner_id, email, full_name')
    .eq('id', user.id).single();
  return data;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleList(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Connexion requise.' });

  const user = await getOwner(token);
  if (!user || user.role !== 'entreprise') return res.status(403).json({ error: 'Accès refusé.' });
  if (user.company_owner_id) return res.status(403).json({ error: 'Seul le propriétaire du compte peut gérer l\'équipe.' });

  const { data: membres } = await supabaseAdmin
    .from('users')
    .select('id, full_name, email, created_at')
    .eq('company_owner_id', user.id)
    .order('created_at', { ascending: true });

  const { data: invites } = await supabaseAdmin
    .from('company_team_invites')
    .select('id, email, status, created_at, expires_at')
    .eq('owner_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return res.status(200).json({ membres: membres ?? [], invites_en_attente: invites ?? [] });
}

async function handleInvite(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Connexion requise.' });

  const user = await getOwner(token);
  if (!user || user.role !== 'entreprise') return res.status(403).json({ error: 'Accès refusé.' });
  if (user.company_owner_id) return res.status(403).json({ error: 'Seul le propriétaire peut inviter.' });

  const { email } = req.body ?? {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide.' });
  }

  // Vérifier si déjà membre
  const { data: existingMember } = await supabaseAdmin
    .from('users').select('id').eq('email', email).eq('company_owner_id', user.id).maybeSingle();
  if (existingMember) return res.status(400).json({ error: 'Cette personne est déjà membre de votre équipe.' });

  // Créer ou réutiliser l'invitation
  const { data: invite, error } = await supabaseAdmin
    .from('company_team_invites')
    .upsert({ owner_id: user.id, email, status: 'pending', expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() },
      { onConflict: 'owner_id,email', ignoreDuplicates: false })
    .select('token').single();

  if (error) {
    console.error('invite upsert:', error);
    return res.status(500).json({ error: 'Erreur création invitation.' });
  }

  const siteUrl = process.env.SITE_URL ?? 'https://talenco-bj.vercel.app';
  const link = `${siteUrl}/invitation-equipe.html?token=${invite.token}`;
  const companyName = user.company_name ?? 'une entreprise';

  try {
    await sendMail({
      to: email,
      subject: `Invitation à rejoindre l'équipe ${companyName} sur Talenco.bj`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#222;">
          <h2 style="color:#8B4513;">Invitation à rejoindre une équipe</h2>
          <p>Bonjour,</p>
          <p><strong>${user.full_name ?? companyName}</strong> vous invite à rejoindre l'espace recruteur de <strong>${companyName}</strong> sur Talenco.bj.</p>
          <p>En acceptant, vous pourrez consulter les candidatures, gérer les offres et contacter des candidats, en partageant les crédits du compte principal.</p>
          <p style="margin:24px 0;">
            <a href="${link}" style="background:#8B4513;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Rejoindre l'équipe</a>
          </p>
          <p style="color:#666;font-size:12px;">Ce lien expire dans 7 jours. Si vous n'attendiez pas cette invitation, ignorez simplement cet email.</p>
        </div>`,
    });
  } catch (e) {
    console.error('invite email:', e.message);
    return res.status(500).json({ error: 'Erreur envoi email.' });
  }

  return res.status(200).json({ ok: true, email });
}

async function handleAccept(req, res) {
  const { token: inviteToken } = req.body ?? {};
  if (!inviteToken) return res.status(400).json({ error: 'Token requis.' });

  const { data: invite } = await supabaseAdmin
    .from('company_team_invites')
    .select('*, users!owner_id(id, company_name, full_name)')
    .eq('token', inviteToken)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!invite) return res.status(400).json({ error: 'Invitation invalide ou expirée.' });

  // L'appelant doit être authentifié
  const authToken = req.headers.authorization?.replace('Bearer ', '');
  if (!authToken) return res.status(401).json({ error: 'Connectez-vous d\'abord pour accepter l\'invitation.' });

  const { data: { user: authUser } } = await supabaseAdmin.auth.getUser(authToken);
  if (!authUser) return res.status(401).json({ error: 'Token invalide.' });

  // L'email doit correspondre
  if (authUser.email !== invite.email) {
    return res.status(403).json({ error: `Cette invitation est pour ${invite.email}. Connectez-vous avec ce compte.` });
  }

  // Mettre à jour l'utilisateur
  const { error: updateErr } = await supabaseAdmin
    .from('users')
    .update({ company_owner_id: invite.owner_id, role: 'entreprise' })
    .eq('id', authUser.id);

  if (updateErr) {
    console.error('accept update:', updateErr);
    return res.status(500).json({ error: 'Erreur mise à jour.' });
  }

  // Marquer l'invitation comme acceptée
  await supabaseAdmin
    .from('company_team_invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id);

  const owner = Array.isArray(invite.users) ? invite.users[0] : invite.users;
  return res.status(200).json({ ok: true, company_name: owner?.company_name ?? '' });
}

async function handleRemove(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Connexion requise.' });

  const user = await getOwner(token);
  if (!user || user.role !== 'entreprise') return res.status(403).json({ error: 'Accès refusé.' });
  if (user.company_owner_id) return res.status(403).json({ error: 'Seul le propriétaire peut retirer un membre.' });

  const { member_id } = req.body ?? {};
  if (!member_id) return res.status(400).json({ error: 'member_id requis.' });

  // Vérifier que le membre appartient bien à cet owner
  const { data: membre } = await supabaseAdmin
    .from('users').select('id').eq('id', member_id).eq('company_owner_id', user.id).maybeSingle();
  if (!membre) return res.status(404).json({ error: 'Membre introuvable.' });

  await supabaseAdmin.from('users').update({ company_owner_id: null }).eq('id', member_id);
  return res.status(200).json({ ok: true });
}

// ── Router ───────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET → liste équipe ou détails invitation (par token)
  if (req.method === 'GET') {
    const { token } = req.query ?? {};
    if (token) {
      // Détails invitation publique (pour invitation-equipe.html)
      const { data: invite } = await supabaseAdmin
        .from('company_team_invites')
        .select('email, status, expires_at, users!owner_id(company_name, full_name)')
        .eq('token', token).single();

      if (!invite || invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Invitation invalide ou expirée.' });
      }
      const owner = Array.isArray(invite.users) ? invite.users[0] : invite.users;
      return res.status(200).json({
        email: invite.email,
        company_name: owner?.company_name ?? '',
        inviteur: owner?.full_name ?? '',
      });
    }
    return handleList(req, res);
  }

  if (req.method === 'POST') {
    const { action } = req.body ?? {};
    if (action === 'invite')  return handleInvite(req, res);
    if (action === 'accept')  return handleAccept(req, res);
    if (action === 'remove')  return handleRemove(req, res);
    return res.status(400).json({ error: 'action requis : invite | accept | remove' });
  }

  return res.status(405).end();
};
