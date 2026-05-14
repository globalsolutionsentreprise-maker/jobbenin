-- Migration : système de crédits candidat
-- Activé après la bêta (BETA_FREE_APPLY = false dans candidature.js)
--
-- Les crédits candidat permettent de postuler aux offres nationales et internationales.
-- Inscription, CV, certification et Coach IA restent gratuits.

-- Ajouter les credits sur la table users si pas déjà présents
-- (la colonne existe déjà pour les entreprises, elle est réutilisée pour les candidats)

-- Fonction RPC sécurisée : décrémente les crédits du candidat (min 0, atomique)
CREATE OR REPLACE FUNCTION decrement_candidate_credits(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET credits = GREATEST(credits - 1, 0)
  WHERE id = user_id
    AND role = 'candidate'
    AND credits > 0;
END;
$$;

-- Packs de crédits candidat (référence UI — les transactions passent par FedaPay)
-- Starter  : 5 crédits  → 5 candidatures
-- Actif    : 15 crédits → 15 candidatures  (populaire)
-- Pro      : 50 crédits → 50 candidatures

COMMENT ON FUNCTION decrement_candidate_credits IS
  'Décrémente atomiquement 1 crédit candidat. Utilisé après chaque candidature réussie (post-bêta).';
