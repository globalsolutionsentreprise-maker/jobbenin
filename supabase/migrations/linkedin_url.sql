-- Ajout du champ LinkedIn optionnel sur les candidats
ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
