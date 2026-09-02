-- Subscription tiers and billing state.
--
-- Everything here hangs off `companies`, which is the right home for it:
-- companies_update is already platform-admin-only (0031), so a shop's
-- own owner cannot change their own tier or mark themselves paid. The
-- Stripe webhook writes these columns through the service-role client,
-- which bypasses RLS the same way every other trusted server path does.
--
-- The feature map below is mirrored in lib/plans.ts. This copy is the
-- one that actually enforces: the anon key is public by design, so a
-- company could otherwise reach a manager-only table straight through
-- PostgREST without ever loading a screen that checks their plan.

-- ============================================================
-- Columns
-- ============================================================

alter table companies add column if not exists tier text not null default 'starter';
alter table companies drop constraint if exists companies_tier_check;
alter table companies add constraint companies_tier_check
  check (tier in ('starter', 'pro', 'unlimited'));

alter table companies add column if not exists billing_status text not null default 'trialing';
alter table companies drop constraint if exists companies_billing_status_check;
alter table companies add constraint companies_billing_status_check
  check (billing_status in ('trialing', 'active', 'past_due', 'canceled'));

alter table companies add column if not exists billing_period text;
alter table companies drop constraint if exists companies_billing_period_check;
alter table companies add constraint companies_billing_period_check
  check (billing_period is null or billing_period in ('monthly', 'yearly'));

alter table companies add column if not exists trial_ends_at timestamptz;
alter table companies add column if not exists current_period_end timestamptz;
alter table companies add column if not exists stripe_customer_id text;
alter table companies add column if not exists stripe_subscription_id text;

-- One Stripe subscription can only ever belong to one company. Without
-- this, a replayed or out-of-order webhook could point a second company
-- at someone else's paid subscription.
create unique index if not exists companies_stripe_subscription_id_key
  on companies (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists companies_stripe_customer_id_idx
  on companies (stripe_customer_id)
  where stripe_customer_id is not null;

-- Existing companies were signed up before any of this existed. Put them
-- on a 14-day trial from now rather than instantly past-due, so nobody
-- who is already using the app gets locked out by this migration.
update companies
   set trial_ends_at = now() + interval '14 days'
 where trial_ends_at is null and billing_status = 'trialing';

-- ============================================================
-- Feature map -- mirrors PLANS in lib/plans.ts
-- ============================================================

-- The caller's own company tier. Null for a platform admin (who belongs
-- to no company) and for anyone unassigned.
create or replace function current_company_tier()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select c.tier
    from companies c
    join profiles p on p.company_id = c.id
   where p.id = auth.uid();
$$;

-- Does the CALLER's company include this feature?
--
-- The platform admin always passes -- they support every company and
-- must be able to see what a shop is describing to them on the phone,
-- regardless of what that shop pays. This mirrors how is_platform_admin()
-- bypasses the company boundary everywhere else in 0031.
--
-- A canceled subscription fails everything gated. It does not need to
-- fail the *core* app here, because cancellation also flips
-- companies.active off, and current_company_id() (0032) already returns
-- null for an inactive company -- which shuts every table at once. This
-- function only has to handle the gated extras.
create or replace function has_feature(feature text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    is_platform_admin()
    or (
      exists (
        select 1
          from companies c
          join profiles p on p.company_id = c.id
         where p.id = auth.uid()
           and c.billing_status in ('trialing', 'active', 'past_due')
      )
      and case current_company_tier()
        when 'unlimited' then feature in (
          'costs', 'customer_links', 'roster_templates', 'hats',
          'financials', 'ai_concepts'
        )
        when 'pro' then feature in (
          'costs', 'customer_links', 'roster_templates', 'hats'
        )
        when 'starter' then false
        else false
      end
    );
$$;

-- Max staff accounts per tier; null means no limit. Enforced in
-- app/team-actions.ts at the point an account is created.
create or replace function tier_seat_limit(t text)
returns int
language sql
immutable
as $$
  select case t
    when 'starter' then 3
    when 'pro' then 10
    else null
  end;
$$;

-- ============================================================
-- RLS: the gated tables
-- ============================================================
--
-- Only tables whose ENTIRE contents belong to a paid feature are gated
-- here. Order-level screens are not: an order is core, and a shop
-- downgrading must never lose the ability to read its own order history.
-- The cost/vendor tables are exactly the "this whole table is the
-- feature" case -- and per CLAUDE.md, a manager-only table coming back
-- empty for someone who lacks access is already the app's normal,
-- non-erroring behavior, so a downgraded shop sees the cost fields go
-- quiet rather than hitting an error page.

drop policy if exists "vendors_select" on vendors;
create policy "vendors_select" on vendors
  for select using (
    is_platform_admin()
    or (company_id = current_company_id() and has_feature('costs'))
  );
drop policy if exists "vendors_insert" on vendors;
create policy "vendors_insert" on vendors
  for insert with check (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager() and has_feature('costs'))
  );
drop policy if exists "vendors_update" on vendors;
create policy "vendors_update" on vendors
  for update using (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager() and has_feature('costs'))
  );
drop policy if exists "vendors_delete" on vendors;
create policy "vendors_delete" on vendors
  for delete using (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager() and has_feature('costs'))
  );

drop policy if exists "order_item_costs_all" on order_item_costs;
create policy "order_item_costs_all" on order_item_costs
  for all using (
    is_platform_admin() or exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_costs.order_item_id
        and o.company_id = current_company_id()
        and is_manager() and has_feature('costs')
    )
  )
  with check (
    is_platform_admin() or exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_costs.order_item_id
        and o.company_id = current_company_id()
        and is_manager() and has_feature('costs')
    )
  );

drop policy if exists "order_costs_all" on order_costs;
create policy "order_costs_all" on order_costs
  for all using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_costs.order_id
        and o.company_id = current_company_id()
        and is_manager() and has_feature('costs')
    )
  )
  with check (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_costs.order_id
        and o.company_id = current_company_id()
        and is_manager() and has_feature('costs')
    )
  );

-- partner_splits and vendor_payments are the 'financials' feature.
drop policy if exists "partner_splits_all" on partner_splits;
create policy "partner_splits_all" on partner_splits
  for all using (
    is_platform_admin()
    or (company_id = current_company_id() and is_super_admin() and has_feature('financials'))
  )
  with check (
    is_platform_admin()
    or (company_id = current_company_id() and is_super_admin() and has_feature('financials'))
  );

drop policy if exists "vendor_payments_all" on vendor_payments;
create policy "vendor_payments_all" on vendor_payments
  for all using (
    is_platform_admin() or exists (
      select 1 from vendors v
      where v.id = vendor_payments.vendor_id
        and v.company_id = current_company_id()
        and is_super_admin() and has_feature('financials')
    )
  )
  with check (
    is_platform_admin() or exists (
      select 1 from vendors v
      where v.id = vendor_payments.vendor_id
        and v.company_id = current_company_id()
        and is_super_admin() and has_feature('financials')
    )
  );

-- order_links is the 'customer_links' feature. Existing links keep
-- resolving for customers already holding one -- the public page reads
-- them with the service-role client -- but a downgraded shop can't mint
-- new ones or see them in the app.
drop policy if exists "order_links_select" on order_links;
create policy "order_links_select" on order_links
  for select using (
    is_platform_admin()
    or (
      company_id = current_company_id()
      and (rep_id = auth.uid() or is_manager())
      and has_feature('customer_links')
    )
  );

drop policy if exists "order_links_insert" on order_links;
create policy "order_links_insert" on order_links
  for insert with check (
    is_platform_admin()
    or (
      company_id = current_company_id()
      and rep_id = auth.uid()
      and has_feature('customer_links')
    )
  );

-- roster_template_players is the 'roster_templates' feature.
drop policy if exists "roster_template_players_all" on roster_template_players;
create policy "roster_template_players_all" on roster_template_players
  for all using (
    is_platform_admin()
    or (company_id = current_company_id() and has_feature('roster_templates'))
  )
  with check (
    is_platform_admin()
    or (company_id = current_company_id() and has_feature('roster_templates'))
  );
