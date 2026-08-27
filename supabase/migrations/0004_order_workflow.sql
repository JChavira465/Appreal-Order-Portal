-- Phase 4: Order Detail + status workflow.
--
-- Fixes two Phase 2 RLS gaps discovered while building this:
--
-- 1. A rep needs to approve/request-revision on their own order, which
--    happens while status = 'mockup_pending' (set by the manager) -- but
--    orders_update only let a rep touch their row while status =
--    'submitted'. Widen it to also allow mockup_pending, with an explicit
--    with check (not the implicit using-as-check default) so the two
--    rep-permitted status transitions (submitted -> cancelled,
--    mockup_pending -> mockup_approved) aren't rejected by RLS before the
--    trigger even runs.
--
-- 2. protect_order_fields blocked shipping_fee changes for reps. The spec
--    only lists status/payments/discount as manager-only -- shipping
--    estimate isn't restricted, and the prototype's rep-facing form lets
--    reps edit it. That was my own over-restriction, not a spec
--    requirement; removing it. Replaced with a general-field-edit guard:
--    once an order is out of 'submitted', a rep may still transition
--    status via the two allowed actions, but can no longer edit order
--    details at all (matches "edits... ONLY while status is submitted").

drop policy if exists "orders_update" on orders;
create policy "orders_update" on orders
  for update
  using (
    is_manager()
    or (rep_id = auth.uid() and status in ('submitted', 'mockup_pending'))
  )
  with check (
    is_manager()
    or (
      rep_id = auth.uid()
      and status in ('submitted', 'mockup_pending', 'cancelled', 'mockup_approved')
    )
  );

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
       and not (old.status = 'submitted' and new.status = 'cancelled')
       and not (old.status = 'mockup_pending' and new.status = 'mockup_approved') then
      raise exception 'Only a manager can change order status.';
    end if;

    -- Order details (everything except status/revision_requested) may
    -- only change while still submitted -- once a mockup is out, a rep
    -- can approve/request a revision, not edit the order itself.
    if old.status <> 'submitted' then
      if new.team_name is distinct from old.team_name
         or new.contact_name is distinct from old.contact_name
         or new.contact_phone is distinct from old.contact_phone
         or new.sport is distinct from old.sport
         or new.deadline is distinct from old.deadline
         or new.notes is distinct from old.notes
         or new.ref_notes is distinct from old.ref_notes
         or new.shipping_fee is distinct from old.shipping_fee
         or new.customer_id is distinct from old.customer_id then
        raise exception 'Order details can only be edited while submitted.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
