/**
 * snippet-whatsapp-ajouter-offre.js — Talenco.bj
 * ══════════════════════════════════════════════════════════════
 * Ajouter dans ajouter-offre.html, dans le callback d'insertion
 * réussie d'une offre, APRÈS l'appel send-push existant.
 *
 * Chercher le bloc qui ressemble à :
 *   const { data: newJob, error } = await supabase.from('jobs').insert(...).select().single();
 *   if (!error && newJob) {
 *     // ... appel send-push existant ...
 *   }
 *
 * Ajouter juste après l'appel send-push :
 */

// ── Notifier WhatsApp (fire-and-forget) ──────────────────────────────
// À placer après le bloc send-push existant, dans le même if (!error && newJob)

fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
  method: 'POST',
  headers: {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${window.SUPABASE_ANON_KEY ?? ''}`,
  },
  body: JSON.stringify({ job_id: newJob.id }),
}).catch(() => {}); // fire-and-forget : ne jamais bloquer l'UI

/**
 * ══════════════════════════════════════════════════════════════
 * RÉSULTAT FINAL dans ajouter-offre.html :
 * ══════════════════════════════════════════════════════════════
 *
 * const { data: newJob, error } = await supabase
 *   .from('jobs')
 *   .insert({ titre, entreprise, ville, secteur, ... })
 *   .select()
 *   .single();
 *
 * if (!error && newJob) {
 *   // Push notifications (existant)
 *   fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json',
 *                'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}` },
 *     body: JSON.stringify({ job_id: newJob.id }),
 *   }).catch(() => {});
 *
 *   // ← AJOUTER ICI : alertes WhatsApp
 *   fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json',
 *                'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}` },
 *     body: JSON.stringify({ job_id: newJob.id }),
 *   }).catch(() => {});
 *
 *   // Redirection ou message succès
 *   alert('Offre publiée !');
 * }
 */
