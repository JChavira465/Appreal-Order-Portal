-- Lets a rep save a team's roster (names/numbers/sizes) once and reuse it
-- on a future order instead of retyping the whole team every time.
--
-- Keyed by team_name text, not a customers.id FK -- same loose matching
-- convention orders/new/actions.ts already uses to reuse a customer by
-- team name. That means it works even on a brand-new team's very first
-- order, before any customers row exists for them yet.
create table if not exists roster_template_players (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  player_name text,
  player_number text,
  size_label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists roster_template_players_team_name_idx
  on roster_template_players (team_name);

alter table roster_template_players enable row level security;

-- Not manager-only -- any signed-in staff can save/reuse a roster, same
-- boundary as the customers table itself.
drop policy if exists "roster_template_players_all" on roster_template_players;
create policy "roster_template_players_all" on roster_template_players
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
