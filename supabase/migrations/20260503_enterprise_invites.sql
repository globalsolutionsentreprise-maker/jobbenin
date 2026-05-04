-- Migration : Table enterprise_invites (phase bêta) — IDEMPOTENTE
-- Supabase migration tracking : 20260503

-- ── Table ──
CREATE TABLE IF NOT EXISTS enterprise_invites (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token        text UNIQUE NOT NULL,
  status       text DEFAULT 'pending' CHECK (status IN ('pending', 'used')),
  company_name  text,
  company_email text,
  used_at      timestamptz,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE enterprise_invites ENABLE ROW LEVEL SECURITY;

-- ── Policies (drop + recreate = idempotent) ──
DROP POLICY IF EXISTS "No public access" ON enterprise_invites;
CREATE POLICY "No public access" ON enterprise_invites FOR ALL USING (false);

DROP POLICY IF EXISTS "Read token for validation" ON enterprise_invites;
CREATE POLICY "Read token for validation" ON enterprise_invites
  FOR SELECT USING (true);

-- ── Colonnes users ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS status           text DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits          integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sector           text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_size     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city             text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone            text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS test_phase       boolean DEFAULT false;
