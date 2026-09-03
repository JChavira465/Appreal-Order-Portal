-- Where a shop's money actually arrives.
--
-- Replaces venmo_collectors (0030), which assumed one app. Shops collect
-- on whatever the customer already has on their phone, and a coach who
-- uses Cash App is not going to install Venmo to pay for jerseys.
--
-- Deliberately NOT payment processing. Nothing here moves money or
-- confirms anything: it stores the handle a shop already owns, builds the
-- deepest link each app supports, and puts it where the person who owes
-- money can tap it. Somebody still checks the app and records the payment,
-- exactly as they do today -- the win is that the customer stops having
-- to ask "where do I send it" and the reference stops being "jerseys lol".

create table if not exists payout_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  provider text not null,
  -- The Venmo username, $cashtag, or phone number / email, depending on
  -- provider. Stored as typed; normalised for display and links in
  -- lib/payouts.ts rather than here, so a shop can paste "@handle",
  -- "$handle" or a bare handle and it just works.
  handle text not null,
  -- Whose account it is, for a shop where more than one person collects
  -- ("Alex — Venmo"). Optional; the provider name alone is fine.
  label text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table payout_accounts drop constraint if exists payout_accounts_provider_check;
alter table payout_accounts add constraint payout_accounts_provider_check
  check (provider in ('venmo', 'cashapp', 'applecash', 'zelle'));

create index if not exists payout_accounts_company_id_idx
  on payout_accounts (company_id);

alter table payout_accounts enable row level security;

-- Read: anyone in the company. Note the customer-facing pages read this
-- through the service-role client instead -- a customer paying a balance
-- has no session, which is the whole point.
drop policy if exists "payout_accounts_select" on payout_accounts;
create policy "payout_accounts_select" on payout_accounts
  for select using (
    is_platform_admin() or company_id = current_company_id()
  );

-- Write: managers and up. This decides where a shop's money lands, so it
-- sits alongside pricing rather than alongside taking an order -- a rep
-- redirecting payments to their own Venmo is exactly the thing this
-- restriction exists to prevent.
drop policy if exists "payout_accounts_insert" on payout_accounts;
create policy "payout_accounts_insert" on payout_accounts
  for insert with check (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  );

drop policy if exists "payout_accounts_update" on payout_accounts;
create policy "payout_accounts_update" on payout_accounts
  for update using (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  )
  with check (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  );

drop policy if exists "payout_accounts_delete" on payout_accounts;
create policy "payout_accounts_delete" on payout_accounts
  for delete using (
    is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  );

alter table payout_accounts alter column company_id set default current_company_id();

-- Carry across whatever is already in venmo_collectors so no shop loses
-- a handle it had entered. The old table is left in place rather than
-- dropped: it costs nothing, and dropping it would make this migration
-- impossible to undo if something here turns out wrong.
insert into payout_accounts (company_id, provider, handle, label, active, sort_order)
select vc.company_id, 'venmo', vc.username, vc.name, vc.active, vc.sort_order
from venmo_collectors vc
where not exists (
  select 1 from payout_accounts pa
  where pa.company_id = vc.company_id
    and pa.provider = 'venmo'
    and pa.handle = vc.username
);
