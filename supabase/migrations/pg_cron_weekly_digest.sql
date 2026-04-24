-- ══════════════════════════════════════════════════════════════════════
-- pg_cron : Digest hebdomadaire — tous les lundis à 08h00 Cotonou
-- Cotonou = UTC+1 → lancer à 07h00 UTC
-- ══════════════════════════════════════════════════════════════════════

-- Activer pg_cron si ce n'est pas encore fait (Dashboard → Extensions)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Planifier le digest ──
SELECT cron.schedule(
  'weekly-digest-lundi-8h-cotonou',   -- nom unique du job
  '0 7 * * 1',                        -- lundi 07:00 UTC = 08:00 Cotonou (UTC+1)
  $$
  SELECT net.http_post(
    url     := 'https://ywteoxnkkdgdpbkrlkar.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);

-- ── Alternative si current_setting n'est pas configuré :
-- remplacer 'Bearer ' || current_setting(...) par la service_role_key en dur
-- (uniquement dans la console Supabase, jamais dans git)

-- ── Vérifier que le job est bien enregistré ──
-- SELECT jobid, schedule, command FROM cron.job WHERE jobname = 'weekly-digest-lundi-8h-cotonou';

-- ── Supprimer le job si besoin ──
-- SELECT cron.unschedule('weekly-digest-lundi-8h-cotonou');

-- ── Configurer la service_role_key comme setting Postgres ──
-- (à faire une seule fois dans le SQL Editor de Supabase) :
-- ALTER DATABASE postgres SET app.service_role_key = 'votre_service_role_key_ici';
