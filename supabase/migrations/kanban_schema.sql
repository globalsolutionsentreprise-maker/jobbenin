-- ══════════════════════════════════════════════════════════════════════
-- Migration : Kanban recruteur — note interne + realtime
-- ══════════════════════════════════════════════════════════════════════

-- ── Colonne note interne ──────────────────────────────────────────────
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS note_recruteur text;

-- ── Mise à jour du CHECK statut (ajouter 'preselectionne' si besoin) ─
-- Les 4 statuts kanban correspondent aux valeurs existantes :
--   'envoyée'   → colonne "Reçues"
--   'vue'       → colonne "Présélectionnés"
--   'entretien' → colonne "Entretien"
--   'refusée'   → colonne "Refusées"
-- Aucune modification du CHECK nécessaire.

-- ── Policy RLS : recruteur peut mettre à jour statut + note ──────────
-- (complète les policies existantes de cv_application_schema.sql)
DROP POLICY IF EXISTS "Recruteur met à jour le statut" ON public.applications;

CREATE POLICY "Recruteur met à jour candidature"
  ON public.applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  )
  WITH CHECK (
    statut IN ('envoyée', 'vue', 'entretien', 'refusée')
  );

-- ── Activer Realtime sur la table applications ────────────────────────
-- À faire aussi via Dashboard → Database → Replication → applications
ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;

-- ── Index pour performance du kanban ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_applications_job_statut
  ON public.applications (job_id, statut);
