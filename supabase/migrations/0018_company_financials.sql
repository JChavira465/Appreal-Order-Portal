-- Two things visible ONLY to the account owner (super_admin) -- stricter
-- than every other cost/profit screen in this app, which any manager can
-- see. A manager account (e.g. a business partner who also works the
-- floor) must not see this, which is exactly why it's gated to
-- is_super_admin() rather than is_manager() everywhere below.

-- Fixed profit-split percentages between the owner and his partners
-- (e.g. Partner A 60%, Partner B 40%). Configurable
-- here rather than hardcoded, since splits can change.
create table if not exists partner_splits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  percent numeric(5,2) not null check (percent >= 0 and percent <= 100),
  active boolean not null default true,
  sort_order int not null default 0
);

alter table partner_splits enable row level security;

drop policy if exists "partner_splits_all" on partner_splits;
create policy "partner_splits_all" on partner_splits
  for all using (is_super_admin()) with check (is_super_admin());

-- Money actually paid OUT to a vendor. Vendor "balance owed" is computed
-- (not stored) as: cost incurred across every non-cancelled order
-- attributed to that vendor, minus the sum of these payments. Not tied
-- to a single order -- vendors get paid in bulk covering many orders,
-- unlike customer payments.
create table if not exists vendor_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id),
  amount numeric(10,2) not null check (amount > 0),
  note text,
  paid_at date not null default current_date,
  recorded_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table vendor_payments enable row level security;

drop policy if exists "vendor_payments_all" on vendor_payments;
create policy "vendor_payments_all" on vendor_payments
  for all using (is_super_admin()) with check (is_super_admin());
