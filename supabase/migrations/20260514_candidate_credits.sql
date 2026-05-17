-- Migration : système de crédits candidat
-- Activé après la bêta (BETA_FREE_APPLY = false dans candidature.js)
--
-- Les crédits candidat permettent de postuler aux offres.
-- Inscription, CV, certification et Coach IA restent toujours gratuits.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Colonne credits sur users (idempotent)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0;

-- Contrainte de sécurité : interdire les crédits négatifs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users'
      AND constraint_name = 'users_credits_non_negative'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_credits_non_negative CHECK (credits >= 0);
  END IF;
END $$;

-- 2. Fonction RPC sécurisée : décrémente 1 crédit du candidat (atomique, min 0)
--    Appelée côté client dans candidature.js après chaque candidature réussie (post-bêta).
CREATE OR REPLACE FUNCTION decrement_candidate_credits(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users
  SET credits = credits - 1
  WHERE id = user_id
    AND role IN ('candidate', 'candidat')
    AND credits > 0;
END;
$$;

-- Permettre aux utilisateurs authentifiés d'appeler la fonction
GRANT EXECUTE ON FUNCTION decrement_candidate_credits(uuid) TO authenticated;

COMMENT ON FUNCTION decrement_candidate_credits IS
  'Décrémente atomiquement 1 crédit candidat. Appelé après chaque candidature réussie (post-bêta). SECURITY DEFINER = pas de race condition.';

-- 3. Ajouter le type candidat_credits_purchase à la contrainte transactions.type
--    (ALTER TABLE ... DROP CONSTRAINT puis re-ADD avec la liste étendue)
DO $$
BEGIN
  -- Supprimer l'ancienne contrainte si elle existe
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'transactions_type_check'
  ) THEN
    ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
  END IF;
  ALTER TABLE transactions
    ADD CONSTRAINT transactions_type_check
    CHECK (type IN (
      'candidat_subscribe',
      'candidat_reactivate',
      'candidat_credits_purchase',
      'enterprise_purchase'
    ));
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- Packs de crédits candidat (référence UI / webhook)
-- L'achat passe par FedaPay → webhook type=candidat_credits_purchase
--
--   Starter  :  5 crédits  →  1 500 FCFA  (300 FCFA/crédit)
--   Actif    : 15 crédits  →  3 500 FCFA  (233 FCFA/crédit)  ← populaire
--   Pro      : 50 crédits  →  8 000 FCFA  (160 FCFA/crédit)
--
-- Activation post-bêta :
--   1. Dans candidature.js ligne 17 : BETA_FREE_APPLY = false
--   2. Appliquer cette migration sur Supabase Dashboard
-- ─────────────────────────────────────────────────────────────────────
