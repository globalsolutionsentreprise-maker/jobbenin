const { supabase } = require('../../lib/supabase');
const pdf = require('pdf-parse');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { application_id } = req.body ?? {};
  if (!application_id) return res.status(400).json({ error: 'application_id requis' });

  // 1. Charger la candidature + offre + candidat
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select(`
      id, user_id, cv_path, message,
      jobs ( titre, title, description, competences_requises ),
      users!applications_user_id_fkey ( email )
    `)
    .eq('id', application_id)
    .single();

  if (appErr || !app) {
    console.error('score-application: candidature introuvable', appErr);
    return res.status(404).json({ error: 'Candidature introuvable' });
  }

  const job = app.jobs ?? {};
  const jobTitre = job.titre ?? job.title ?? '';
  const jobDescription = (job.description ?? '').substring(0, 1200);
  const jobCompetences = (job.competences_requises ?? '').substring(0, 600);

  // 2. Extraire le texte du CV (PDF depuis Supabase Storage)
  let cvText = '';
  const cvPath = app.cv_path ?? `${app.user_id}/cv.pdf`;

  try {
    const { data: urlData } = await supabase.storage
      .from('cvs')
      .createSignedUrl(cvPath, 120);

    if (urlData?.signedUrl) {
      const pdfBuf = await fetch(urlData.signedUrl).then(r => r.arrayBuffer());
      const parsed = await pdf(Buffer.from(pdfBuf));
      cvText = parsed.text.replace(/\s+/g, ' ').trim().substring(0, 4000);
    }
  } catch (e) {
    console.warn('score-application: PDF parse non-bloquant:', e.message);
  }

  // 3. Prompt de scoring
  const prompt = `Tu es un expert RH senior. Évalue l'adéquation entre ce candidat et ce poste.
Réponds UNIQUEMENT avec du JSON valide, sans texte avant ni après.

=== POSTE ===
Titre : ${jobTitre}
Description : ${jobDescription}
Compétences requises : ${jobCompetences}

=== CANDIDAT ===
${cvText ? `CV :\n${cvText}` : '(CV non parsable)'}
${app.message ? `\nLettre de motivation :\n${app.message.substring(0, 600)}` : ''}

=== FORMAT ATTENDU ===
{
  "score": <entier 0-100>,
  "breakdown": {
    "experience": <0-100>,
    "competences": <0-100>,
    "formation": <0-100>
  },
  "explication": "<2 phrases max : points forts et points faibles du profil pour ce poste>"
}`;

  // 4. Appel Groq
  let scoring;
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Expert RH. Réponds uniquement en JSON valide.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!groqRes.ok) throw new Error(`Groq HTTP ${groqRes.status}: ${await groqRes.text()}`);

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content ?? '{}';
    scoring = JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, ''));
  } catch (e) {
    console.error('score-application: erreur Groq/JSON', e.message);
    return res.status(500).json({ error: 'Erreur scoring IA' });
  }

  // 5. Persister le score
  const finalScore = Math.min(100, Math.max(0, parseInt(scoring.score, 10) || 0));

  const { error: updateErr } = await supabase
    .from('applications')
    .update({
      match_score:       finalScore,
      match_breakdown:   scoring.breakdown ?? {},
      match_explanation: scoring.explication ?? '',
    })
    .eq('id', application_id);

  if (updateErr) {
    console.error('score-application: update error', updateErr);
    return res.status(500).json({ error: 'Erreur sauvegarde score' });
  }

  return res.status(200).json({ ok: true, score: finalScore });
};
