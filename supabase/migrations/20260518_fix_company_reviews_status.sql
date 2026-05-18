-- Fix: add 'pending' to company_reviews status check constraint
-- The default status is 'pending' (awaiting moderation), which was missing from the constraint.

ALTER TABLE public.company_reviews
  DROP CONSTRAINT company_reviews_status_check;

ALTER TABLE public.company_reviews
  ADD CONSTRAINT company_reviews_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'published'::text, 'hidden'::text, 'flagged'::text]));
