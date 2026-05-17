-- ── Protection RLS colonne credits ──────────────────────────────────────────
-- Empêche un utilisateur de s'auto-créditer via le client Supabase.
-- Le webhook utilise le service key (bypass RLS) donc non affecté.

-- S'assurer que RLS est activé sur users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Politique : un user peut lire son propre profil
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_select_own'
  ) THEN
    CREATE POLICY users_select_own ON users FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

-- Politique : un user peut mettre à jour son propre profil SAUF credits/role/status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_update_own_safe'
  ) THEN
    CREATE POLICY users_update_own_safe ON users FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Fonction admin : ajouter des crédits de bienvenue en masse (service_role uniquement)
CREATE OR REPLACE FUNCTION admin_add_welcome_credits(
  target_role text DEFAULT 'candidat',
  credits_amount integer DEFAULT 5
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE users
  SET credits = credits + credits_amount
  WHERE role IN ('candidate', 'candidat')
    AND status = 'active'
    AND credits = 0;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION admin_add_welcome_credits IS
  'Ajoute des crédits de bienvenue aux candidats actifs sans crédits. Appel via service_role uniquement (admin).';

-- ── Outil admin : ajuster les crédits d un utilisateur précis ────────────────
CREATE OR REPLACE FUNCTION admin_set_user_credits(
  target_user_id uuid,
  new_credits integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users SET credits = new_credits WHERE id = target_user_id;
END;
$$;

COMMENT ON FUNCTION admin_set_user_credits IS
  'Définit le solde de crédits d un utilisateur précis. Appel via service_role uniquement (admin).';
