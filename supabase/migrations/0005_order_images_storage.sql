-- Phase 5: image uploads. Creates the private order-images bucket the
-- spec describes and its storage.objects policies, matching the spec's
-- storage table: any signed-in user who can read the parent order can
-- read; the owning rep can write reference images; only a manager can
-- write mockups. Path convention: {order_id}/{kind}/{uuid}-{filename},
-- parsed via storage.foldername().

insert into storage.buckets (id, name, public)
values ('order-images', 'order-images', false)
on conflict (id) do nothing;

drop policy if exists "order_images_bucket_select" on storage.objects;
create policy "order_images_bucket_select" on storage.objects
  for select using (
    bucket_id = 'order-images'
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1]
        and (o.rep_id = auth.uid() or is_manager())
    )
  );

drop policy if exists "order_images_bucket_insert_reference" on storage.objects;
create policy "order_images_bucket_insert_reference" on storage.objects
  for insert with check (
    bucket_id = 'order-images'
    and (storage.foldername(name))[2] = 'reference'
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1] and o.rep_id = auth.uid()
    )
  );

drop policy if exists "order_images_bucket_insert_mockup" on storage.objects;
create policy "order_images_bucket_insert_mockup" on storage.objects
  for insert with check (
    bucket_id = 'order-images'
    and (storage.foldername(name))[2] = 'mockup'
    and is_manager()
  );

drop policy if exists "order_images_bucket_delete" on storage.objects;
create policy "order_images_bucket_delete" on storage.objects
  for delete using (
    bucket_id = 'order-images'
    and is_manager()
  );
