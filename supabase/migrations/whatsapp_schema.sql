-- ══════════════════════════════════════════════════════════════════════
-- Migration : Alertes WhatsApp — Talenco.bj
-- ══════════════════════════════════════════════════════════════════════

-- ── Table abonnés WhatsApp ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_subscribers (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES public.users(id) ON DELETE CASCADE,
  phone       varchar(20) NOT NULL,
  is_verified boolean     DEFAULT false,
  secteurs    text[]      DEFAULT '{}',
  villes      text[]      DEFAULT '{}',
  is_active   boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- Contrainte : un seul enregistrement par user_id (modifiable)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_subscribers_user
  ON public.whatsapp_subscribers (user_id);

-- Index de performance pour le matching des alertes
CREATE INDEX IF NOT EXISTS idx_wa_subscribers_active
  ON public.whatsapp_subscribers (is_active, is_verified)
  WHERE is_active = true AND is_verified = true;

-- RLS
ALTER TABLE public.whatsapp_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidat gère son propre abonnement"
  ON public.whatsapp_subscribers
  USING (user_id = auth.uid());

CREATE POLICY "Service role accès total"
  ON public.whatsapp_subscribers
  TO service_role USING (true) WITH CHECK (true);

-- ── Table codes OTP (TTL 10 min) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.otp_codes (
  phone      varchar(20) PRIMARY KEY,
  code       varchar(6)  NOT NULL,
  expires_at timestamptz DEFAULT now() + interval '10 minutes'
);

-- RLS strict : uniquement service_role
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role uniquement"
  ON public.otp_codes
  TO service_role USING (true) WITH CHECK (true);

-- ── Nettoyage automatique OTP expirés (optionnel si pg_cron activé) ──
-- SELECT cron.schedule(
--   'clean-otp-codes',
--   '*/15 * * * *',
--   'DELETE FROM public.otp_codes WHERE expires_at < now()'
-- );
