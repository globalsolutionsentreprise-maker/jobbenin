-- Multi-comptes recruteurs : team members + invitations
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_owner_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS company_team_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  token      text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status     text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  CONSTRAINT company_team_invites_uq UNIQUE (owner_id, email)
);

ALTER TABLE company_team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON company_team_invites
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "public_select" ON company_team_invites
  FOR SELECT USING (true);
