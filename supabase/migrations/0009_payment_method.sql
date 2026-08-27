-- Tracks how a payment was made (cash, Venmo, Zelle, Cash App, check, card,
-- other) so the office can tell payment types apart, not just amounts.
-- Existing rows default to 'other' rather than null, so every payment
-- always has a method to display. The allowed values live in code too
-- (lib/payment-methods.ts) -- keep both in sync if the list changes.

alter table payments add column if not exists method text
  not null default 'other'
  check (method in ('cash', 'check', 'venmo', 'zelle', 'cashapp', 'card', 'other'));
