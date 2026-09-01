-- Customer-facing order intake: a rep sends a link, the customer fills
-- out the order themselves, and it lands in that rep's company queue
-- attributed to that rep.
--
-- The customer is never signed in, so the link's token is the only thing
-- identifying which company (and which rep) the order belongs to. Tokens
-- are resolved server-side with the service-role client -- anon never
-- gets RLS read access to this table, so a token can't be enumerated or
-- traded for anything except submitting one order to the company that
-- issued it.

create table if not exists order_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  company_id uuid not null references companies (id),
  rep_id uuid not null references profiles (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists order_links_rep_id_idx on order_links (rep_id);
create unique index if not exists order_links_one_per_rep on order_links (rep_id);

alter table order_links enable row level security;

-- A rep manages their own link; a manager can see their whole company's;
-- the platform admin sees everything. Anon is deliberately absent --
-- the public order page resolves tokens with the service-role client.
drop policy if exists "order_links_select" on order_links;
create policy "order_links_select" on order_links
  for select using (
    is_platform_admin()
    or (
      company_id = current_company_id()
      and (rep_id = auth.uid() or is_manager())
    )
  );

drop policy if exists "order_links_insert" on order_links;
create policy "order_links_insert" on order_links
  for insert with check (
    is_platform_admin()
    or (company_id = current_company_id() and rep_id = auth.uid())
  );

drop policy if exists "order_links_update" on order_links;
create policy "order_links_update" on order_links
  for update using (
    is_platform_admin()
    or (
      company_id = current_company_id()
      and (rep_id = auth.uid() or is_manager())
    )
  );

-- Lets the shop tell at a glance which orders the customer entered
-- themselves vs. which a rep took down -- they need a closer read before
-- going to production, since nobody on staff has eyed the details yet.
alter table orders add column if not exists customer_submitted boolean not null default false;

-- ============================================================
-- Pricing trigger fix (follows from 0033)
-- ============================================================

-- 0033 made price_items' key (company_id, name), but this trigger still
-- looked an item up by name alone. With two companies both selling a
-- "Jersey", `select ... into` takes an arbitrary matching row -- so an
-- order could silently be priced against a different company's catalog.
-- Scope both lookups to the order's own company.
create or replace function set_order_item_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base numeric(10,2);
  mods_total numeric(10,2) := 0;
  item_company_id uuid;
begin
  select company_id into item_company_id from orders where id = new.order_id;

  select base_price into base
  from price_items
  where name = new.item and company_id = item_company_id;

  if base is null then
    raise exception 'Unknown price item: %', new.item;
  end if;

  if new.mods is not null and array_length(new.mods, 1) > 0 then
    select coalesce(sum(price), 0) into mods_total
    from price_modifiers
    where item_name = new.item
      and company_id = item_company_id
      and key = any(new.mods);
  end if;

  new.unit_price := base + mods_total;
  new.line_total := new.unit_price * new.qty;
  return new;
end;
$$;
