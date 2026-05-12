-- Champs structurés pour les offres (format éditorial + stats)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_mode      TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS time_type      TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pourquoi_postuler TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS futur_employeur   TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS view_count     INTEGER NOT NULL DEFAULT 0;

-- Normalise les valeurs work_mode existantes (is_remote → work_mode)
UPDATE jobs SET work_mode = 'teletravail' WHERE is_remote = true  AND work_mode IS NULL;
UPDATE jobs SET work_mode = 'presentiel'  WHERE is_remote = false AND work_mode IS NULL;
