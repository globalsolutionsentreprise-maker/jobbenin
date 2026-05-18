-- Champs dédiés aux offres de stage
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS stage_duree TEXT,
  ADD COLUMN IF NOT EXISTS stage_gratification BOOLEAN,
  ADD COLUMN IF NOT EXISTS stage_gratification_montant INTEGER,
  ADD COLUMN IF NOT EXISTS stage_profil_cible TEXT;
