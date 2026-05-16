-- Colonne premium_until : date d'expiration de l'abonnement candidat
-- Utilisée par webhook.js, candidat.html, cvtheque.html, offres.html
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS premium_until timestamptz;
