-- ── Notifications admin (mises à jour de profil) ────────────────────────────
create table if not exists admin_notifications (
  id         uuid        default gen_random_uuid() primary key,
  type       text        not null default 'profile_update',
  user_id    uuid        references users(id) on delete cascade,
  user_name  text,
  user_role  text,  -- 'candidate' | 'entreprise'
  read       boolean     default false,
  created_at timestamptz default now()
);

alter table admin_notifications enable row level security;

-- Tout utilisateur authentifié peut créer une notification (lors du save profil)
create policy "insert_own_notification" on admin_notifications
  for insert with check (auth.uid() = user_id);

-- L'admin peut lire toutes les notifications
create policy "admin_select_notifications" on admin_notifications
  for select using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );

-- L'admin peut les marquer comme lues
create policy "admin_update_notifications" on admin_notifications
  for update using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );

-- L'admin peut supprimer
create policy "admin_delete_notifications" on admin_notifications
  for delete using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );

create index if not exists idx_admin_notifications_read     on admin_notifications(read);
create index if not exists idx_admin_notifications_created  on admin_notifications(created_at desc);


-- ── Messages broadcast admin → utilisateurs ──────────────────────────────────
create table if not exists broadcast_messages (
  id         uuid        default gen_random_uuid() primary key,
  titre      text        not null,
  message    text        not null,
  cible      text        not null default 'candidat'
               check (cible in ('candidat', 'entreprise', 'tous')),
  active     boolean     default true,
  created_at timestamptz default now()
);

alter table broadcast_messages enable row level security;

-- L'admin peut tout faire
create policy "admin_all_broadcast" on broadcast_messages
  for all using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  ) with check (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );

-- Tout utilisateur authentifié peut lire les messages actifs
create policy "read_active_broadcast" on broadcast_messages
  for select using (active = true);
