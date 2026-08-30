-- Multi-tenant foundation. Up to this migration, every table implicitly
-- belonged to one shop -- RLS only ever checked *role* (rep/manager/
-- super_admin), never *which business*. That's fine with one tenant, but
-- means nothing stops a manager at Company A from seeing Company B's
-- orders once a second company's rows exist in the same tables.
--
-- This migration adds the tenant boundary (`companies` + `company_id`)
-- and a second, separate admin tier that sits above every company:
-- `profiles.platform_admin`. A platform admin is not a member of any
-- company (enforced below) -- they exist to support every company from
-- outside it, not to run one. RLS actually enforcing these two things is
-- 0031, in a second migration on purpose: this one only adds columns/
-- functions, so a mistake here can't already be relying on policies that
-- don't exist yet.
--
-- Every existing table stays exactly as-is except for the new columns
-- added here. If this runs against a database that already has real
-- rows in it (an existing single-tenant deploy), the backfill block
-- below creates one company and attaches every pre-existing row to it,
-- so nothing goes orphaned or inaccessible once 0031's RLS lands.

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- URL-safe identifier so an unauthenticated login page can resolve
  -- "which company" before anyone has a session -- see list_active_staff()
  -- below. Not optional: without it, the only alternative is guessing at
  -- a global name/PIN pool, which is exactly the cross-company leak this
  -- migration exists to close.
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table companies enable row level security;

-- profiles: company_id is nullable -- a platform admin belongs to no
-- company, and a brand-new signup is "unassigned" until a platform admin
-- attaches them to one (fail-closed: current_company_id() is null until
-- then, so every company-scoped query returns nothing for that account,
-- same principle as every other RLS gap in this app).
alter table profiles add column if not exists company_id uuid references companies (id);
alter table profiles add column if not exists platform_admin boolean not null default false;

alter table customers add column if not exists company_id uuid references companies (id);
alter table orders add column if not exists company_id uuid references companies (id);
alter table vendors add column if not exists company_id uuid references companies (id);
alter table price_items add column if not exists company_id uuid references companies (id);
alter table login_events add column if not exists company_id uuid references companies (id);
alter table issue_reports add column if not exists company_id uuid references companies (id);
alter table partner_splits add column if not exists company_id uuid references companies (id);
alter table roster_template_players add column if not exists company_id uuid references companies (id);

-- Backfill: only runs anything if this lands on a database that already
-- has data (i.e. an existing single-tenant deploy being upgraded). On a
-- brand-new install every one of these tables is empty and the block
-- below is a no-op.
do $$
declare
  default_company_id uuid;
begin
  if exists (select 1 from profiles where company_id is null and not platform_admin)
     or exists (select 1 from orders where company_id is null) then
    insert into companies (name, slug) values ('Default Company', 'default-company')
    returning id into default_company_id;

    update profiles set company_id = default_company_id
      where company_id is null and not platform_admin;
    update customers set company_id = default_company_id where company_id is null;
    update orders set company_id = default_company_id where company_id is null;
    update vendors set company_id = default_company_id where company_id is null;
    update price_items set company_id = default_company_id where company_id is null;
    update login_events set company_id = default_company_id where company_id is null;
    update issue_reports set company_id = default_company_id where company_id is null;
    update partner_splits set company_id = default_company_id where company_id is null;
    update roster_template_players set company_id = default_company_id where company_id is null;
  end if;
end $$;

-- Every table above except profiles must always belong to exactly one
-- company -- enforce it now that backfill (if any) has run.
alter table customers alter column company_id set not null;
alter table orders alter column company_id set not null;
alter table vendors alter column company_id set not null;
alter table price_items alter column company_id set not null;
alter table login_events alter column company_id set not null;
alter table issue_reports alter column company_id set not null;
alter table partner_splits alter column company_id set not null;
alter table roster_template_players alter column company_id set not null;

-- A platform admin belongs to no company; keeps the two tiers cleanly
-- separate (this is a support role, not "also runs one of the shops").
alter table profiles drop constraint if exists profiles_platform_admin_no_company;
alter table profiles add constraint profiles_platform_admin_no_company
  check (not (platform_admin and company_id is not null));

create index if not exists profiles_company_id_idx on profiles (company_id);
create index if not exists customers_company_id_idx on customers (company_id);
create index if not exists orders_company_id_idx on orders (company_id);
create index if not exists vendors_company_id_idx on vendors (company_id);
create index if not exists price_items_company_id_idx on price_items (company_id);
create index if not exists issue_reports_company_id_idx on issue_reports (company_id);

-- Per-company Venmo collectors, replacing what used to be a hardcoded
-- list in lib/venmo.ts -- a name + handle is one company's own data, not
-- something that belongs baked into source for every deployment to share.
create table if not exists venmo_collectors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id),
  name text not null,
  username text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table venmo_collectors enable row level security;
create index if not exists venmo_collectors_company_id_idx on venmo_collectors (company_id);

-- ============================================================
-- Helper functions used by every RLS policy in 0031
-- ============================================================

-- The calling user's own company (null for a platform admin or an
-- unassigned account) -- every tenant-scoped policy compares a row's
-- company_id against this.
create or replace function current_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id from profiles where id = auth.uid();
$$;

-- True only for the platform admin(s) -- bypasses every company boundary
-- everywhere in 0031, and is the only role that ever sees more than one
-- company's data in a single query.
create or replace function is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and platform_admin and active
  );
$$;

-- Every existing insert in app/ (orders, customers, vendors, price_items,
-- issue_reports, etc.) was written before company_id existed, so none of
-- them set it. Rather than needing to touch every one of those call sites
-- in this migration, default the column to the inserting user's own
-- company -- current_company_id() reads auth.uid()'s session, so any
-- insert made through a normal authenticated request lands in the right
-- company automatically, with zero app-code changes required. This is
-- also exactly what keeps app/issue-actions.ts's Report Issue button
-- working: its insert has never set company_id and isn't being changed
-- here, so without this default the NOT NULL constraint above would
-- reject every submission.
--
-- The one case this default doesn't cover: the platform admin inserting
-- a row explicitly on a company's behalf (their own current_company_id()
-- is null, per the constraint above) -- that code, when it's built, must
-- set company_id itself rather than relying on this default.
alter table customers alter column company_id set default current_company_id();
alter table orders alter column company_id set default current_company_id();
alter table vendors alter column company_id set default current_company_id();
alter table price_items alter column company_id set default current_company_id();
alter table login_events alter column company_id set default current_company_id();
alter table issue_reports alter column company_id set default current_company_id();
alter table partner_splits alter column company_id set default current_company_id();
alter table roster_template_players alter column company_id set default current_company_id();
alter table venmo_collectors alter column company_id set default current_company_id();

-- Replaces 0002's list_active_staff(), which took no arguments and
-- returned every active profile in the whole database -- fine with one
-- tenant, a cross-company staff-roster leak (and PIN-login oracle) the
-- moment a second company exists, since it's callable by an anonymous
-- visitor on the login page before any session exists. Now scoped to one
-- company by slug, resolved from the URL rather than a session (there is
-- no session yet at this point in the login flow).
--
-- The actual login-page UX for getting a company's slug into that URL in
-- the first place (a subdomain per company, a /c/{slug}/login path, or a
-- company-picker screen before the name dropdown) is an app-layer/routing
-- decision, not a schema one -- left for the next phase. This migration's
-- job is only to make sure the database can never answer "list every
-- company's staff" again, regardless of what the UI ends up doing.
drop function if exists list_active_staff();

create or replace function list_active_staff(company_slug text)
returns table (id uuid, full_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.full_name
  from profiles p
  join companies c on c.id = p.company_id
  where p.active and p.full_name is not null and c.slug = company_slug and c.active
  order by p.full_name;
$$;

grant execute on function list_active_staff(text) to anon, authenticated;

-- protect_profile_fields (0002) already blocks a non-manager from
-- changing role/active. A parallel gap exists for company_id/
-- platform_admin -- without this, any authenticated user could assign
-- themselves to a different company, or promote themselves to platform
-- admin, through their own row's update policy.
create or replace function protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_manager() then
    if new.role is distinct from old.role or new.active is distinct from old.active then
      raise exception 'Only a manager can change role or active status.';
    end if;
  end if;

  if auth.uid() is not null and not is_platform_admin() then
    if new.company_id is distinct from old.company_id
       or new.platform_admin is distinct from old.platform_admin then
      raise exception 'Only the platform admin can change company assignment.';
    end if;
  end if;

  return new;
end;
$$;

-- protect_order_fields (0021) already restricts most order-field edits
-- to a manager. Let a platform admin through the same gates too, since
-- they may need to fix something on a company's behalf.
create or replace function protect_order_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_manager() and not is_platform_admin() then
    if new.discount is distinct from old.discount then
      raise exception 'Only a manager can change discount.';
    end if;

    if new.status is distinct from old.status
       and not (old.status = 'draft' and new.status in ('draft', 'submitted'))
       and not (old.status = 'submitted' and new.status = 'cancelled')
       and not (old.status = 'mockup_pending' and new.status = 'mockup_approved') then
      raise exception 'Only a manager can change order status.';
    end if;

    if old.status not in ('draft', 'submitted') then
      if new.team_name is distinct from old.team_name
         or new.contact_name is distinct from old.contact_name
         or new.contact_phone is distinct from old.contact_phone
         or new.sport is distinct from old.sport
         or new.deadline is distinct from old.deadline
         or new.notes is distinct from old.notes
         or new.ref_notes is distinct from old.ref_notes
         or new.shipping_fee is distinct from old.shipping_fee
         or new.customer_id is distinct from old.customer_id then
        raise exception 'Order details can only be edited while a draft or submitted.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
