-- Phase 1: just enough schema to support login + the protected profile page.
-- The full schema (orders, pricing, RLS for every table, etc.) lands in Phase 2.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null check (role in ('rep', 'manager')) default 'rep',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- security definer helper used by RLS policies across the app (Phase 2+).
create or replace function is_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'manager' and active
  );
$$;

create policy "profiles_select" on profiles
  for select
  using (id = auth.uid() or is_manager());

create policy "profiles_update" on profiles
  for update
  using (id = auth.uid() or is_manager());

-- The update policy above lets a rep edit their own row, but role/active
-- must stay manager-only or a rep could self-promote in the same request.
create or replace function protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    if new.role is distinct from old.role or new.active is distinct from old.active then
      raise exception 'Only a manager can change role or active status.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on profiles;
create trigger protect_profile_fields
  before update on profiles
  for each row execute function protect_profile_fields();

-- Auto-create a profile row the moment someone signs up via magic link.
-- New users default to 'rep'; promote to 'manager' by hand in the SQL
-- editor for the first admin account.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
