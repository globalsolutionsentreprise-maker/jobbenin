import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL         = 'claude-sonnet-4-5'; // à migrer vers claude-sonnet-4-6 si besoin

const sb = createClient(SUPA_URL, SUPA_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Tu es un expert RH spécialisé dans le marché de l'emploi béninois.
Rédige une offre d'emploi professionnelle, claire et attractive.
Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de blocs de code) avec exactement ces champs :
{
  "titre": "Intitulé précis du poste (ex: Comptable Senior, Responsable Marketing Digital)",
  "description": "Description du poste et des responsabilités (200-300 mots, ton professionnel adapté au marché béninois)",
  "profil_recherche": ["bullet point 1", "bullet point 2", "bullet point 3", "..."],
  "competences_requises": ["compétence 1", "compétence 2", "..."],
  "avantages": ["avantage 1", "avantage 2", "..."]
}
Adapte systématiquement le contenu au contexte économique et culturel du Bénin.`;

// ── Extraire le JSON de la réponse Claude (gère les blocs markdown) ─────────

function parseClaudeJson(text: string): Record<string, unknown> {
  // Enlever les blocs ```json ... ``` si présents
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  return JSON.parse(cleaned);
}

// ── Logger dans ai_logs ───────────────────────────────────────────────────────

async function logUsage(userId: string | null, tokensUsed: number): Promise<void> {
  try {
    await sb.from('ai_logs').insert({
      user_id:    userId,
      type:       'generate-offre',
      tokens_used: tokensUsed,
    });
  } catch (err) {
    // Non bloquant
    console.warn('ai_logs insert failed:', err);
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Récupérer l'user_id depuis le JWT (optionnel — pour le log)
  let userId: string | null = null;
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await sb.auth.getUser(token);
    userId = user?.id ?? null;
  } catch { /* non bloquant */ }

  try {
    const body = await req.json();
    const { poste, entreprise, ville, secteur, type_contrat } = body;

    // Validation des champs requis
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

    // ── Appel API Anthropic ───────────────────────────────────────────────────
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key':        ANTHROPIC_KEY,
        'content-type':     'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 1500,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errBody);
      return new Response(
        JSON.stringify({ error: `Anthropic API ${anthropicRes.status}` }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const anthropicData = await anthropicRes.json();
    const rawText: string = anthropicData.content?.[0]?.text ?? '';
    const tokensUsed: number =
      (anthropicData.usage?.input_tokens ?? 0) + (anthropicData.usage?.output_tokens ?? 0);

    // ── Parser le JSON retourné par Claude ─────────────────────────────────────
    let offre: Record<string, unknown>;
    try {
      offre = parseClaudeJson(rawText);
    } catch (parseErr) {
      console.error('JSON parse error. Réponse brute:', rawText);
      return new Response(
        JSON.stringify({ error: 'Réponse IA invalide — réessayez', raw: rawText }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ── Logger la consommation (fire-and-forget) ───────────────────────────────
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
