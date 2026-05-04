-- Migration : Multi-devise, diaspora, remote, bug reports
-- À exécuter dans Supabase > SQL Editor

-- ── Table jobs : nouveaux champs ──
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_min      integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_max      integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_currency text DEFAULT 'FCFA' CHECK (salary_currency IN ('FCFA','EUR','USD'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_period   text DEFAULT 'mois' CHECK (salary_period IN ('mois','an'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_diaspora_open boolean DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_remote        boolean DEFAULT false;

-- ── Table users : champs diaspora ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_diaspora          boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS diaspora_visible     boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS diaspora_country     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_currency_pref text DEFAULT 'FCFA' CHECK (salary_currency_pref IN ('FCFA','EUR','USD'));

-- ── Table bug_reports ──
CREATE TABLE IF NOT EXISTS bug_reports (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  text,
  user_role   text,
  page_url    text,
  page_name   text,
  bug_type    text CHECK (bug_type IN ('affichage','fonctionnalite','erreur','lenteur','autre')),
  description text NOT NULL,
  severity    text DEFAULT 'normale' CHECK (severity IN ('bloquant','importante','normale','mineure')),
  status      text DEFAULT 'ouvert' CHECK (status IN ('ouvert','en_cours','resolu','ignore')),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Tout utilisateur connecté peut soumettre un bug
CREATE POLICY "Insert own bug report" ON bug_reports
  FOR INSERT WITH CHECK (true);

-- Lecture réservée à l'admin (service_role uniquement)
CREATE POLICY "No public read" ON bug_reports
  FOR SELECT USING (false);
