CREATE TABLE IF NOT EXISTS public.saved_jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id     uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_jobs_unique UNIQUE (user_id, job_id)
);

ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_jobs_own" ON public.saved_jobs
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS saved_jobs_user_idx ON public.saved_jobs(user_id);
CREATE INDEX IF NOT EXISTS saved_jobs_job_idx  ON public.saved_jobs(job_id);
