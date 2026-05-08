export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `Tu es un expert RH spécialisé dans le marché de l'emploi béninois.
Analyse le CV fourni et retourne une évaluation structurée.

Réponds UNIQUEMENT en JSON valide avec ce format exact :
{
  "score": 72,
  "points_forts": ["point fort 1", "point fort 2", "point fort 3"],
  "conseils": [
    {
      "priorite": "haute",
      "titre": "Titre court du conseil",
      "conseil": "Description concrète et actionnable (2-3 phrases max)",
      "exemple": "Exemple concret de reformulation ou d'action"
    }
  ]
}

Règles :
- score : entier entre 0 et 100 (sois honnête)
- points_forts : 2 à 3 éléments positifs réels du CV
- conseils : exactement 4 conseils, priorite ∈ ["haute", "moyenne"]
- Conseils spécifiques au contenu du CV, pas des généralités
- Adapté au marché du travail béninois (secteurs, niveaux de rémunération, attentes locales)
- Ton encourageant mais direct`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    const { cvText } = await req.json();

    if (!cvText || typeof cvText !== 'string' || cvText.trim().length < 50) {
      return new Response(JSON.stringify({ error: 'Texte du CV trop court ou manquant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const truncated = cvText.slice(0, 6000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1024,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Voici le CV à analyser :\n\n${truncated}` },
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
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    const analyse = JSON.parse(raw);

    return new Response(JSON.stringify({ success: true, analyse }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('agent-coach-cv error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
