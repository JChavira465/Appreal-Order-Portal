-- A beanie is typically priced by a shop's regular apparel manufacturer,
-- not its dedicated hat vendor, and doesn't fit the "SPECIALTY"-vs-"HAT"
-- categorization a fitted hat or snapback does. So it shouldn't be routed
-- to the order's hat vendor or subject to the headwear 10-unit minimum
-- warning -- it follows the order's regular manufacturer like any other
-- apparel item.

update price_items set is_headwear = false where name = 'Beanie';
