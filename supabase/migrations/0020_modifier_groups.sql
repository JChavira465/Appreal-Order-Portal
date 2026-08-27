-- Two of the owner's requests turn out to be the same underlying gap:
-- some add-ons aren't independent toggles, they're a single choice among
-- a few options. "Full Mesh/Meshback" was one checkbox that couldn't say
-- which of the two it was -- now it's two mutually-exclusive options,
-- selecting neither meaning plain fabric (no default). Collar is a new
-- mutually-exclusive pair that must always have exactly one selected,
-- defaulting to Crew Neck.
--
-- group_key ties options together as mutually exclusive (same item_name +
-- group_key = pick at most one, or exactly one if the group has a
-- default). is_default marks which option (if any) a new line starts
-- with. A modifier with group_key = null stays an independent toggle,
-- unchanged from before -- long sleeve, hood, etc. can still combine
-- freely.

alter table price_modifiers add column if not exists group_key text;
alter table price_modifiers add column if not exists is_default boolean not null default false;

-- Replace the old single "Full Mesh/Meshback" checkbox with two
-- mutually-exclusive options. Deleting the 'mesh' key doesn't touch any
-- order that already stored it in order_items.mods -- that history is
-- untouched, it just won't resolve to a friendly label anymore (falls
-- back to showing the raw key), same as any other retired modifier.
delete from price_modifiers where item_name = 'Jersey' and key = 'mesh';

insert into price_modifiers (item_name, key, label, price, group_key, is_default) values
  ('Jersey', 'full_mesh', 'Full Mesh', 2, 'mesh_type', false),
  ('Jersey', 'meshback', 'Meshback', 2, 'mesh_type', false)
on conflict (item_name, key) do update set
  label = excluded.label,
  price = excluded.price,
  group_key = excluded.group_key,
  is_default = excluded.is_default;

insert into price_modifiers (item_name, key, label, price, group_key, is_default) values
  ('Jersey', 'crew_neck', 'Crew Neck', 0, 'collar_type', true),
  ('Jersey', 'v_neck', 'V-Neck', 0, 'collar_type', false)
on conflict (item_name, key) do update set
  label = excluded.label,
  price = excluded.price,
  group_key = excluded.group_key,
  is_default = excluded.is_default;
