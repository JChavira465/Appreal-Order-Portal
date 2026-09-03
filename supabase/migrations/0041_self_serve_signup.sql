-- Lets a shop sign itself up.
--
-- Until now every company was created by the platform admin by hand,
-- which is correct for three design partners and impossible at thirty:
-- nobody can start a trial while he's asleep, and he is personally the
-- rate limit on new customers.
--
-- The only schema this needs is somewhere to record the real email the
-- owner signed up with. Staff sign in with a synthetic
-- @staff.internal address (0002) so that PIN login can work without
-- anyone having a mailbox -- which means the auth user's email is not a
-- real address and can't be used to recognise a returning signup, or to
-- send them anything.

alter table profiles add column if not exists signup_email text;

-- One shop per email address. Partial so the 99% of staff accounts with
-- no signup_email don't all collide on null.
create unique index if not exists profiles_signup_email_key
  on profiles (signup_email)
  where signup_email is not null;

-- Deliberately NOT readable by anyone but the person it belongs to and
-- the platform admin. profiles_select already restricts rows to your own
-- account, your company's staff (if you're a manager), or everything (if
-- you're the platform admin) -- so no new policy is needed here, and
-- adding one that widened it would be the mistake.
