export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `Tu es un expert RH spécialisé dans le marché de l'emploi béninois.
Rédige une lettre de motivation professionnelle, personnalisée et convaincante.

Règles :
- Entre 200 et 280 mots, ton professionnel et chaleureux
- Adapté au contexte béninois (formules de politesse locales, références au marché local si pertinent)
- Commence directement par "Madame, Monsieur," (pas d'objet, pas d'en-tête)
- 3 paragraphes : accroche sur le poste, valeur ajoutée du candidat, conclusion avec call to action
- Intègre naturellement les compétences et le titre du candidat
- Termine par "Veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées."
- Réponds UNIQUEMENT avec le texte de la lettre, aucun commentaire autour`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { jobTitle, jobDescription, jobRequirements, sector, city, candidatNom, candidatTitre, candidatBio, candidatCompetences } = await req.json();

    if (!jobTitle) {
      return new Response(JSON.stringify({ error: 'Titre du poste manquant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userPrompt = `Rédige une lettre de motivation pour :

POSTE :
- Titre : ${jobTitle}
- Ville : ${city ?? 'Bénin'}
- Secteur : ${sector ?? 'non précisé'}
${jobDescription ? `- Description : ${jobDescription.slice(0, 500)}` : ''}
${jobRequirements ? `- Profil recherché : ${jobRequirements.slice(0, 300)}` : ''}

CANDIDAT :
- Nom : ${candidatNom ?? 'le/la candidat(e)'}
- Titre actuel : ${candidatTitre ?? 'non précisé'}
${candidatBio ? `- Bio : ${candidatBio}` : ''}
${candidatCompetences ? `- Compétences : ${candidatCompetences}` : ''}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 600,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Groq API error:', err);
      return new Response(JSON.stringify({ error: 'Erreur API' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const lettre = data.choices?.[0]?.message?.content?.trim() ?? '';

    return new Response(JSON.stringify({ success: true, lettre }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('agent-lettre-motivation error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
