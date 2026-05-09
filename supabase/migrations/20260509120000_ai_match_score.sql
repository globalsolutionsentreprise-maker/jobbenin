-- ══════════════════════════════════════════════════════════════════════
-- Migration : Score IA d'adéquation candidat ↔ poste
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS match_score      integer CHECK (match_score >= 0 AND match_score <= 100),
  ADD COLUMN IF NOT EXISTS match_breakdown  jsonb,
  ADD COLUMN IF NOT EXISTS match_explanation text;

-- Index pour trier par score dans le kanban
CREATE INDEX IF NOT EXISTS idx_applications_match_score
  ON public.applications (job_id, match_score DESC NULLS LAST);
