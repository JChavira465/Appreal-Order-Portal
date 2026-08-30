-- A second real cost alongside shipping_cost (0008) -- packaging/
-- supplies spent getting an order out the door, separate from what a
-- vendor charges per piece and separate from shipping. Same table,
-- same manager-only boundary, same "one row per order" shape --
-- shipping_cost and supplies_cost are just two more numbers on the
-- order's own cost record.

alter table order_costs add column if not exists supplies_cost numeric(10,2);
