-- Système de vérification entreprise : RCCM + IFU + entretien certification

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS rccm                   TEXT,
  ADD COLUMN IF NOT EXISTS ifu                    TEXT,
  ADD COLUMN IF NOT EXISTS company_sector         TEXT,
  ADD COLUMN IF NOT EXISTS company_size           TEXT,
  ADD COLUMN IF NOT EXISTS verification_status    TEXT DEFAULT 'none'
    CHECK (verification_status IN ('none','docs_submitted','docs_verified','interview_scheduled','certified','rejected')),
  ADD COLUMN IF NOT EXISTS certif_notes           TEXT,
  ADD COLUMN IF NOT EXISTS certif_interview_date  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certif_interview_format TEXT
    CHECK (certif_interview_format IN ('google_meet','whatsapp')),
  ADD COLUMN IF NOT EXISTS certif_interview_link  TEXT,
  ADD COLUMN IF NOT EXISTS certif_responsible     TEXT,
  ADD COLUMN IF NOT EXISTS verified_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certified_at_company   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_verification_status
  ON public.users (role, verification_status)
  WHERE role = 'company';
