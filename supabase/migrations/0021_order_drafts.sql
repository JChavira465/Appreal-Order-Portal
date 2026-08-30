-- Lets a rep save an order before it's ready to go to the office --
-- team name only, nothing else required. A draft is private to the rep
-- who started it (and any manager can still see/edit it, same as every
-- other order) until they hit "Submit order", which is the one allowed
-- draft -> submitted transition. A draft can also be discarded outright
-- (deleted) rather than cancelled, since it never became a real order in
-- anyone's queue.
--
-- Every place that currently gates rep edit rights on
-- "status = 'submitted'" needs 'draft' added alongside it -- orders
-- itself, and the three child tables one/two/three joins out
-- (order_items, order_item_sizes, order_item_size_names). Every SELECT
-- policy that lets a manager see all orders needs a matching
-- "and status <> 'draft'" so another rep's still-private draft doesn't
-- leak into a manager's Order Board.

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (
  status in ('draft', 'submitted', 'mockup_pending', 'mockup_approved',
             'in_production', 'shipped', 'cancelled')
);

drop policy if exists "orders_select" on orders;
create policy "orders_select" on orders
  for select using (rep_id = auth.uid() or (is_manager() and status <> 'draft'));

drop policy if exists "orders_update" on orders;
create policy "orders_update" on orders
  for update
  using (
    is_manager()
    or (rep_id = auth.uid() and status in ('draft', 'submitted', 'mockup_pending'))
  )
  with check (
    is_manager()
    or (
      rep_id = auth.uid()
      and status in ('draft', 'submitted', 'mockup_pending', 'cancelled', 'mockup_approved')
    )
  );

drop policy if exists "orders_delete" on orders;
create policy "orders_delete" on orders
  for delete using (is_manager() or (rep_id = auth.uid() and status = 'draft'));

create or replace function protect_order_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_manager() then
    if new.discount is distinct from old.discount then
      raise exception 'Only a manager can change discount.';
    end if;

    if new.status is distinct from old.status
       and not (old.status = 'draft' and new.status in ('draft', 'submitted'))
       and not (old.status = 'submitted' and new.status = 'cancelled')
       and not (old.status = 'mockup_pending' and new.status = 'mockup_approved') then
      raise exception 'Only a manager can change order status.';
    end if;

    -- Order details may only change while still a draft or submitted --
    -- once a mockup is out, a rep can approve/request a revision, not
    -- edit the order itself.
    if old.status not in ('draft', 'submitted') then
      if new.team_name is distinct from old.team_name
         or new.contact_name is distinct from old.contact_name
         or new.contact_phone is distinct from old.contact_phone
         or new.sport is distinct from old.sport
         or new.deadline is distinct from old.deadline
         or new.notes is distinct from old.notes
         or new.ref_notes is distinct from old.ref_notes
         or new.shipping_fee is distinct from old.shipping_fee
         or new.customer_id is distinct from old.customer_id then
        raise exception 'Order details can only be edited while a draft or submitted.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- order_items

drop policy if exists "order_items_select" on order_items;
create policy "order_items_select" on order_items
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (o.rep_id = auth.uid() or (is_manager() and o.status <> 'draft'))
    )
  );
drop policy if exists "order_items_insert" on order_items;
create policy "order_items_insert" on order_items
  for insert with check (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
drop policy if exists "order_items_update" on order_items;
create policy "order_items_update" on order_items
  for update using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
drop policy if exists "order_items_delete" on order_items;
create policy "order_items_delete" on order_items
  for delete using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );

-- order_item_sizes

drop policy if exists "order_item_sizes_select" on order_item_sizes;
create policy "order_item_sizes_select" on order_item_sizes
  for select using (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and (o.rep_id = auth.uid() or (is_manager() and o.status <> 'draft'))
    )
  );
drop policy if exists "order_item_sizes_insert" on order_item_sizes;
create policy "order_item_sizes_insert" on order_item_sizes
  for insert with check (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
drop policy if exists "order_item_sizes_update" on order_item_sizes;
create policy "order_item_sizes_update" on order_item_sizes
  for update using (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
drop policy if exists "order_item_sizes_delete" on order_item_sizes;
create policy "order_item_sizes_delete" on order_item_sizes
  for delete using (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );

-- order_item_size_names

drop policy if exists "order_item_size_names_select" on order_item_size_names;
create policy "order_item_size_names_select" on order_item_size_names
  for select using (
    exists (
      select 1 from order_item_sizes ois
      join order_items oi on oi.id = ois.order_item_id
      join orders o on o.id = oi.order_id
      where ois.id = order_item_size_names.order_item_size_id
        and (o.rep_id = auth.uid() or (is_manager() and o.status <> 'draft'))
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
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
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
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
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
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
