-- Ajoute la colonne logo_url à companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
