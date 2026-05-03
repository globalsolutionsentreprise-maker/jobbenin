-- Migration : Table enterprise_invites (phase bêta)
-- À exécuter dans Supabase > SQL Editor

CREATE TABLE IF NOT EXISTS enterprise_invites (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token        text UNIQUE NOT NULL,
  status       text DEFAULT 'pending' CHECK (status IN ('pending', 'used')),
  company_name text,
  company_email text,
  used_at      timestamptz,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE enterprise_invites ENABLE ROW LEVEL SECURITY;

-- Aucun accès public : tout passe par la service_role key (backend)
CREATE POLICY "No public access" ON enterprise_invites FOR ALL USING (false);

-- Permettre la lecture des tokens pour validation côté frontend (anon peut vérifier si token existe)
CREATE POLICY "Read token for validation" ON enterprise_invites
  FOR SELECT
  USING (true);

-- Ajouter colonnes manquantes sur users si nécessaire
ALTER TABLE users ADD COLUMN IF NOT EXISTS status           text DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits          integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sector           text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_size     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city             text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone            text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS test_phase       boolean DEFAULT false;
