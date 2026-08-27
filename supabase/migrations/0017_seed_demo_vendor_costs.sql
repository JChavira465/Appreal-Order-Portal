-- Dummy demo vendors and per-item costs, standing in for a real cost
-- sheet -- two apparel manufacturers and two hat vendors, matching a
-- typical small shop's "a couple manufacturers + a hat guy or two"
-- setup. Replace with your own vendors and real costs before going
-- live; nothing here is tuned to any actual business. Safe to re-run
-- (upserts).

insert into vendors (name, kind) values
  ('Vendor A', 'apparel'),
  ('Vendor B', 'apparel'),
  ('Hat Vendor A', 'hat'),
  ('Hat Vendor B', 'hat')
on conflict (name) do update set kind = excluded.kind;

insert into vendor_item_costs (vendor_id, item, unit_cost)
select v.id, x.item, x.unit_cost
from (values
  ('Vendor A', 'Performance Pants', 15),
  ('Vendor B', 'Performance Pants', 14),
  ('Vendor A', 'Shorts', 10),
  ('Vendor B', 'Shorts', 10),
  ('Vendor A', 'Poly Sweatpants', 14),
  ('Vendor B', 'Poly Sweatpants', 13),
  ('Hat Vendor A', 'Fitted Hat', 15),
  ('Hat Vendor B', 'Fitted Hat', 15),
  ('Hat Vendor A', 'Snapback Hat / Visor', 12),
  ('Hat Vendor B', 'Snapback Hat / Visor', 12),
  ('Vendor A', 'Batting Gloves', 8),
  ('Vendor B', 'Batting Gloves', 9),
  ('Vendor A', 'Polo', 12),
  ('Vendor B', 'Polo', 11),
  ('Vendor A', 'Arm Band', 5),
  ('Vendor B', 'Arm Band', 5),
  ('Vendor A', 'Team Towel', 4),
  ('Vendor B', 'Team Towel', 4),
  ('Vendor A', 'Beanie', 6),
  ('Vendor B', 'Beanie', 6),
  ('Vendor A', 'Headband', 4)
) as x(vendor_name, item, unit_cost)
join vendors v on v.name = x.vendor_name
on conflict (vendor_id, item) do update set unit_cost = excluded.unit_cost;
