const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non autorisé.' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Non autorisé.' });

  const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Accès refusé.' });

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  if (userId === user.id) return res.status(400).json({ error: 'Impossible de supprimer son propre compte.' });

  // Supprimer de la table users d'abord
  await supabaseAdmin.from('users').delete().eq('id', userId);

  // Supprimer du système d'auth Supabase
  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  return res.status(200).json({ success: true });
};
