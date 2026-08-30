-- Reshapes vendor/cost tracking to match how Prime Apparel actually
-- assigns work (per the owner's answers): the whole order goes to one
-- apparel manufacturer, except hat line items, which go to one of two
-- separate hat vendors. Also adds a per-vendor price list (cost is fixed
-- per item per manufacturer, with the occasional bulk-order discount
-- entered manually as before) so entering a line's cost isn't fully
-- manual every single time.

alter table vendors add column if not exists kind text
  not null default 'apparel'
  check (kind in ('apparel', 'hat'));

-- The order-level manufacturer for every non-headwear line on the order.
-- Headwear lines keep using order_item_costs.vendor_id (from 0008) for
-- their own hat vendor instead, since hats don't follow the order's
-- manufacturer.
alter table order_costs add column if not exists manufacturer_id uuid
  references vendors (id);

create table if not exists vendor_item_costs (
  vendor_id uuid not null references vendors (id) on delete cascade,
  item text not null references price_items (name),
  unit_cost numeric(10,2) not null,
  updated_at timestamptz not null default now(),
  primary key (vendor_id, item)
);

alter table vendor_item_costs enable row level security;

drop policy if exists "vendor_item_costs_all" on vendor_item_costs;
create policy "vendor_item_costs_all" on vendor_item_costs
  for all using (is_manager()) with check (is_manager());

drop trigger if exists vendor_item_costs_touch_updated_at on vendor_item_costs;
create trigger vendor_item_costs_touch_updated_at
  before update on vendor_item_costs
  for each row execute function touch_updated_at();
