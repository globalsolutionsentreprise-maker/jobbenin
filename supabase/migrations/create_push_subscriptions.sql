-- Table push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription jsonb     NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs ne gèrent que leur propre subscription
CREATE POLICY "Candidat gère sa subscription"
  ON public.push_subscriptions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- La service role key peut tout lire (pour l'Edge Function send-push)
CREATE POLICY "Service role lecture totale"
  ON public.push_subscriptions
  FOR SELECT
  TO service_role
  USING (true);
