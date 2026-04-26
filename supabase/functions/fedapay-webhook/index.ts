import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Définition des plans et leurs limites
const PLAN_CONFIG: Record<string, {
  role: 'candidate' | 'company';
  max_offres: number | null;
  max_contacts: number | null;
  badge_verifie: boolean;
  label: string;
}> = {
  candidat_premium: {
    role: 'candidate',
    max_offres: null,
    max_contacts: null,
    badge_verifie: false,
    label: 'Premium Candidat',
  },
  starter: {
    role: 'company',
    max_offres: 5,
    max_contacts: 10,
    badge_verifie: false,
    label: 'Starter',
  },
  pro: {
    role: 'company',
    max_offres: null,
    max_contacts: null,
    badge_verifie: true,
    label: 'Pro',
  },
};

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    console.log('FedaPay webhook reçu:', JSON.stringify(body));

    const event       = body?.name ?? body?.event ?? '';
    const transaction = body?.data?.object ?? body?.transaction ?? null;

    if (!event.includes('approved') || !transaction) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fedapayRef = String(transaction.id ?? transaction.reference ?? '');
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Trouver le paiement en attente
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

    const planId = payment.plan ?? 'candidat_premium';
    const config = PLAN_CONFIG[planId];

    if (!config) {
      console.error('Plan inconnu:', planId);
      return new Response(JSON.stringify({ ok: false, error: 'unknown_plan' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // premium_until = aujourd'hui + 30 jours
    const premiumUntil = new Date();
    premiumUntil.setDate(premiumUntil.getDate() + 30);

    // Mise à jour de l'utilisateur selon le plan
    const updateData: Record<string, unknown> = {
      plan:          planId,
      premium_until: premiumUntil.toISOString(),
      is_active:     true,
    };

    if (config.badge_verifie) {
      updateData.is_certified = true;
    }
    if (config.max_offres !== null) {
      updateData.max_offres_actives = config.max_offres;
    } else {
      updateData.max_offres_actives = 9999; // illimité
    }
    if (config.max_contacts !== null) {
      updateData.max_contacts_mois = config.max_contacts;
    } else {
      updateData.max_contacts_mois = 9999; // illimité
    }

    const { error: userErr } = await sb
      .from('users')
      .update(updateData)
      .eq('id', payment.user_id);

    if (userErr) {
      console.error('Erreur mise à jour user:', userErr.message);
      return new Response(JSON.stringify({ ok: false, error: userErr.message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Marquer le paiement comme traité
    await sb.from('payments').update({
      status:  'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', payment.id);

    console.log(`✅ Plan "${config.label}" activé — user: ${payment.user_id} | jusqu'au: ${premiumUntil.toISOString()}`);

    return new Response(JSON.stringify({
      ok: true,
      plan: planId,
      label: config.label,
      premium_until: premiumUntil,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Erreur webhook:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
