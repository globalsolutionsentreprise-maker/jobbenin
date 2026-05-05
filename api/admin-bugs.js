const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { secret, action, id, status } = req.body || {};
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Non autorisé.' });

  // ── Action : mise à jour du statut d'un bug ──
  if (action === 'update_status') {
    if (!id || !status) return res.status(400).json({ error: 'id et status requis.' });
    const { error } = await sb.from('bug_reports').update({ status }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // ── Action par défaut : liste tous les bugs ──
  const { data, error } = await sb
    .from('bug_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ bugs: data || [] });
};
