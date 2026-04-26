import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";

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
2. Lance la simulation avec des questions réalistes du marché béninois
3. Donne un feedback constructif après chaque réponse

Tu réponds toujours en français. Tu es positif mais honnête.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    const limitedMessages = messages.slice(-20);

    // Appel Groq API (compatible OpenAI, streaming)
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 1024,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...limitedMessages,
        ],
        stream: true,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return new Response(
        JSON.stringify({ error: err.error?.message ?? "Erreur Groq" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream la réponse au format SSE (compatible avec le client existant)
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Transformer le format OpenAI SSE vers le format Anthropic SSE attendu par le client
    (async () => {
      const reader = response.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            await writer.write(encoder.encode("data: {\"type\":\"message_stop\"}\n\n"));
            await writer.close();
            break;
          }
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
          for (const line of lines) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                // Convertir au format Anthropic attendu par coach.html
                const anthropicChunk = JSON.stringify({
                  type: "content_block_delta",
                  delta: { type: "text_delta", text: delta }
                });
                await writer.write(encoder.encode(`data: ${anthropicChunk}\n\n`));
              }
            } catch (_) { /* ignorer les lignes invalides */ }
          }
        }
      } catch (e) {
        await writer.abort(e);
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Remaining-Messages": "50",
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
