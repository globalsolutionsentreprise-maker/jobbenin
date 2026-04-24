-- ══════════════════════════════════════════════════════════════════════
-- Table ai_logs — suivi de la consommation IA par user et par type
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_logs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  type        text        NOT NULL,           -- ex: 'generate-offre'
  tokens_used integer     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Index pour les agrégations (dashboard consommation, facturation)
CREATE INDEX IF NOT EXISTS idx_ai_logs_user_id    ON public.ai_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_type       ON public.ai_logs (type);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at ON public.ai_logs (created_at DESC);

ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

-- La service_role (Edge Functions) peut tout insérer
CREATE POLICY "Service role insère les logs IA"
  ON public.ai_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Chaque user ne voit que ses propres logs
CREATE POLICY "User voit ses logs IA"
  ON public.ai_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Vue utile pour le dashboard admin : consommation par semaine et par type
CREATE OR REPLACE VIEW public.ai_logs_weekly AS
SELECT
  date_trunc('week', created_at)  AS semaine,
  type,
  COUNT(*)                        AS nb_appels,
  SUM(tokens_used)                AS total_tokens,
  COUNT(DISTINCT user_id)         AS nb_users
FROM public.ai_logs
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
