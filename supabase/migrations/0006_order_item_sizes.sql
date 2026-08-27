-- Replaces order_items.size_breakdown (free text, e.g. "YS x4, YM x6")
-- with a proper child table of (size_label, qty) pairs, so quantities can
-- be reliably summed across orders for a production/cut-sheet tally in
-- the Excel export. No real orders exist yet, so this is a clean
-- replacement rather than a migration of existing data.

alter table order_items drop column if exists size_breakdown;

create table if not exists order_item_sizes (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items (id) on delete cascade,
  size_label text not null,
  qty int not null check (qty > 0)
);

alter table order_item_sizes enable row level security;

-- Same inherit-from-parent-order pattern as order_items, just one join
-- further out (order_item_sizes -> order_items -> orders).
drop policy if exists "order_item_sizes_select" on order_item_sizes;
create policy "order_item_sizes_select" on order_item_sizes
  for select using (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and (o.rep_id = auth.uid() or is_manager())
    )
  );

drop policy if exists "order_item_sizes_insert" on order_item_sizes;
create policy "order_item_sizes_insert" on order_item_sizes
  for insert with check (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status = 'submitted'))
    )
  );

drop policy if exists "order_item_sizes_update" on order_item_sizes;
create policy "order_item_sizes_update" on order_item_sizes
  for update using (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status = 'submitted'))
    )
  );

drop policy if exists "order_item_sizes_delete" on order_item_sizes;
create policy "order_item_sizes_delete" on order_item_sizes
  for delete using (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status = 'submitted'))
    )
  );
