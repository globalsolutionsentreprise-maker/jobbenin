-- Alertes emploi : candidats abonnés à des mots-clés
create table if not exists job_alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  keywords   text not null,          -- ex: "développeur web", "comptable"
  ville      text,                    -- optionnel, ex: "Cotonou"
  created_at timestamptz not null default now(),
  constraint job_alerts_user_keywords unique (user_id, keywords, ville)
);

alter table job_alerts enable row level security;

-- Candidat : lire et gérer ses propres alertes
create policy "candidat_own_alerts" on job_alerts
  for all using (auth.uid() = user_id);

-- Index pour la recherche rapide par user
create index if not exists job_alerts_user_idx on job_alerts(user_id);
