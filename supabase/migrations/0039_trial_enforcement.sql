-- Makes trial_ends_at mean something.
--
-- 0037 set and displayed a trial end date but nothing ever enforced it:
-- no job flips a company from 'trialing' to anything else when the date
-- passes, so "14-day free trial" actually meant "free forever". Fine
-- while every company is someone you know personally; not fine the
-- moment strangers sign up.
--
-- Enforced the same way suspension is (0032) rather than by inventing a
-- second mechanism: current_company_id() stops resolving, and because
-- nearly every RLS policy in the app compares a row's company_id against
-- it, everything closes at once with no per-policy changes. Existing
-- sessions stay signed in; they just can't reach any of their company's
-- data until someone pays or the date moves.
--
-- Two deliberate escape hatches:
--   * A NULL trial_ends_at never expires. Missing data must not lock
--     anyone out -- the safe failure here is "keeps working", because a
--     wrongly-locked-out paying customer is a far worse outcome than a
--     trial that runs long.
--   * companies_select still reads through profiles rather than
--     current_company_id() (unchanged from 0032), so a locked-out shop
--     can still load its own company row -- which is what lets the app
--     show "your trial ended, here are the plans" instead of every
--     screen silently coming back empty.

-- One place that decides whether a company is currently entitled to
-- anything at all. Both current_company_id() and has_feature() go
-- through this, so the rule can never drift between them.
create or replace function company_is_entitled(c_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from companies c
    where c.id = c_id
      and c.active
      and (
        -- Paying, or recently failed a payment. past_due keeps access on
        -- purpose (see lib/plans.ts) -- an expired card is not a
        -- cancellation, and Stripe needs a week to retry.
        c.billing_status in ('active', 'past_due')
        -- Or on a trial that hasn't run out yet.
        or (
          c.billing_status = 'trialing'
          and (c.trial_ends_at is null or c.trial_ends_at > now())
        )
      )
  );
$$;

-- Same single point of control 0032 established, now covering trial
-- expiry as well as suspension.
create or replace function current_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.company_id
  from profiles p
  where p.id = auth.uid()
    and company_is_entitled(p.company_id);
$$;

-- has_feature() keeps its own company lookup rather than calling
-- current_company_id(), precisely because that now returns null for an
-- expired trial -- it needs to find the company first and then ask
-- whether they're entitled, or it could never distinguish "expired" from
-- "belongs to no company".
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
  override boolean;
begin
  if is_platform_admin() then
    return true;
  end if;

  select c.id, c.tier
    into my_company, my_tier
    from companies c
    join profiles p on p.company_id = c.id
   where p.id = auth.uid();

  if my_company is null or not company_is_entitled(my_company) then
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
