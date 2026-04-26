import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const SYSTEM_PROMPT = `Tu es TalBot, le Coach IA de Talenco.bj — la plateforme de recrutement dédiée au marché béninois.

Tu aides les candidats à :
- Préparer leurs entretiens d'embauche (simulation de questions, feedback)
- Améliorer leur CV et leur lettre de motivation
- Rédiger un pitch professionnel convaincant
- Comprendre le marché de l'emploi au Bénin (secteurs porteurs, salaires, attentes des recruteurs)
- Développer leurs compétences de négociation salariale

Ton style :
- Chaleureux, direct, encourageant — comme un mentor bienveillant
- Concret : tu donnes des exemples précis, pas des généralités
- Tu connais le contexte béninois : secteurs comme la banque, l'IT, l'agriculture, le commerce, les ONG
- Tes réponses sont structurées et actionables
- Tu peux faire des simulations d'entretien en jouant le rôle du recruteur

Quand l'utilisateur demande une simulation d'entretien :
1. Demande le poste et le secteur visé
2. Lance la simulation avec des questions réalistes
3. Donne un feedback constructif après chaque réponse

Tu réponds toujours en français. Tu es positif mais honnête.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Vérifier l'auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages invalides" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limiter l'historique à 20 messages pour éviter les abus
    const limitedMessages = messages.slice(-20);

    // Appel Anthropic en streaming
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: limitedMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return new Response(JSON.stringify({ error: err.error?.message ?? "Erreur Anthropic" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Streamer la réponse directement au client
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Remaining-Messages": "20",
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
