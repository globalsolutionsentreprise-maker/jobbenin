import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;

const sb = createClient(SUPA_URL, SUPA_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'job_id requis' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    webpush.setVapidDetails(
      'mailto:contact@talenco.bj',
      VAPID_PUBLIC,
      VAPID_PRIVATE,
    );

    // Récupérer l'offre
    const { data: job, error: jobError } = await sb
      .from('jobs')
      .select('id, titre, entreprise, ville, secteur')
      .eq('id', job_id)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Offre introuvable' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Trouver les utilisateurs dont les alertes correspondent (secteur OU ville)
    const { data: matchingAlerts } = await sb
      .from('alerts')
      .select('user_id')
      .or(`secteur.eq.${job.secteur},ville.eq.${job.ville}`);

    if (!matchingAlerts?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: 'Aucun abonné correspondant' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const userIds = [...new Set(matchingAlerts.map((a) => a.user_id))];

    // Récupérer leurs subscriptions push
    const { data: subs } = await sb
      .from('push_subscriptions')
      .select('subscription')
      .in('user_id', userIds);

    if (!subs?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: 'Aucune subscription push' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.stringify({
      title: 'Talenco — Nouvelle offre 🇧🇯',
      body: `${job.titre} chez ${job.entreprise} à ${job.ville}`,
      url: `/offre.html?id=${job.id}`,
    });

    // Envoyer les notifications en parallèle
    const results = await Promise.allSettled(
      subs.map(({ subscription }) =>
        webpush.sendNotification(subscription, payload)
      ),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - sent;

    console.log(`✅ Push envoyés: ${sent}/${results.length}`);

    return new Response(JSON.stringify({ success: true, sent, failed, total: results.length }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-push error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
