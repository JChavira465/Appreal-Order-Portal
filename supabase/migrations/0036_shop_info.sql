-- Per-company "shop info": the standing terms a customer needs to see
-- alongside an order -- payment terms, turnaround time, and how tax and
-- shipping are handled. Every shop has these written down somewhere
-- (SOK Nation's price sheet carries all three), and today they live
-- nowhere in the app, so a customer reading a receipt or a tracking page
-- has no idea when their order lands or what they still owe.
--
-- Deliberately a separate table rather than columns on `companies`.
-- companies_update is platform-admin-only for a reason: `active` is the
-- suspension lever (0032), and `slug` is what every company's sign-in URL
-- resolves through. Opening that row up so an owner could edit their own
-- turnaround time would hand them their own un-suspend button and the
-- ability to rename the slug out from under their staff's bookmarks.
-- A separate table keeps the writable surface to exactly these three
-- fields.

create table if not exists company_settings (
  company_id uuid primary key references companies (id) on delete cascade,
  payment_terms text,
  turnaround_time text,
  tax_shipping_note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

alter table company_settings enable row level security;

-- Read: anyone inside the company, plus the platform admin. The
-- customer-facing pages (/track and /order/[token]) read this through
-- the service-role client, same as they already read the order and the
-- catalog -- there's no session on those pages to scope by.
drop policy if exists "company_settings_select" on company_settings;
create policy "company_settings_select" on company_settings
  for select using (
    is_platform_admin() or company_id = current_company_id()
  );

-- Write: managers and up. This is customer-facing copy about money and
-- timelines, not something a rep should be able to rewrite mid-shift.
-- Both halves of the check matter: is_manager() says the caller is a
-- manager *somewhere*, company_id = current_company_id() says the row
-- being written is their own company's.
drop policy if exists "company_settings_insert" on company_settings;
create policy "company_settings_insert" on company_settings
  for insert with check (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  );

drop policy if exists "company_settings_update" on company_settings;
create policy "company_settings_update" on company_settings
  for update using (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  )
  with check (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  );

-- Matches every other tenant table (0030): an insert from a normal
-- session lands in the caller's own company without the app having to
-- say so. The platform admin, who has no company of their own, sets it
-- explicitly -- app/shop-info/actions.ts does exactly that.
alter table company_settings alter column company_id set default current_company_id();
