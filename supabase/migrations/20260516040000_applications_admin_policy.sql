-- Politique RLS admin : accès total à la table applications
-- Sans cette politique, l'admin panel (admin.html) est bloqué par RLS
-- car aucune des policies existantes ne couvre le rôle admin.

DROP POLICY IF EXISTS "Admin accès total applications" ON public.applications;

CREATE POLICY "Admin accès total applications"
  ON public.applications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
