-- RPC : incrémenter le compteur de vues d'une offre
-- Appelée depuis offre-detail.html (fire-and-forget, côté candidat)
-- SECURITY DEFINER pour bypasser RLS sur jobs (candidats ne peuvent pas UPDATE jobs)

CREATE OR REPLACE FUNCTION public.increment_job_view(job_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.jobs
  SET view_count = view_count + 1
  WHERE id = job_id
    AND status = 'published';
$$;

-- Accessible par tous (anon inclus) — la fonction est en SECURITY DEFINER
-- et ne modifie que view_count, sans exposer de données sensibles.
GRANT EXECUTE ON FUNCTION public.increment_job_view(uuid) TO anon, authenticated;
