-- Allow admin users to read and moderate all company_reviews via anon key
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'company_reviews' AND policyname = 'admin_company_reviews'
  ) THEN
    CREATE POLICY "admin_company_reviews" ON public.company_reviews
      FOR ALL
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;
