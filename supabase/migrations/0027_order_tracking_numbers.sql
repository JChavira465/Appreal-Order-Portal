-- One order can ship in more than one box (jerseys separately from hats,
-- say), so this is its own child table rather than a column on orders --
-- same shape as payments/order_images.
create table if not exists order_tracking_numbers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  carrier text not null default 'other',
  tracking_number text not null,
  created_at timestamptz not null default now()
);

alter table order_tracking_numbers enable row level security;

-- Same visibility as the order itself -- a rep sees their own order's
-- tracking, a manager sees everyone's. Reps need to see this (that's the
-- whole point), so unlike costs this isn't manager-only to read.
drop policy if exists "order_tracking_numbers_select" on order_tracking_numbers;
create policy "order_tracking_numbers_select" on order_tracking_numbers
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_tracking_numbers.order_id
        and (o.rep_id = auth.uid() or is_manager())
    )
  );

-- Only the office adds/removes a tracking number.
drop policy if exists "order_tracking_numbers_insert" on order_tracking_numbers;
create policy "order_tracking_numbers_insert" on order_tracking_numbers
  for insert with check (is_manager());
drop policy if exists "order_tracking_numbers_delete" on order_tracking_numbers;
create policy "order_tracking_numbers_delete" on order_tracking_numbers
  for delete using (is_manager());
