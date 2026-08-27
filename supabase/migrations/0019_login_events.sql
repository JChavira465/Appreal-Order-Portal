-- Tracks every successful sign-in, for the "Team activity" section on
-- /company (super_admin only, same as profit split and vendor balances).
-- A user can insert their own login event (it's inherently true that
-- they just authenticated -- no privilege risk), but only super_admin
-- can read the log back.

create table if not exists login_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists login_events_profile_id_idx on login_events (profile_id);

alter table login_events enable row level security;

drop policy if exists "login_events_select" on login_events;
create policy "login_events_select" on login_events
  for select using (is_super_admin());

drop policy if exists "login_events_insert" on login_events;
create policy "login_events_insert" on login_events
  for insert with check (profile_id = auth.uid());
