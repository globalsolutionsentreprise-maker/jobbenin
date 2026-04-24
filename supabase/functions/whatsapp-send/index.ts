import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL    = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WA_TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!;
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!;
const WA_VERIFY   = Deno.env.get('WHATSAPP_VERIFY_TOKEN')!;
const SITE_URL    = 'https://talenco.bj';

const sb     = createClient(SUPA_URL, SUPA_KEY);
const WA_API = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Envoyer via template WhatsApp "alerte_emploi" ────────────────────

async function sendTemplate(
  phone: string,
  titre: string,
  company: string,
  ville: string,
  offreUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(WA_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: 'alerte_emploi',
          language: { code: 'fr' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: titre },
              { type: 'text', text: company },
              { type: 'text', text: ville },
              { type: 'text', text: offreUrl },
            ],
          }],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ── Logger dans ai_logs (fire-and-forget) ────────────────────────────

function logWaError(phone: string, error: string): void {
  console.error(`[whatsapp-send] erreur ${phone}:`, error);
  sb.from('ai_logs')
    .insert({ user_id: null, type: 'whatsapp-error', tokens_used: 0 })
    .then(({ error: e }) => { if (e) console.warn('ai_logs insert:', e.message); });
}

// ── Traiter messages entrants (STOP ou OTP) ──────────────────────────

async function handleIncomingMessage(from: string, text: string): Promise<void> {
  const normalized = text.trim().toUpperCase();

  if (normalized === 'STOP') {
    const { error } = await sb
      .from('whatsapp_subscribers')
      .update({ is_active: false })
      .eq('phone', from);
    if (error) console.error('STOP update error:', error.message);
    else console.log(`STOP reçu de ${from} → désabonné`);
    return;
  }

  // Code OTP : 6 chiffres exacts
  if (/^\d{6}$/.test(text.trim())) {
    const code = text.trim();
    const { data: otp } = await sb
      .from('otp_codes')
      .select('code, expires_at')
      .eq('phone', from)
      .single();

    if (!otp) {
      console.log(`OTP reçu de ${from} mais aucun code en attente`);
      return;
    }

    if (new Date(otp.expires_at) < new Date()) {
      await sb.from('otp_codes').delete().eq('phone', from);
      console.log(`OTP expiré pour ${from}`);
      return;
    }

    if (otp.code === code) {
      await Promise.all([
        sb.from('whatsapp_subscribers').update({ is_verified: true }).eq('phone', from),
        sb.from('otp_codes').delete().eq('phone', from),
      ]);
      console.log(`✅ OTP validé via WhatsApp pour ${from}`);
    } else {
      console.log(`OTP incorrect de ${from}`);
    }
  }
}

// ── Handler principal ─────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── GET : vérification webhook Meta ──────────────────────────────────
  if (req.method === 'GET') {
    const url       = new URL(req.url);
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === WA_VERIFY && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── POST webhook Meta : messages entrants ─────────────────────────────
  if (body.object === 'whatsapp_business_account') {
    try {
      const entries = (body.entry as any[]) ?? [];
      for (const entry of entries) {
        const changes = entry?.changes ?? [];
        for (const change of changes) {
          const messages = change?.value?.messages ?? [];
          for (const msg of messages) {
            if (msg.type === 'text' && msg.text?.body) {
              await handleIncomingMessage(String(msg.from), String(msg.text.body));
            }
          }
        }
      }
    } catch (err) {
      console.error('Webhook processing error:', err);
    }
    // Meta requiert une réponse 200 rapide
    return new Response('ok', { status: 200 });
  }

  // ── POST interne : envoyer alertes pour un job_id ─────────────────────
  const { job_id } = body as { job_id?: string };
  if (!job_id) {
    return new Response(JSON.stringify({ error: 'job_id requis' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Récupérer l'offre
  const { data: job, error: jobErr } = await sb
    .from('jobs')
    .select('id, titre, title, entreprise, company, ville, secteur')
    .eq('id', job_id)
    .single();

  if (jobErr || !job) {
    return new Response(JSON.stringify({ error: 'Offre introuvable' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const titre    = job.titre    ?? job.title   ?? "Offre d'emploi";
  const company  = job.entreprise ?? job.company ?? 'Une entreprise';
  const offreUrl = `${SITE_URL}/offre-detail.html?id=${job.id}`;

  // Récupérer tous les abonnés actifs et vérifiés
  const { data: subscribers } = await sb
    .from('whatsapp_subscribers')
    .select('phone, secteurs, villes')
    .eq('is_active', true)
    .eq('is_verified', true);

  if (!subscribers?.length) {
    return new Response(
      JSON.stringify({ success: true, sent: 0, reason: 'Aucun abonné actif' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // Filtrer secteur OU ville
  const matching = subscribers.filter((s) =>
    (s.secteurs as string[]).includes(job.secteur) ||
    (s.villes   as string[]).includes(job.ville),
  );

  if (!matching.length) {
    return new Response(
      JSON.stringify({ success: true, sent: 0, reason: 'Aucune correspondance secteur/ville' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // Envois parallèles — ne jamais bloquer sur un seul échec
  const results = await Promise.allSettled(
    matching.map(async (sub) => {
      const result = await sendTemplate(sub.phone, titre, company, job.ville, offreUrl);
      if (!result.ok) logWaError(sub.phone, result.error ?? 'Erreur inconnue');
      return result;
    }),
  );

  const sent   = results.filter(
    (r) => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok,
  ).length;
  const failed = results.length - sent;

  console.log(`✅ whatsapp-send — job ${job_id}: ${sent}/${results.length} envoyés`);

  return new Response(
    JSON.stringify({ success: true, sent, failed, total: results.length }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
});
