-- PIN brute-force protection. A 4-digit PIN is only 10,000 combinations,
-- and until now the only defense was Supabase's generic auth rate
-- limiting, which is IP-based, not account-based. app/login/actions.ts
-- now locks an account's PIN sign-in after repeated wrong guesses.
--
-- These two columns are only ever written by the admin (service_role)
-- client from the login server action, never from an authenticated
-- session -- and a visitor who's locked out has no session yet, so they
-- have no other way to touch these columns themselves. Same trust model
-- protect_profile_fields already documents for role/active.

alter table profiles add column if not exists failed_pin_attempts int not null default 0;
alter table profiles add column if not exists pin_locked_until timestamptz;
