// ── À coller dans ajouter-offre.html juste après l'insertion réussie ──
// Remplacer SUPABASE_URL et SUPABASE_ANON_KEY par vos vraies valeurs.

const SUPABASE_URL = 'https://ywteoxnkkdgdpbkrlkar.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY_ICI';

async function inserErOffre(formData) {
  // 1. Insérer l'offre dans la table jobs
  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      titre:      formData.titre,
      entreprise: formData.entreprise,
      ville:      formData.ville,
      secteur:    formData.secteur,
      // ...autres champs...
    })
    .select('id')
    .single();

  if (error) {
    console.error('Erreur insertion offre :', error.message);
    return;
  }

  console.log('✅ Offre insérée :', job.id);

  // 2. Déclencher les push notifications (fire-and-forget, sans bloquer l'UI)
  fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ job_id: job.id }),
  })
    .then((r) => r.json())
    .then((r) => console.log(`📬 Push envoyés : ${r.sent ?? 0}`))
    .catch((err) => console.warn('Push non critique :', err));
}
