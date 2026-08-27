-- Vendor/manufacturer tracking + true cost, for per-order profit
-- calculation (the owner's requirements: assign a manufacturer or hat guy
-- per line item, track what the shop actually pays, know profit
-- per order).
--
-- Cost and vendor assignment are manager-only end to end. Deliberately
-- NOT columns on orders/order_items: Postgres RLS is row-level, not
-- column-level, and reps already have legitimate SELECT access to their
-- own orders/order_items rows -- a cost column there would leak straight
-- through that existing access. Separate tables let RLS block reps from
-- the cost data entirely, the same way payments already are.

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table vendors enable row level security;

drop policy if exists "vendors_select" on vendors;
create policy "vendors_select" on vendors
  for select using (auth.uid() is not null);
drop policy if exists "vendors_insert" on vendors;
create policy "vendors_insert" on vendors
  for insert with check (is_manager());
drop policy if exists "vendors_update" on vendors;
create policy "vendors_update" on vendors
  for update using (is_manager());
drop policy if exists "vendors_delete" on vendors;
create policy "vendors_delete" on vendors
  for delete using (is_manager());

-- One row per order line item that has cost/vendor entered. unit_cost is
-- entered manually per order rather than pulled from a fixed vendor price
-- list -- material/button choices and per-run negotiation mean cost isn't
-- reliably a fixed lookup. line_cost = unit_cost * order_items.qty is
-- computed in the app, not stored here, since a same-row generated
-- column can't reach across tables to order_items.qty.
create table if not exists order_item_costs (
  order_item_id uuid primary key references order_items (id) on delete cascade,
  vendor_id uuid references vendors (id),
  unit_cost numeric(10,2),
  updated_at timestamptz not null default now()
);

alter table order_item_costs enable row level security;

drop policy if exists "order_item_costs_all" on order_item_costs;
create policy "order_item_costs_all" on order_item_costs
  for all using (is_manager()) with check (is_manager());

drop trigger if exists order_item_costs_touch_updated_at on order_item_costs;
create trigger order_item_costs_touch_updated_at
  before update on order_item_costs
  for each row execute function touch_updated_at();

-- One row per order carrying what the shop pays to ship from the
-- vendor -- separate from orders.shipping_fee, which is what the
-- customer is charged.
create table if not exists order_costs (
  order_id uuid primary key references orders (id) on delete cascade,
  shipping_cost numeric(10,2),
  updated_at timestamptz not null default now()
);

alter table order_costs enable row level security;

drop policy if exists "order_costs_all" on order_costs;
create policy "order_costs_all" on order_costs
  for all using (is_manager()) with check (is_manager());

drop trigger if exists order_costs_touch_updated_at on order_costs;
create trigger order_costs_touch_updated_at
  before update on order_costs
  for each row execute function touch_updated_at();
