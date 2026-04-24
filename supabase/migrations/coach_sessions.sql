-- ══════════════════════════════════════════════════════════════════════
-- Table coach_sessions — limite anti-abus du coach IA (20 msg/jour)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.coach_sessions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_count integer     NOT NULL DEFAULT 0,
  session_date  date        NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (user_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_coach_sessions_user_date
  ON public.coach_sessions (user_id, session_date DESC);

ALTER TABLE public.coach_sessions ENABLE ROW LEVEL SECURITY;

-- La service_role (Edge Function) gère tout
CREATE POLICY "Service role gère les sessions coach"
  ON public.coach_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Chaque user consulte sa propre session (pour afficher le compteur côté front)
CREATE POLICY "User voit sa session coach"
  ON public.coach_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ── Vue utile : quotas consommés par jour ─────────────────────────────────
CREATE OR REPLACE VIEW public.coach_sessions_daily AS
SELECT
  session_date,
  COUNT(DISTINCT user_id) AS nb_users,
  SUM(message_count)      AS total_messages,
  MAX(message_count)      AS max_par_user
FROM public.coach_sessions
GROUP BY session_date
ORDER BY session_date DESC;
