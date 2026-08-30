-- A broader grouping above the specific item name (e.g. "JERSEY" as a
-- category, vs. "Jersey" the specific item; "BOTTOMS" as a category
-- covering Performance Pants/Poly Sweatpants/Shorts as specific items).
-- Free text, not an enum -- the owner's own real category list doesn't
-- cleanly enumerate (it has some inconsistent entries), and a manager
-- should be able to type a new one without a migration. Purely
-- informational/reporting -- nothing in pricing or order entry depends
-- on it.

alter table price_items add column if not exists category text;

update price_items set category = case name
  when 'Jersey' then 'JERSEY'
  when 'Standard Performance Hoodie' then 'HOODIE'
  when 'Cotton Hoodie w/ Embroidery' then 'HOODIE'
  when 'Performance Pants' then 'BOTTOMS'
  when 'Poly Sweatpants' then 'BOTTOMS'
  when 'Cotton Sweatpants w/ Embroidery' then 'BOTTOMS'
  when 'Shorts' then 'BOTTOMS'
  when 'BP Jacket / Quarter Zip' then 'JACKET'
  when 'Polo' then 'SPECIALTY'
  when 'Arm Band' then 'SPECIALTY'
  when 'Headband' then 'SPECIALTY'
  when 'Team Towel' then 'SPECIALTY'
  when 'Batting Gloves' then 'GLOVES'
  when 'Fitted Hat' then 'HAT'
  when 'Snapback Hat / Visor' then 'HAT'
  when 'Beanie' then 'SPECIALTY'
  else category
end
where category is null;
