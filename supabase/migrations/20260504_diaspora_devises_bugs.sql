-- Migration : Multi-devise, diaspora, remote, bug reports — IDEMPOTENTE
-- Supabase migration tracking : 20260504

-- ── Table jobs : nouveaux champs ──
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_min       integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_max       integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_currency  text DEFAULT 'FCFA';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_period    text DEFAULT 'mois';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_diaspora_open boolean DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_remote        boolean DEFAULT false;

-- ── Contraintes CHECK sur jobs ──
DO $$ BEGIN
  ALTER TABLE jobs ADD CONSTRAINT jobs_salary_currency_check
    CHECK (salary_currency IN ('FCFA','EUR','USD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE jobs ADD CONSTRAINT jobs_salary_period_check
    CHECK (salary_period IN ('mois','an'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Table users : champs diaspora ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_diaspora          boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS diaspora_visible     boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS diaspora_country     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_currency_pref text DEFAULT 'FCFA';

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_salary_currency_pref_check
    CHECK (salary_currency_pref IN ('FCFA','EUR','USD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Table bug_reports ──
CREATE TABLE IF NOT EXISTS bug_reports (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  text,
  user_role   text,
  page_url    text,
  page_name   text,
  bug_type    text,
  description text NOT NULL,
  severity    text DEFAULT 'normale',
  status      text DEFAULT 'ouvert',
  created_at  timestamptz DEFAULT now()
);

-- Contraintes CHECK sur bug_reports
DO $$ BEGIN
  ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_type_check
    CHECK (bug_type IN ('affichage','fonctionnalite','erreur','lenteur','autre'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_severity_check
    CHECK (severity IN ('bloquant','importante','normale','mineure'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_status_check
    CHECK (status IN ('ouvert','en_cours','resolu','ignore'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Insert own bug report" ON bug_reports;
CREATE POLICY "Insert own bug report" ON bug_reports
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "No public read" ON bug_reports;
CREATE POLICY "No public read" ON bug_reports
  FOR SELECT USING (false);
