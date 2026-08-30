-- Lets a manager's home page show "N new orders since you last checked"
-- without a separate notifications table -- just a per-profile timestamp,
-- bumped every time they visit the Order Board.
--
-- Defaults to now() (not null) so this ships without a false "500 new
-- orders" spike for every existing manager on the first load after
-- migrating -- everyone's caught up as of today, only real new submissions
-- count from here.
alter table profiles add column if not exists orders_viewed_at timestamptz not null default now();
