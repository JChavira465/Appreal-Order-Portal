-- Lets a rep (or manager) attach player names/numbers to print on the
-- back, one row per garment within a size -- e.g. "M x3" can carry 3
-- separate name+number pairs. A child table of order_item_sizes rather
-- than a single text field, since this needs to export as a clean
-- per-person production roster (see lib/exportOrders.ts), not just be
-- read as a note. Not required to match qty exactly -- a rep may not
-- have every player's info yet, same looseness as everything else here.
--
-- Same inherit-from-parent RLS pattern as order_item_sizes, one join
-- further out: order_item_size_names -> order_item_sizes -> order_items
-- -> orders. Same edit rule as the rest of an order's details: the
-- owning rep while it's still 'submitted', or any manager at any time.

create table if not exists order_item_size_names (
  id uuid primary key default gen_random_uuid(),
  order_item_size_id uuid not null references order_item_sizes (id) on delete cascade,
  player_name text,
  player_number text,
  sort_order int not null default 0
);

alter table order_item_size_names enable row level security;

drop policy if exists "order_item_size_names_select" on order_item_size_names;
create policy "order_item_size_names_select" on order_item_size_names
  for select using (
    exists (
      select 1 from order_item_sizes ois
      join order_items oi on oi.id = ois.order_item_id
      join orders o on o.id = oi.order_id
      where ois.id = order_item_size_names.order_item_size_id
        and (o.rep_id = auth.uid() or is_manager())
    )
  );

drop policy if exists "order_item_size_names_insert" on order_item_size_names;
create policy "order_item_size_names_insert" on order_item_size_names
  for insert with check (
    exists (
      select 1 from order_item_sizes ois
      join order_items oi on oi.id = ois.order_item_id
      join orders o on o.id = oi.order_id
      where ois.id = order_item_size_names.order_item_size_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status = 'submitted'))
    )
  );

drop policy if exists "order_item_size_names_update" on order_item_size_names;
create policy "order_item_size_names_update" on order_item_size_names
  for update using (
    exists (
      select 1 from order_item_sizes ois
      join order_items oi on oi.id = ois.order_item_id
      join orders o on o.id = oi.order_id
      where ois.id = order_item_size_names.order_item_size_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status = 'submitted'))
    )
  );

drop policy if exists "order_item_size_names_delete" on order_item_size_names;
create policy "order_item_size_names_delete" on order_item_size_names
  for delete using (
    exists (
      select 1 from order_item_sizes ois
      join order_items oi on oi.id = ois.order_item_id
      join orders o on o.id = oi.order_id
      where ois.id = order_item_size_names.order_item_size_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status = 'submitted'))
    )
  );
