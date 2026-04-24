import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL         = 'claude-sonnet-4-5';
const MAX_MESSAGES  = 20; // limite quotidienne par user

const sb = createClient(SUPA_URL, SUPA_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT =
  `Tu es TalBot, le coach emploi de Talenco.bj, la plateforme de recrutement N°1 au Bénin. \
Tu aides les candidats à : préparer leurs entretiens, rédiger des lettres de motivation percutantes, \
négocier leur salaire, améliorer leur CV, et naviguer le marché de l'emploi au Bénin \
(ANPE, secteurs porteurs, salaires moyens par secteur). \
Tu réponds en français, avec bienveillance et des conseils concrets et adaptés au contexte africain. \
Tes réponses font 100-200 mots max.`;

// ── Logger dans ai_logs (fire-and-forget) ─────────────────────────────────

function logUsage(userId: string, tokens: number): void {
  sb.from('ai_logs')
    .insert({ user_id: userId, type: 'coach-ia', tokens_used: tokens })
    .then(({ error }) => { if (error) console.warn('ai_logs insert:', error.message); });
}

// ── Vérifier et incrémenter la limite quotidienne ─────────────────────────

async function checkAndIncrementLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: session } = await sb
    .from('coach_sessions')
    .select('message_count')
    .eq('user_id', userId)
    .eq('session_date', today)
    .maybeSingle();

  const current = session?.message_count ?? 0;

  if (current >= MAX_MESSAGES) {
    return { allowed: false, remaining: 0 };
  }

  // Upsert : créé si absent, incrémenté si existant
  await sb.from('coach_sessions').upsert(
    { user_id: userId, session_date: today, message_count: current + 1 },
    { onConflict: 'user_id,session_date' },
  );

  return { allowed: true, remaining: MAX_MESSAGES - current - 1 };
}

// ── Handler principal ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Authentification obligatoire ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);

  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const userId = user.id;

  // ── Limite quotidienne ────────────────────────────────────────────────────
  const { allowed, remaining } = await checkAndIncrementLimit(userId);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'LIMIT_REACHED', remaining: 0 }),
      { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  let messages: Array<{ role: string; content: string }>;
  try {
    const body = await req.json();
    messages = body.messages ?? [];
    if (!messages.length) throw new Error('messages vide');
  } catch {
    return new Response(JSON.stringify({ error: 'messages requis' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Appel Anthropic en mode streaming ─────────────────────────────────────
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key':        ANTHROPIC_KEY,
      'content-type':     'application/json',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 600,
      system:     SYSTEM_PROMPT,
      stream:     true,
      messages,
    }),
  });

  if (!anthropicRes.ok) {
    const errBody = await anthropicRes.text();
    console.error('Anthropic error:', anthropicRes.status, errBody);
    return new Response(JSON.stringify({ error: `Anthropic API ${anthropicRes.status}` }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Transformer le stream SSE : extraire les tokens pour le log ───────────
  // Pipe le stream Anthropic → client en temps réel,
  // tout en interceptant les événements d'usage pour le log final.

  let inputTokens  = 0;
  let outputTokens = 0;

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Traitement async sans bloquer la réponse
  (async () => {
    const reader = anthropicRes.body!.getReader();
    let buffer   = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Forward le chunk brut au client immédiatement
        await writer.write(encoder.encode(chunk));

        // Parser les lignes pour extraire les token counts
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'message_start') {
              inputTokens = event.message?.usage?.input_tokens ?? 0;
            }
            if (event.type === 'message_delta') {
              outputTokens = event.usage?.output_tokens ?? 0;
            }
          } catch { /* chunk incomplet ou non-JSON */ }
        }
      }
    } finally {
      await writer.close();
      logUsage(userId, inputTokens + outputTokens);
      console.log(`✅ coach-ia — tokens: ${inputTokens + outputTokens}, remaining: ${remaining}, user: ${userId}`);
    }
  })();

  return new Response(readable, {
    headers: {
      ...CORS,
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Remaining-Messages': String(remaining),
    },
  });
});
