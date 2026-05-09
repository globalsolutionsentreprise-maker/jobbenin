-- Cycle de vie candidat : avertissement 3 mois, désactivation 4 mois, archivage 6 mois

-- Ajouter 'archived' au statut (drop+recreate car la contrainte est sans nom)
DO $$
DECLARE _con TEXT;
BEGIN
  SELECT conname INTO _con
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE t.relname = 'users'
    AND n.nspname = 'public'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%';
  IF _con IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.users DROP CONSTRAINT ' || quote_ident(_con);
  END IF;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'suspended', 'pending', 'archived'));

-- Colonne pour éviter les emails d'avertissement répétitifs (remis à NULL à chaque connexion)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS inactivity_warned_at TIMESTAMPTZ;

-- Index dédié au cron lifecycle
CREATE INDEX IF NOT EXISTS idx_users_candidate_lifecycle
  ON public.users (role, status, last_activity)
  WHERE role = 'candidat';
