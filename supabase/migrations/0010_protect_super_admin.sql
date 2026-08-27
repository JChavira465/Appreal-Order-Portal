-- Belt-and-suspenders on top of the app-layer check already in
-- app/team-actions.ts's setStaffActive (which refuses to deactivate a
-- super_admin through the app's own button): block it at the database
-- level too, so a super_admin account can't be deactivated by accident
-- through a future code path, a bug, or a manual edit in the SQL editor.
-- Unlike protect_profile_fields (which only checks the acting user's
-- role), this has no auth.uid() escape hatch -- it fires for every
-- update, including ones run as postgres/service_role.

create or replace function protect_super_admin_active()
returns trigger
language plpgsql
as $$
begin
  if old.role = 'super_admin' and new.active = false then
    raise exception 'A super_admin account can''t be deactivated.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_super_admin_active on profiles;
create trigger profiles_protect_super_admin_active
  before update on profiles
  for each row execute function protect_super_admin_active();
