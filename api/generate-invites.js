const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 }   = require('uuid');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY;
const INVITE_COUNT = 15;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Non autorisé.' });

  try {
    // Compter les invitations déjà existantes
    const { count } = await supabaseAdmin
      .from('enterprise_invites')
      .select('id', { count: 'exact', head: true });

    if (count >= INVITE_COUNT) {
      return res.status(200).json({ message: `${count} invitations déjà générées.`, already_done: true });
    }

    const toCreate = INVITE_COUNT - (count || 0);
    const rows     = Array.from({ length: toCreate }, () => ({
      token:  uuidv4(),
      status: 'pending'
    }));

    const { data, error } = await supabaseAdmin
      .from('enterprise_invites')
      .insert(rows)
      .select('id, token, status, created_at');

    if (error) throw error;

    const siteUrl = process.env.SITE_URL || 'https://talenco-bj.vercel.app';
    const links   = data.map(r => ({
      id:     r.id,
      token:  r.token,
      status: r.status,
      link:   `${siteUrl}/invitation-entreprise.html?token=${r.token}`
    }));

    return res.status(200).json({ success: true, created: toCreate, invites: links });
  } catch (err) {
    console.error('generate-invites error:', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
