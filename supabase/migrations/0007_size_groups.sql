-- Constrains size selection to a fixed list per item (a "size group"),
-- so reps pick from a dropdown instead of typing a size label -- keeps
-- every order's sizing uniform and matches Prime Apparel's actual size
-- charts (tops, bottoms, fitted hats). The size label lists themselves
-- live in code (lib/sizes.ts), not the database -- they're fixed
-- reference data, not something that needs its own admin UI yet.

alter table price_items add column if not exists size_group text
  not null default 'one_size'
  check (size_group in ('tops', 'bottoms', 'fitted_hat', 'one_size'));

update price_items set size_group = 'tops' where name in (
  'Jersey',
  'Standard Performance Hoodie',
  'Cotton Hoodie w/ Embroidery',
  'Polo',
  'BP Jacket / Quarter Zip'
);

update price_items set size_group = 'bottoms' where name in (
  'Performance Pants',
  'Poly Sweatpants',
  'Cotton Sweatpants w/ Embroidery',
  'Shorts'
);

update price_items set size_group = 'fitted_hat' where name = 'Fitted Hat';

-- Everything else (Arm Band, Headband, Team Towel, Batting Gloves,
-- Snapback Hat / Visor, Beanie) keeps the 'one_size' default.
