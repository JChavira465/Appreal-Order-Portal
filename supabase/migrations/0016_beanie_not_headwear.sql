-- Steve's real cost sheet (PRICING tab) prices Fitted Hat and Snapback
-- with a COOP (hat vendor) cost column, but Beanie has no COOP cost at
-- all -- only GW/AC/DX, the regular apparel manufacturers. Beanie is
-- also filed under his "SPECIALTY" category, not "HAT". So it shouldn't
-- be routed to the order's hat vendor or subject to the headwear
-- 10-unit minimum warning -- it follows the order's regular
-- manufacturer like any other apparel item.

update price_items set is_headwear = false where name = 'Beanie';
