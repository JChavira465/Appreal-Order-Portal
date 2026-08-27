-- Phase 2: full order-management schema, RLS, pricing trigger, seed price
-- list. No UI reads/writes any of this yet (Phase 3+) -- this migration is
-- schema only. is_manager()/is_super_admin() from 0002 already cover the
-- three-role system, so RLS below reuses them unchanged from the spec.
--
-- Every policy/trigger is dropped before being recreated, so this file is
-- safe to run more than once (e.g. after a partial failure).

-- ============================================================
-- Price list (source of truth, editable without a deploy)
-- ============================================================

create table if not exists price_items (
  name text primary key,
  base_price numeric(10,2) not null,
  is_headwear boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists price_modifiers (
  item_name text not null references price_items (name),
  key text not null,
  label text not null,
  price numeric(10,2) not null,
  primary key (item_name, key)
);

alter table price_items enable row level security;
alter table price_modifiers enable row level security;

drop policy if exists "price_items_select" on price_items;
create policy "price_items_select" on price_items
  for select using (auth.uid() is not null);
drop policy if exists "price_items_insert" on price_items;
create policy "price_items_insert" on price_items
  for insert with check (is_manager());
drop policy if exists "price_items_update" on price_items;
create policy "price_items_update" on price_items
  for update using (is_manager());
drop policy if exists "price_items_delete" on price_items;
create policy "price_items_delete" on price_items
  for delete using (is_manager());

drop policy if exists "price_modifiers_select" on price_modifiers;
create policy "price_modifiers_select" on price_modifiers
  for select using (auth.uid() is not null);
drop policy if exists "price_modifiers_insert" on price_modifiers;
create policy "price_modifiers_insert" on price_modifiers
  for insert with check (is_manager());
drop policy if exists "price_modifiers_update" on price_modifiers;
create policy "price_modifiers_update" on price_modifiers
  for update using (is_manager());
drop policy if exists "price_modifiers_delete" on price_modifiers;
create policy "price_modifiers_delete" on price_modifiers
  for delete using (is_manager());

-- ============================================================
-- Customers
-- ============================================================

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  contact_name text,
  contact_phone text,
  sport text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table customers enable row level security;

drop policy if exists "customers_select" on customers;
create policy "customers_select" on customers
  for select using (auth.uid() is not null);
drop policy if exists "customers_insert" on customers;
create policy "customers_insert" on customers
  for insert with check (auth.uid() is not null);
drop policy if exists "customers_update" on customers;
create policy "customers_update" on customers
  for update using (auth.uid() is not null);
drop policy if exists "customers_delete" on customers;
create policy "customers_delete" on customers
  for delete using (auth.uid() is not null);

-- ============================================================
-- Orders
-- ============================================================

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number serial,
  rep_id uuid not null references profiles (id),
  customer_id uuid references customers (id),
  team_name text not null,
  contact_name text,
  contact_phone text,
  sport text,
  status text not null default 'submitted' check (
    status in ('submitted', 'mockup_pending', 'mockup_approved',
               'in_production', 'shipped', 'cancelled')
  ),
  revision_requested boolean not null default false,
  deadline date,
  shipping_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  notes text,
  ref_notes text,
  mockup_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table orders enable row level security;

drop policy if exists "orders_select" on orders;
create policy "orders_select" on orders
  for select using (rep_id = auth.uid() or is_manager());
drop policy if exists "orders_insert" on orders;
create policy "orders_insert" on orders
  for insert with check (rep_id = auth.uid());
drop policy if exists "orders_update" on orders;
create policy "orders_update" on orders
  for update using (is_manager() or (rep_id = auth.uid() and status = 'submitted'));
drop policy if exists "orders_delete" on orders;
create policy "orders_delete" on orders
  for delete using (is_manager());

-- RLS above only checks who owns the row and its status, not which columns
-- changed. A rep could otherwise smuggle a discount/shipping_fee change
-- through on their own still-submitted order, so gate those columns the
-- same way protect_profile_fields does. Status is gated too, except for
-- the one rep-allowed transition: cancelling their own submitted order.
create or replace function protect_order_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_manager() then
    if new.discount is distinct from old.discount
       or new.shipping_fee is distinct from old.shipping_fee then
      raise exception 'Only a manager can change discount or shipping fee.';
    end if;

    if new.status is distinct from old.status
       and not (old.status = 'submitted' and new.status = 'cancelled') then
      raise exception 'Only a manager can change order status.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_protect_fields on orders;
create trigger orders_protect_fields
  before update on orders
  for each row execute function protect_order_fields();

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_touch_updated_at on customers;
create trigger customers_touch_updated_at
  before update on customers
  for each row execute function touch_updated_at();

drop trigger if exists orders_touch_updated_at on orders;
create trigger orders_touch_updated_at
  before update on orders
  for each row execute function touch_updated_at();

-- ============================================================
-- Order items -- server-side pricing lives here
-- ============================================================

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  item text not null references price_items (name),
  mods text[] not null default '{}',
  size_breakdown text,
  qty int not null check (qty > 0),
  unit_price numeric(10,2),
  line_total numeric(10,2)
);

alter table order_items enable row level security;

drop policy if exists "order_items_select" on order_items;
create policy "order_items_select" on order_items
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (o.rep_id = auth.uid() or is_manager())
    )
  );
drop policy if exists "order_items_insert" on order_items;
create policy "order_items_insert" on order_items
  for insert with check (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status = 'submitted'))
    )
  );
drop policy if exists "order_items_update" on order_items;
create policy "order_items_update" on order_items
  for update using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status = 'submitted'))
    )
  );
drop policy if exists "order_items_delete" on order_items;
create policy "order_items_delete" on order_items
  for delete using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status = 'submitted'))
    )
  );

-- Never trust unit_price/line_total from the client: look up the current
-- price list ourselves and overwrite whatever was submitted.
create or replace function set_order_item_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base numeric(10,2);
  mods_total numeric(10,2) := 0;
begin
  select base_price into base from price_items where name = new.item;
  if base is null then
    raise exception 'Unknown price item: %', new.item;
  end if;

  if new.mods is not null and array_length(new.mods, 1) > 0 then
    select coalesce(sum(price), 0) into mods_total
    from price_modifiers
    where item_name = new.item and key = any(new.mods);
  end if;

  new.unit_price := base + mods_total;
  new.line_total := new.unit_price * new.qty;
  return new;
end;
$$;

drop trigger if exists order_items_set_price on order_items;
create trigger order_items_set_price
  before insert or update on order_items
  for each row execute function set_order_item_price();

-- ============================================================
-- Order images -- table + RLS only. The storage bucket and its
-- storage.objects policies are Phase 5 (image uploads), not this phase.
-- ============================================================

create table if not exists order_images (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('reference', 'mockup')),
  uploaded_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table order_images enable row level security;

drop policy if exists "order_images_select" on order_images;
create policy "order_images_select" on order_images
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_images.order_id
        and (o.rep_id = auth.uid() or is_manager())
    )
  );
drop policy if exists "order_images_insert" on order_images;
create policy "order_images_insert" on order_images
  for insert with check (
    (
      kind = 'reference' and exists (
        select 1 from orders o
        where o.id = order_images.order_id and o.rep_id = auth.uid()
      )
    )
    or (kind = 'mockup' and is_manager())
  );
drop policy if exists "order_images_delete" on order_images;
create policy "order_images_delete" on order_images
  for delete using (is_manager());

-- ============================================================
-- Payments
-- ============================================================

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  note text,
  recorded_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table payments enable row level security;

drop policy if exists "payments_select" on payments;
create policy "payments_select" on payments
  for select using (
    exists (
      select 1 from orders o
      where o.id = payments.order_id
        and (o.rep_id = auth.uid() or is_manager())
    )
  );
drop policy if exists "payments_insert" on payments;
create policy "payments_insert" on payments
  for insert with check (is_manager());
drop policy if exists "payments_update" on payments;
create policy "payments_update" on payments
  for update using (is_manager());
drop policy if exists "payments_delete" on payments;
create policy "payments_delete" on payments
  for delete using (is_manager());

-- ============================================================
-- Activity log -- append-only, snapshots actor_name so history survives
-- a user being removed later.
-- ============================================================

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  actor_id uuid references profiles (id),
  actor_name text,
  text text not null,
  created_at timestamptz not null default now()
);

alter table activity_log enable row level security;

drop policy if exists "activity_log_select" on activity_log;
create policy "activity_log_select" on activity_log
  for select using (
    exists (
      select 1 from orders o
      where o.id = activity_log.order_id
        and (o.rep_id = auth.uid() or is_manager())
    )
  );
drop policy if exists "activity_log_insert" on activity_log;
create policy "activity_log_insert" on activity_log
  for insert with check (auth.uid() is not null);

-- ============================================================
-- Seed price list
-- ============================================================

-- Dummy demo prices -- round numbers, not tuned to any real shop's
-- margins. Replace with your own price list before going live.
insert into price_items (name, base_price, is_headwear, sort_order) values
  ('Jersey', 20, false, 10),
  ('Standard Performance Hoodie', 30, false, 20),
  ('Cotton Hoodie w/ Embroidery', 35, false, 30),
  ('Performance Pants', 30, false, 40),
  ('Poly Sweatpants', 25, false, 50),
  ('Cotton Sweatpants w/ Embroidery', 30, false, 60),
  ('Shorts', 20, false, 70),
  ('BP Jacket / Quarter Zip', 25, false, 80),
  ('Polo', 25, false, 90),
  ('Arm Band', 10, false, 100),
  ('Headband', 10, false, 110),
  ('Team Towel', 10, false, 120),
  ('Batting Gloves', 20, false, 130),
  ('Fitted Hat', 25, true, 140),
  ('Snapback Hat / Visor', 20, true, 150),
  ('Beanie', 15, true, 160)
on conflict (name) do update set
  base_price = excluded.base_price,
  is_headwear = excluded.is_headwear,
  sort_order = excluded.sort_order;

insert into price_modifiers (item_name, key, label, price) values
  ('Jersey', 'mesh', 'Full Mesh/Meshback', 2),
  ('Jersey', 'hood', 'Hood', 2),
  ('Jersey', 'long_sleeve', 'Long Sleeve', 2),
  ('Jersey', 'two_button', '2-Button', 4),
  ('Jersey', 'full_button', 'Full-Button', 5),
  ('BP Jacket / Quarter Zip', 'long_sleeve', 'Long Sleeve', 2),
  ('BP Jacket / Quarter Zip', 'full_zip', 'Full Zip', 4)
on conflict (item_name, key) do update set
  label = excluded.label,
  price = excluded.price;
