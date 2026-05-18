'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function requireAdmin(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const adminUser = await requireAdmin(req);
  if (!adminUser) return res.status(401).json({ error: 'Non autorisé' });

  const { action, id, status } = req.body || {};

  if (action === 'update_status') {
    if (!id || !status) return res.status(400).json({ error: 'Paramètres manquants' });
    const allowed = ['ouvert', 'en_cours', 'resolu', 'ignore'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

    const { error } = await supabaseAdmin
      .from('bug_reports')
      .update({ status })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // Liste des rapports (action par défaut)
  const { data: bugs, error } = await supabaseAdmin
    .from('bug_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ bugs: bugs || [] });
};
