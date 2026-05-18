-- Ajout colonne compétences techniques (optionnel) sur les offres
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS competences_requises TEXT;
