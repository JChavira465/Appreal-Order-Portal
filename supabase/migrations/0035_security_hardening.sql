-- Security fixes found in a full audit of the multi-tenant conversion.
-- Two distinct problems, both at the database layer where RLS is the
-- real authorization boundary.

-- ============================================================
-- 1. price_modifiers: cross-company read AND write
-- ============================================================
--
-- 0031 wrote these policies while price_modifiers still had no company
-- of its own, so it resolved tenancy by joining price_items on `name`
-- alone: "does a price item with this name exist in MY company?" That
-- was the only option available at the time and it was correct while
-- price_items.name was globally unique.
--
-- 0033 changed that: price_items' key became (company_id, name), and
-- price_modifiers got its own company_id and a composite FK. The
-- policies were never updated to match, so the join now answers the
-- wrong question. Company A and Company B both selling a "Jersey" --
-- which is the normal case, not an edge case -- means A's manager
-- passes the check on B's "Jersey" add-on rows, for select, update and
-- delete alike. A can read what B charges for embroidery, change that
-- price, or delete the row outright.
--
-- This is exactly the failure mode CLAUDE.md warns about: is_manager()
-- describes the *caller's* role and says nothing about which company a
-- row belongs to, so it fails open rather than closed. The row's own
-- company_id is the check; the join to price_items never was.

drop policy if exists "price_modifiers_select" on price_modifiers;
create policy "price_modifiers_select" on price_modifiers
  for select using (
    is_platform_admin() or company_id = current_company_id()
  );

drop policy if exists "price_modifiers_insert" on price_modifiers;
create policy "price_modifiers_insert" on price_modifiers
  for insert with check (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  );

drop policy if exists "price_modifiers_update" on price_modifiers;
create policy "price_modifiers_update" on price_modifiers
  for update using (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  )
  with check (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  );

drop policy if exists "price_modifiers_delete" on price_modifiers;
create policy "price_modifiers_delete" on price_modifiers
  for delete using (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  );

-- ============================================================
-- 2. A manager could promote themselves to super_admin
-- ============================================================
--
-- protect_profile_fields has gated role changes behind is_manager()
-- since 0002, and is_manager() has meant "manager OR super_admin" since
-- that same migration. Combined with profiles_update's `id = auth.uid()`
-- clause (a user may edit their own row), that let any manager set their
-- own role to 'super_admin' -- unlocking partner splits, vendor
-- payments, and the whole /company financial screen.
--
-- app/team-actions.ts already refuses this through the UI (canManage
-- only lets a manager touch reps), but the app is not the boundary here:
-- the anon key is public by design and PostgREST accepts an authenticated
-- PATCH straight to /rest/v1/profiles, never going near that code.
--
-- Tightened so role changes need a super_admin or the platform admin,
-- and nobody can change their own role (a super_admin promoting someone
-- else is fine; a super_admin quietly rewriting their own row is the
-- shape every escalation takes). `active` stays where it was -- a
-- manager deactivating a departing rep is ordinary, expected work.
--
-- Provisioning is unaffected: createStaffAccount and createCompany set
-- role through the service-role client, which has no auth.uid(), and
-- every check below is skipped in that case exactly as before.
create or replace function protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role then
      if not (is_super_admin() or is_platform_admin()) then
        raise exception 'Only the account owner can change a role.';
      end if;
      if new.id = auth.uid() and not is_platform_admin() then
        raise exception 'You can''t change your own role.';
      end if;
    end if;

    if new.active is distinct from old.active and not is_manager()
       and not is_platform_admin() then
      raise exception 'Only a manager can change active status.';
    end if;

    if not is_platform_admin() then
      if new.company_id is distinct from old.company_id
         or new.platform_admin is distinct from old.platform_admin then
        raise exception 'Only the platform admin can change company assignment.';
      end if;
    end if;
  end if;

  return new;
end;
$$;
