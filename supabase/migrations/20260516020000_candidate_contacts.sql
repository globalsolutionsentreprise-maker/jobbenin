-- Historique des contacts entreprise → candidat (1 crédit par contact)
create table if not exists candidate_contacts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references users(id) on delete cascade,
  candidate_id uuid not null references users(id) on delete cascade,
  message      text,
  created_at   timestamptz not null default now(),
  constraint candidate_contacts_unique unique (company_id, candidate_id)
);

alter table candidate_contacts enable row level security;

-- Entreprise : voir ses propres contacts
drop policy if exists "company_own_contacts" on candidate_contacts;
create policy "company_own_contacts" on candidate_contacts
  for select using (auth.uid() = company_id);

-- Admin : tout voir
drop policy if exists "admin_all_contacts" on candidate_contacts;
create policy "admin_all_contacts" on candidate_contacts
  for all using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );

create index if not exists candidate_contacts_company_idx on candidate_contacts(company_id);
