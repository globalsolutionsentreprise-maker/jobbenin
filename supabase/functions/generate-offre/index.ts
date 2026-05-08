import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL  = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GROQ_KEY  = Deno.env.get('GROQ_API_KEY')!;
const MODEL     = 'llama-3.3-70b-versatile';

const sb = createClient(SUPA_URL, SUPA_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Tu es un expert RH spécialisé dans le marché de l'emploi béninois.
Rédige une offre d'emploi professionnelle, claire et attractive.
Réponds UNIQUEMENT en JSON valide avec exactement ces champs :
{
  "titre": "Intitulé précis du poste (ex: Comptable Senior, Responsable Marketing Digital)",
  "description": "Description du poste et des responsabilités (200-300 mots, ton professionnel adapté au marché béninois)",
  "profil_recherche": ["bullet point 1", "bullet point 2", "bullet point 3", "..."],
  "competences_requises": ["compétence 1", "compétence 2", "..."],
  "avantages": ["avantage 1", "avantage 2", "..."]
}
Adapte systématiquement le contenu au contexte économique et culturel du Bénin.`;

async function logUsage(userId: string | null, tokensUsed: number): Promise<void> {
  try {
    await sb.from('ai_logs').insert({
      user_id:     userId,
      type:        'generate-offre',
      tokens_used: tokensUsed,
    });
  } catch (err) {
    console.warn('ai_logs insert failed:', err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let userId: string | null = null;
  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await sb.auth.getUser(token);
    userId = user?.id ?? null;
  } catch { /* non bloquant */ }

  try {
    const body = await req.json();
    const { poste, entreprise, ville, secteur, type_contrat } = body;

    const missing = ['poste', 'ville', 'secteur', 'type_contrat'].filter((k) => !body[k]?.trim());
    if (missing.length) {
      return new Response(
        JSON.stringify({ error: `Champs manquants : ${missing.join(', ')}` }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const userPrompt =
      `Génère une offre d'emploi pour le poste suivant :
- Poste : ${poste}
- Entreprise : ${entreprise || 'Non précisée'}
- Ville : ${ville}
- Secteur : ${secteur}
- Type de contrat : ${type_contrat}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model:           MODEL,
        max_tokens:      1500,
        temperature:     0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt },
        ],
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errBody);
      return new Response(
        JSON.stringify({ error: `Groq API ${groqRes.status}` }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const groqData = await groqRes.json();
    const rawText: string = groqData.choices?.[0]?.message?.content ?? '';
    const tokensUsed: number =
      (groqData.usage?.prompt_tokens ?? 0) + (groqData.usage?.completion_tokens ?? 0);

    let offre: Record<string, unknown>;
    try {
      offre = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('JSON parse error. Réponse brute:', rawText);
      return new Response(
        JSON.stringify({ error: 'Réponse IA invalide — réessayez', raw: rawText }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    logUsage(userId, tokensUsed);
    console.log(`✅ generate-offre — tokens: ${tokensUsed}, user: ${userId ?? 'anon'}`);

    return new Response(
      JSON.stringify({ success: true, offre, tokens_used: tokensUsed }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('generate-offre erreur:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
