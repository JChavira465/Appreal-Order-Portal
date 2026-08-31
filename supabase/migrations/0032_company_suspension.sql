-- Wires up companies.active (added in 0030, never actually enforced) to
-- mean something real: suspending a company should lock its staff out of
-- every operational table immediately, not just hide them from a PIN
-- login dropdown.
--
-- current_company_id() is the one function nearly every RLS policy in
-- the app compares a row's company_id against (see 0031). Making it
-- return null for a suspended company's members is a single point of
-- control that cascades everywhere, with zero changes needed to any of
-- those dozens of individual policies: `company_id = current_company_id()`
-- can never match once this returns null, so orders/vendors/customers/
-- everything else fails closed on that user's very next request --
-- their existing session cookie still works, they just can't see or
-- touch any of their company's data anymore.
create or replace function current_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.company_id
  from profiles p
  join companies c on c.id = p.company_id
  where p.id = auth.uid() and c.active;
$$;

-- companies_select deliberately does NOT go through current_company_id()
-- above -- a suspended company's own members still need to see their own
-- company row (specifically, its now-false `active` flag), so the app
-- can show them a clear "your account is suspended" message instead of
-- every other page just silently coming back empty with no explanation.
drop policy if exists "companies_select" on companies;
create policy "companies_select" on companies
  for select using (
    is_platform_admin()
    or id in (select company_id from profiles where id = auth.uid())
  );
