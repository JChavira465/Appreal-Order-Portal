-- Tracks when the vendor expects to have the order ready, separate from
-- the customer's deadline -- lets a manager catch "this won't make it in
-- time to ship" a week early instead of the day the customer deadline
-- itself passes.
alter table order_costs add column if not exists vendor_ready_by date;
