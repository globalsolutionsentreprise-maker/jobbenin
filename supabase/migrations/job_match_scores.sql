-- Cache des scores de compatibilité candidat ↔ offre
create table if not exists job_match_scores (
  user_id     uuid not null references users(id) on delete cascade,
  job_id      uuid not null references jobs(id)  on delete cascade,
  score       smallint not null check (score between 0 and 100),
  breakdown   jsonb,           -- {competences, experience, formation}
  explanation text,
  created_at  timestamptz not null default now(),
  primary key (user_id, job_id)
);

alter table job_match_scores enable row level security;

create policy "candidat_own_scores" on job_match_scores
  for all using (auth.uid() = user_id);
