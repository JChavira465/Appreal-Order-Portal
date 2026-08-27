-- Everyone signs in with name + PIN instead of email (managers included).
-- Under the hood this still uses Supabase Auth password sign-in (so
-- RLS/auth.uid() keep working) -- reps get an invisible synthetic email
-- only the server ever touches; managers/super_admin keep the real email
-- they originally signed up with, just resolved server-side instead of
-- typed at login.

-- Widen role to add a third tier: super_admin can do everything a manager
-- can, plus create other managers.
do $$
declare
  role_check_name text;
begin
  select con.conname into role_check_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'profiles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role%';

  if role_check_name is not null then
    execute format('alter table profiles drop constraint %I', role_check_name);
  end if;
end $$;

alter table profiles
  add constraint profiles_role_check
  check (role in ('rep', 'manager', 'super_admin'));

-- super_admin inherits every is_manager() gated policy/action.
create or replace function is_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('manager', 'super_admin') and active
  );
$$;

create or replace function is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'super_admin' and active
  );
$$;

-- Server actions provision accounts using the service_role key, which has
-- no auth.uid() (no end-user session attached). Only block role/active
-- changes made through an authenticated, non-manager session -- that's the
-- case this trigger exists to stop (a rep self-promoting via their own
-- session). Trusted server code already gates who may call it before ever
-- touching the admin client.
create or replace function protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_manager() then
    if new.role is distinct from old.role or new.active is distinct from old.active then
      raise exception 'Only a manager can change role or active status.';
    end if;
  end if;
  return new;
end;
$$;

-- Lets the (unauthenticated) login page list active staff by name so
-- anyone can pick their name from a dropdown instead of typing an email.
-- Only exposes id + name, nothing sensitive.
drop function if exists list_active_reps();

create or replace function list_active_staff()
returns table (id uuid, full_name text)
language sql
security definer
stable
set search_path = public
as $$
  select id, full_name
  from profiles
  where active and full_name is not null
  order by full_name;
$$;

grant execute on function list_active_staff() to anon, authenticated;
