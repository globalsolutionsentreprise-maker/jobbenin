import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL    = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WA_TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!;
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!;

const sb     = createClient(SUPA_URL, SUPA_KEY);
const WA_API = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Valider un numéro international ──────────────────────────────────

function isValidPhone(phone: string): boolean {
  return /^\+\d{10,15}$/.test(phone.replace(/\s/g, ''));
}

// ── Générer un OTP à 6 chiffres ───────────────────────────────────────

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Envoyer un message texte libre (hors template) ───────────────────

async function sendTextMessage(phone: string, text: string): Promise<boolean> {
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
        type: 'text',
        text: { body: text },
      }),
    });
    if (!res.ok) {
      console.error('WA sendText error:', res.status, await res.text());
    }
    return res.ok;
  } catch (err) {
    console.error('WA sendText exception:', err);
    return false;
  }
}

// ── Handler principal ─────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
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

  // ════════════════════════════════════════════════════════════════════
  // ROUTE A : Vérification OTP  { phone, code }
  // ════════════════════════════════════════════════════════════════════

  if ('code' in body) {
    const { phone, code } = body as { phone?: string; code?: string };

    if (!phone || !code) {
      return new Response(JSON.stringify({ error: 'phone et code requis' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const cleanPhone = phone.replace(/\s/g, '');

    const { data: otp } = await sb
      .from('otp_codes')
      .select('code, expires_at')
      .eq('phone', cleanPhone)
      .single();

    if (!otp) {
      return new Response(
        JSON.stringify({ error: 'Aucun code en attente pour ce numéro — renvoyez le code' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    if (new Date(otp.expires_at) < new Date()) {
      await sb.from('otp_codes').delete().eq('phone', cleanPhone);
      return new Response(
        JSON.stringify({ error: 'Code expiré — cliquez sur "Renvoyer le code"' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    if (otp.code !== String(code).trim()) {
      return new Response(
        JSON.stringify({ error: 'Code incorrect — vérifiez le message WhatsApp reçu' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // Code valide → activer
    await Promise.all([
      sb.from('whatsapp_subscribers')
        .update({ is_verified: true })
        .eq('phone', cleanPhone),
      sb.from('otp_codes').delete().eq('phone', cleanPhone),
    ]);

    console.log(`✅ WhatsApp vérifié : ${cleanPhone}`);

    return new Response(
      JSON.stringify({ success: true, message: 'WhatsApp vérifié — alertes activées !' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ROUTE B : Inscription  { phone, secteurs[], villes[] }
  // Requiert un JWT Supabase valide
  // ════════════════════════════════════════════════════════════════════

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);

  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { phone, secteurs = [], villes = [] } = body as {
    phone?: string;
    secteurs?: string[];
    villes?: string[];
  };

  if (!phone) {
    return new Response(
      JSON.stringify({ error: 'Numéro de téléphone requis' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  const cleanPhone = phone.replace(/\s/g, '');

  if (!isValidPhone(cleanPhone)) {
    return new Response(
      JSON.stringify({ error: 'Format invalide — utilisez le format international : +22961234567' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // Vérifier si déjà abonné et vérifié pour ce user
  const { data: existing } = await sb
    .from('whatsapp_subscribers')
    .select('id, is_verified, phone')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.is_verified && existing.phone === cleanPhone) {
    // Mise à jour des préférences uniquement
    await sb
      .from('whatsapp_subscribers')
      .update({ secteurs, villes })
      .eq('id', existing.id);

    return new Response(
      JSON.stringify({ success: true, message: 'Préférences mises à jour', already_verified: true }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // Upsert de l'abonné
  if (existing) {
    await sb
      .from('whatsapp_subscribers')
      .update({ phone: cleanPhone, secteurs, villes, is_verified: false, is_active: true })
      .eq('id', existing.id);
  } else {
    await sb.from('whatsapp_subscribers').insert({
      user_id: user.id,
      phone: cleanPhone,
      secteurs,
      villes,
      is_verified: false,
      is_active: true,
    });
  }

  // Générer et stocker l'OTP (10 minutes)
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await sb.from('otp_codes').upsert(
    { phone: cleanPhone, code: otp, expires_at: expiresAt },
    { onConflict: 'phone' },
  );

  // Envoyer le code via WhatsApp
  const sent = await sendTextMessage(
    cleanPhone,
    `Votre code de vérification Talenco.bj : *${otp}*\n\nCe code expire dans 10 minutes.\nNe le partagez avec personne.\n\nSi vous n'avez pas demandé ce code, ignorez ce message.`,
  );

  if (!sent) {
    return new Response(
      JSON.stringify({ error: "Impossible d'envoyer le code — vérifiez le numéro et réessayez" }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  console.log(`✅ OTP envoyé à ${cleanPhone} (user: ${user.id})`);

  return new Response(
    JSON.stringify({ success: true, message: 'Code envoyé sur WhatsApp' }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
});
