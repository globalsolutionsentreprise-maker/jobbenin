CREATE OR REPLACE FUNCTION public.get_company_response_days(p_company_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count   int;
  v_avg_days int;
BEGIN
  SELECT COUNT(*),
         ROUND(AVG(EXTRACT(EPOCH FROM (a.updated_at - a.created_at)) / 86400))::int
  INTO   v_count, v_avg_days
  FROM   public.applications a
  JOIN   public.jobs j ON j.id = a.job_id
  WHERE  j.company_id = p_company_id
    AND  a.statut != 'envoyée';

  IF v_count >= 3 THEN
    RETURN v_avg_days;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;
