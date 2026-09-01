-- Fixes a real multi-tenant bug: price_items has used `name` as its
-- primary key since 0003, meaning it was implicitly assuming ONE shop's
-- worth of item names would ever exist in the whole database. The moment
-- a second company tries to add an item name another company already
-- has ("Jersey", "Hoodie", "Polo" -- exactly the generic names every
-- apparel shop reaches for first), the insert fails outright with a raw
-- primary-key violation, and RLS makes it worse: a manager's own
-- "does this already exist" check only sees their own company's rows,
-- so the failure looks like a bug, not a name collision with a company
-- they've never heard of.
--
-- Same problem, one level down: price_modifiers.item_name, order_items.item,
-- and vendor_item_costs.item all reference price_items(name) directly, so
-- they inherit the same global-uniqueness assumption.
--
-- Fix: price_items' real key is (company_id, name), not name alone. The
-- three referencing tables each get their own company_id column (for
-- order_items and vendor_item_costs, auto-stamped by trigger from their
-- parent order/vendor -- no app code needs to change to supply it) and a
-- composite foreign key against (company_id, name) instead of name alone.

alter table price_items drop constraint if exists price_items_pkey;
alter table price_items add constraint price_items_pkey primary key (company_id, name);

-- ============================================================
-- price_modifiers
-- ============================================================

alter table price_modifiers add column if not exists company_id uuid references companies (id);

update price_modifiers pm
set company_id = pi.company_id
from price_items pi
where pi.name = pm.item_name and pm.company_id is null;

alter table price_modifiers alter column company_id set not null;
alter table price_modifiers alter column company_id set default current_company_id();

do $$
declare
  fk_name text;
begin
  select con.conname into fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'price_modifiers'
    and con.contype = 'f'
    and pg_get_constraintdef(con.oid) ilike '%price_items%';

  if fk_name is not null then
    execute format('alter table price_modifiers drop constraint %I', fk_name);
  end if;
end $$;

alter table price_modifiers
  add constraint price_modifiers_item_fkey
  foreign key (company_id, item_name) references price_items (company_id, name);

alter table price_modifiers drop constraint if exists price_modifiers_pkey;
alter table price_modifiers add constraint price_modifiers_pkey primary key (company_id, item_name, key);

-- ============================================================
-- order_items -- company_id auto-stamped from the parent order, so
-- app/orders/new/actions.ts (and everywhere else that inserts a line
-- item) needs zero changes to keep working.
-- ============================================================

alter table order_items add column if not exists company_id uuid references companies (id);

update order_items oi
set company_id = o.company_id
from orders o
where o.id = oi.order_id and oi.company_id is null;

alter table order_items alter column company_id set not null;

create or replace function set_order_item_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select company_id into new.company_id from orders where id = new.order_id;
  return new;
end;
$$;

drop trigger if exists order_items_set_company_id on order_items;
create trigger order_items_set_company_id
  before insert on order_items
  for each row execute function set_order_item_company_id();

do $$
declare
  fk_name text;
begin
  select con.conname into fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'order_items'
    and con.contype = 'f'
    and pg_get_constraintdef(con.oid) ilike '%price_items%';

  if fk_name is not null then
    execute format('alter table order_items drop constraint %I', fk_name);
  end if;
end $$;

alter table order_items
  add constraint order_items_item_fkey
  foreign key (company_id, item) references price_items (company_id, name);

-- ============================================================
-- vendor_item_costs -- company_id auto-stamped from the vendor, same
-- reasoning as order_items above.
-- ============================================================

alter table vendor_item_costs add column if not exists company_id uuid references companies (id);

update vendor_item_costs vic
set company_id = v.company_id
from vendors v
where v.id = vic.vendor_id and vic.company_id is null;

alter table vendor_item_costs alter column company_id set not null;

create or replace function set_vendor_item_cost_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select company_id into new.company_id from vendors where id = new.vendor_id;
  return new;
end;
$$;

drop trigger if exists vendor_item_costs_set_company_id on vendor_item_costs;
create trigger vendor_item_costs_set_company_id
  before insert on vendor_item_costs
  for each row execute function set_vendor_item_cost_company_id();

do $$
declare
  fk_name text;
begin
  select con.conname into fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'vendor_item_costs'
    and con.contype = 'f'
    and pg_get_constraintdef(con.oid) ilike '%price_items%';

  if fk_name is not null then
    execute format('alter table vendor_item_costs drop constraint %I', fk_name);
  end if;
end $$;

alter table vendor_item_costs
  add constraint vendor_item_costs_item_fkey
  foreign key (company_id, item) references price_items (company_id, name);
