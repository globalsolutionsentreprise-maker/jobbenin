const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service_role key — accès complet
);

const TEST_PHASE_END = '2026-07-12T00:00:00.000Z';
const TEST_CREDITS   = 999;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, company, sector, size, city, prenom, nom, email, phone, password } = req.body;

  if (!token || !company || !email || !password || !prenom || !nom) {
    return res.status(400).json({ error: 'Champs requis manquants.' });
  }

  try {
    // 1. Valider le token
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from('enterprise_invites')
      .select('id, status')
      .eq('token', token)
      .single();

    if (inviteErr || !invite) return res.status(404).json({ error: 'Token invalide.' });
    if (invite.status === 'used') return res.status(409).json({ error: 'Ce lien a déjà été utilisé.' });

    // 2. Créer le compte Supabase Auth
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,   // skip email confirmation durant la phase test
      user_metadata: { prenom, nom, role: 'company', entreprise: company }
    });

    if (authErr) {
      if (authErr.message.includes('already registered')) {
        return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });
      }
      throw authErr;
    }

    const userId = authData.user.id;

    // 3. Créer l'entrée dans la table users
    const { error: dbErr } = await supabaseAdmin.from('users').upsert({
      id:               userId,
      email,
      full_name:        `${prenom} ${nom}`.trim(),
      role:             'company',
      status:           'active',
      company_name:     company,
      sector:           sector  || null,
      company_sector:   sector  || null,
      company_size:     size    || null,
      city:             city    || null,
      phone:            phone   || null,
      credits:          TEST_CREDITS,
      subscription_end: TEST_PHASE_END,
      test_phase:       true
    });

    if (dbErr) throw dbErr;

    // 4. Marquer le token comme utilisé
    await supabaseAdmin
      .from('enterprise_invites')
      .update({ status: 'used', company_email: email, company_name: company, used_at: new Date().toISOString() })
      .eq('id', invite.id);

    return res.status(200).json({ success: true, message: 'Compte entreprise activé.' });
  } catch (err) {
    console.error('enterprise-invite-setup error:', err);
    return res.status(500).json({ error: 'Erreur serveur. Veuillez réessayer.' });
  }
};
