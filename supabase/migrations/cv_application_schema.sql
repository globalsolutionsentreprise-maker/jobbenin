-- ══════════════════════════════════════════════════════════════════════
-- Migration : CV Storage + Candidature 1 clic
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Colonnes supplémentaires ────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cv_path    text,
  ADD COLUMN IF NOT EXISTS cv_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan       text DEFAULT 'gratuit'; -- 'gratuit' | 'standard' | 'premium'

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS cv_path    text,        -- snapshot du path au moment de la candidature
  ADD COLUMN IF NOT EXISTS statut     text NOT NULL DEFAULT 'envoyée', -- envoyée | vue | entretien | refusée
  ADD COLUMN IF NOT EXISTS message    text;         -- lettre d'accompagnement optionnelle

-- Contrainte sur statut
ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_statut_check;
ALTER TABLE public.applications
  ADD CONSTRAINT applications_statut_check
    CHECK (statut IN ('envoyée', 'vue', 'entretien', 'refusée'));

-- Index pour les lookups fréquents
CREATE INDEX IF NOT EXISTS idx_applications_job_user ON public.applications (job_id, user_id);
CREATE INDEX IF NOT EXISTS idx_applications_statut   ON public.applications (statut);

-- ── 2. Bucket Supabase Storage "cvs" ──────────────────────────────────────
-- À exécuter via le Dashboard Supabase → Storage → New bucket
-- Ou via le client Supabase Admin :
--
-- bucket : id = 'cvs', name = 'cvs', public = false, fileSizeLimit = 5242880 (5 MB)
-- allowedMimeTypes = ['application/pdf']
--
-- Équivalent SQL (si l'extension storage est disponible dans le SQL editor) :
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cvs',
  'cvs',
  false,
  5242880,                       -- 5 Mo
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. RLS sur applications ───────────────────────────────────────────────

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Candidat voit ses propres candidatures
CREATE POLICY "Candidat voit ses candidatures"
  ON public.applications FOR SELECT
  USING (auth.uid() = user_id);

-- Candidat insère sa propre candidature
CREATE POLICY "Candidat insère une candidature"
  ON public.applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Recruteur voit les candidatures sur ses offres
CREATE POLICY "Recruteur voit candidatures de ses offres"
  ON public.applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        AND j.user_id = auth.uid()
    )
  );

-- Recruteur met à jour le statut (vue / entretien / refusée)
CREATE POLICY "Recruteur met à jour le statut"
  ON public.applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        AND j.user_id = auth.uid()
    )
  )
  WITH CHECK (statut IN ('vue', 'entretien', 'refusée'));

-- ── 4. RLS sur storage.objects (bucket cvs) ───────────────────────────────

-- Candidat peut uploader son propre CV (chemin : cvs/USER_ID/cv.pdf)
CREATE POLICY "Candidat upload son CV"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidat peut lire son propre CV
CREATE POLICY "Candidat lit son CV"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidat peut remplacer son CV
CREATE POLICY "Candidat remplace son CV"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidat peut supprimer son CV
CREATE POLICY "Candidat supprime son CV"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Recruteur (plan Standard ou Premium) peut lire le CV
-- d'un candidat ayant postulé à une de ses offres
CREATE POLICY "Recruteur lit CV des candidats"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'cvs'
    AND EXISTS (
      SELECT 1
      FROM   public.applications a
      JOIN   public.jobs j ON j.id = a.job_id
      JOIN   public.users u ON u.id = auth.uid()
      WHERE  a.cv_path = name           -- le path du CV dans storage
        AND  j.user_id = auth.uid()     -- l'offre appartient au recruteur connecté
        AND  u.plan IN ('standard', 'premium')
    )
  );
