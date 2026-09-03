-- Per-company feature overrides, on top of the tier.
--
-- 0037 made tier the only thing deciding what a company can use, which
-- is right as a default and wrong as the whole story. Real deals don't
-- fit three boxes: a beta tester gets AI concepts thrown in while paying
-- Starter money, a shop is mid-upgrade and needs cost tracking today,
-- someone abuses a feature and has it pulled without changing what they
-- pay. All three are "this company, this feature", not "this tier".
--
-- So: tier stays the baseline, and an override row wins over it. Two
-- directions, deliberately -- `enabled = true` grants something the tier
-- doesn't include, `enabled = false` removes something it does. A
-- feature with no row for that company just follows its tier, which is
-- the case for almost every company almost always.

create table if not exists company_features (
  company_id uuid not null references companies (id) on delete cascade,
  feature text not null,
  enabled boolean not null,
  -- Why this override exists. Six months from now "why does this one
  -- shop have AI concepts on Starter" is a question with no answer
  -- unless it was written down at the time.
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  primary key (company_id, feature)
);

alter table company_features drop constraint if exists company_features_feature_check;
alter table company_features add constraint company_features_feature_check
  check (feature in (
    'costs', 'customer_links', 'roster_templates', 'hats',
    'financials', 'ai_concepts'
  ));

alter table company_features enable row level security;

-- Read: a company can see its own overrides (the app needs them to draw
-- the right screens), and the platform admin sees all of them.
drop policy if exists "company_features_select" on company_features;
create policy "company_features_select" on company_features
  for select using (
    is_platform_admin() or company_id = current_company_id()
  );

-- Write: platform admin only, and no exceptions. This table decides who
-- gets what they haven't paid for -- a company able to write its own row
-- here could hand itself every feature in the product. Note there is no
-- insert/update/delete policy for anyone else, so RLS denies all three
-- by default for every non-platform-admin caller.
drop policy if exists "company_features_write" on company_features;
create policy "company_features_write" on company_features
  for all using (is_platform_admin()) with check (is_platform_admin());

-- ============================================================
-- has_feature(), now override-aware
-- ============================================================
--
-- Order of resolution, and the order matters:
--   1. Platform admin -- always true, they support every company.
--   2. Billing not entitled -- always false. An override cannot buy a
--      canceled company back in; unpaid is unpaid regardless of what
--      was granted while they were paying.
--   3. An override row for this company + feature -- wins over tier,
--      in both directions.
--   4. Otherwise the tier default, exactly as 0037 had it.
create or replace function has_feature(feature text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  my_company uuid;
  my_tier text;
  entitled boolean;
  override boolean;
begin
  if is_platform_admin() then
    return true;
  end if;

  select c.id, c.tier, c.billing_status in ('trialing', 'active', 'past_due')
    into my_company, my_tier, entitled
    from companies c
    join profiles p on p.company_id = c.id
   where p.id = auth.uid();

  if my_company is null or not entitled then
    return false;
  end if;

  select cf.enabled into override
    from company_features cf
   where cf.company_id = my_company and cf.feature = has_feature.feature;

  if override is not null then
    return override;
  end if;

  return case my_tier
    when 'unlimited' then feature in (
      'costs', 'customer_links', 'roster_templates', 'hats',
      'financials', 'ai_concepts'
    )
    when 'pro' then feature in (
      'costs', 'customer_links', 'roster_templates', 'hats'
    )
    else false
  end;
end;
$$;
