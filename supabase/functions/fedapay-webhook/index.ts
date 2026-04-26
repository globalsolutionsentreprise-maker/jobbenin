import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    console.log('FedaPay webhook reçu:', JSON.stringify(body));

    // FedaPay envoie : { name: "transaction.approved", data: { object: { id, status, ... } } }
    const event       = body?.name ?? body?.event ?? '';
    const transaction = body?.data?.object ?? body?.transaction ?? null;

    if (!event.includes('approved') || !transaction) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fedapayRef = String(transaction.id ?? transaction.reference ?? '');
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Trouver le paiement en attente correspondant
    const { data: payment, error: payErr } = await sb
      .from('payments')
      .select('*')
      .eq('fedapay_ref', fedapayRef)
      .eq('status', 'pending')
      .maybeSingle();

    if (payErr || !payment) {
      console.error('Paiement introuvable pour ref:', fedapayRef);
      return new Response(JSON.stringify({ ok: false, error: 'payment_not_found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Calculer premium_until = maintenant + 30 jours
    const premiumUntil = new Date();
    premiumUntil.setDate(premiumUntil.getDate() + 30);

    const plan = payment.plan ?? 'standard';

    // Activer le premium sur l'utilisateur
    await sb.from('users').update({
      plan:          plan,
      premium_until: premiumUntil.toISOString(),
      is_active:     true,
    }).eq('id', payment.user_id);

    // Marquer le paiement comme traité
    await sb.from('payments').update({
      status:  'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', payment.id);

    console.log(`✅ Premium activé — user: ${payment.user_id} | plan: ${plan} | jusqu'au: ${premiumUntil.toISOString()}`);

    return new Response(JSON.stringify({ ok: true, plan, premium_until: premiumUntil }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Erreur webhook:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
