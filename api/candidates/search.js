'use strict';

// GET /api/candidates/search?q=&secteur=&niveau=&dispo=&ville=&certif=&page=
// Recherche filtrée de candidats côté serveur — réservé aux entreprises connectées

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PAGE_SIZE = 20;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  // Auth — entreprise connectée requise
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Connexion requise.' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token invalide.' });

  const { data: company } = await supabaseAdmin
    .from('users').select('role, credits, status').eq('id', user.id).single();
  if (!company || company.role !== 'entreprise')
    return res.status(403).json({ error: 'Réservé aux entreprises.' });

  const { q, secteur, niveau, dispo, ville, certif, page = '0' } = req.query;
  const offset = parseInt(page, 10) * PAGE_SIZE;

  let query = supabaseAdmin
    .from('users')
    .select('id, full_name, job_title, level, availability, city, skills, bio, is_certified, certified_at, created_at, sector, linkedin_url', { count: 'exact' })
    .eq('role', 'candidate')
    .eq('is_active', true)
    .not('job_title', 'is', null)
    .range(offset, offset + PAGE_SIZE - 1);

  // Filtres côté serveur
  if (secteur)         query = query.eq('sector', secteur);
  if (niveau)          query = query.eq('level', niveau);
  if (dispo)           query = query.eq('availability', dispo);
  if (ville)           query = query.eq('city', ville);
  if (certif === '1')  query = query.eq('is_certified', true);

  // Recherche texte sur job_title (PostgreSQL ilike)
  if (q) query = query.ilike('job_title', `%${q}%`);

  // Tri : certifiés en premier, puis les plus récents
  query = query
    .order('is_certified', { ascending: false })
    .order('created_at',   { ascending: false });

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    candidates: data ?? [],
    total: count ?? 0,
    page: parseInt(page, 10),
    pages: Math.ceil((count ?? 0) / PAGE_SIZE),
    credits: company.credits ?? 0,
  });
};
