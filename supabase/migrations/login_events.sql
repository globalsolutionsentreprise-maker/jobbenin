-- ══════════════════════════════════════════════════════════════════
-- Migration : Suivi des connexions (login_events)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.login_events (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_events_user_ts
  ON public.login_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_events_ts
  ON public.login_events (created_at DESC);

-- RLS
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

-- L'utilisateur authentifié peut insérer son propre événement
CREATE POLICY "User insère son login"
  ON public.login_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- L'admin peut lire tous les événements
CREATE POLICY "Admin lit les login_events"
  ON public.login_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
