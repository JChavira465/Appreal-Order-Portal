-- Shipping address for an order -- free text (street/city/state/zip all
-- in one box), same shape as notes/ref_notes rather than structured
-- columns, since nothing here needs to parse it. Editable by the same
-- people who can already edit the rest of an order's details: the owning
-- rep while it's still 'submitted', or any manager at any time -- no new
-- RLS needed, orders_update (0003) and protect_order_fields (0003, which
-- only gates discount/shipping_fee/status) already cover it.
--
-- Also added to customers, reusing the existing "remember this team's
-- info for next time" mechanism createOrder already has for contact
-- name/phone/sport, so a repeat team's address autofills too.

alter table orders add column if not exists shipping_address text;
alter table customers add column if not exists shipping_address text;
