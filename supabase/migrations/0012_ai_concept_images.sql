-- Lets a rep generate a rough AI concept image for their own order --
-- before the official mockup a manager builds -- as a third order_images
-- kind alongside reference/mockup. Reuses that same table/bucket rather
-- than a new one, since it's the same "photo attached to my order" shape
-- reference images already have, just rep-generated instead of
-- rep-uploaded. Same permission model as reference images: the owning
-- rep can add one, no order-status restriction, only a manager can
-- delete. The per-order generation cap (4) is enforced in the app
-- (app/orders/[id]/ai-concept-actions.ts), not here -- it's a cost
-- guardrail, not a security boundary.

do $$
declare
  kind_check_name text;
begin
  select con.conname into kind_check_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'order_images'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%kind%';

  if kind_check_name is not null then
    execute format('alter table order_images drop constraint %I', kind_check_name);
  end if;
end $$;

alter table order_images
  add constraint order_images_kind_check
  check (kind in ('reference', 'mockup', 'ai_concept'));

drop policy if exists "order_images_insert" on order_images;
create policy "order_images_insert" on order_images
  for insert with check (
    (
      kind in ('reference', 'ai_concept') and exists (
        select 1 from orders o
        where o.id = order_images.order_id and o.rep_id = auth.uid()
      )
    )
    or (kind = 'mockup' and is_manager())
  );

drop policy if exists "order_images_bucket_insert_ai_concept" on storage.objects;
create policy "order_images_bucket_insert_ai_concept" on storage.objects
  for insert with check (
    bucket_id = 'order-images'
    and (storage.foldername(name))[2] = 'ai_concept'
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1] and o.rep_id = auth.uid()
    )
  );
