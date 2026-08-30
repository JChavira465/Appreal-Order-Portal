-- Rewrites every RLS policy in the app to add the tenant boundary from
-- 0030. Two things every policy below does that its predecessor didn't:
--
-- 1. Compares the row's company (`company_id`, or the parent order's/
--    vendor's/price_item's `company_id` for a child table) against
--    `current_company_id()`. Without this, `is_manager()`/
--    `is_super_admin()` only ever describe the *calling* user's own
--    role -- they say nothing about which company a row belongs to, so
--    a manager at Company A would see Company B's rows the moment a
--    second company exists in these tables.
-- 2. Adds `is_platform_admin()` as an unconditional bypass, so the one
--    account supporting every company can always read/act on any row,
--    from any company, everywhere -- with one deliberate exception:
--    `issue_reports`, which drops company-owner (`is_super_admin()`)
--    read/update access entirely. Every company's issue reports go to
--    the platform admin only, never to that company's own owner.
--
-- Every policy is dropped and recreated, matching the convention the
-- rest of this migration set already uses -- safe to run more than once.

-- ============================================================
-- companies
-- ============================================================

drop policy if exists "companies_select" on companies;
create policy "companies_select" on companies
  for select using (is_platform_admin() or id = current_company_id());

drop policy if exists "companies_insert" on companies;
create policy "companies_insert" on companies
  for insert with check (is_platform_admin());

drop policy if exists "companies_update" on companies;
create policy "companies_update" on companies
  for update using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists "companies_delete" on companies;
create policy "companies_delete" on companies
  for delete using (is_platform_admin());

-- ============================================================
-- profiles
-- ============================================================

drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles
  for select using (
    id = auth.uid()
    or is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  );

drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles
  for update using (
    id = auth.uid()
    or is_platform_admin()
    or (company_id = current_company_id() and is_manager())
  );

-- ============================================================
-- price_items / price_modifiers
-- ============================================================

drop policy if exists "price_items_select" on price_items;
create policy "price_items_select" on price_items
  for select using (is_platform_admin() or company_id = current_company_id());
drop policy if exists "price_items_insert" on price_items;
create policy "price_items_insert" on price_items
  for insert with check (
    is_platform_admin() or (company_id = current_company_id() and is_manager())
  );
drop policy if exists "price_items_update" on price_items;
create policy "price_items_update" on price_items
  for update using (
    is_platform_admin() or (company_id = current_company_id() and is_manager())
  );
drop policy if exists "price_items_delete" on price_items;
create policy "price_items_delete" on price_items
  for delete using (
    is_platform_admin() or (company_id = current_company_id() and is_manager())
  );

drop policy if exists "price_modifiers_select" on price_modifiers;
create policy "price_modifiers_select" on price_modifiers
  for select using (
    is_platform_admin() or exists (
      select 1 from price_items pi
      where pi.name = price_modifiers.item_name and pi.company_id = current_company_id()
    )
  );
drop policy if exists "price_modifiers_insert" on price_modifiers;
create policy "price_modifiers_insert" on price_modifiers
  for insert with check (
    is_platform_admin() or exists (
      select 1 from price_items pi
      where pi.name = price_modifiers.item_name
        and pi.company_id = current_company_id() and is_manager()
    )
  );
drop policy if exists "price_modifiers_update" on price_modifiers;
create policy "price_modifiers_update" on price_modifiers
  for update using (
    is_platform_admin() or exists (
      select 1 from price_items pi
      where pi.name = price_modifiers.item_name
        and pi.company_id = current_company_id() and is_manager()
    )
  );
drop policy if exists "price_modifiers_delete" on price_modifiers;
create policy "price_modifiers_delete" on price_modifiers
  for delete using (
    is_platform_admin() or exists (
      select 1 from price_items pi
      where pi.name = price_modifiers.item_name
        and pi.company_id = current_company_id() and is_manager()
    )
  );

-- ============================================================
-- customers
-- ============================================================

drop policy if exists "customers_select" on customers;
create policy "customers_select" on customers
  for select using (is_platform_admin() or company_id = current_company_id());
drop policy if exists "customers_insert" on customers;
create policy "customers_insert" on customers
  for insert with check (is_platform_admin() or company_id = current_company_id());
drop policy if exists "customers_update" on customers;
create policy "customers_update" on customers
  for update using (is_platform_admin() or company_id = current_company_id());
drop policy if exists "customers_delete" on customers;
create policy "customers_delete" on customers
  for delete using (is_platform_admin() or company_id = current_company_id());

-- ============================================================
-- orders
-- ============================================================

drop policy if exists "orders_select" on orders;
create policy "orders_select" on orders
  for select using (
    is_platform_admin()
    or (
      company_id = current_company_id()
      and (rep_id = auth.uid() or (is_manager() and status <> 'draft'))
    )
  );

drop policy if exists "orders_insert" on orders;
create policy "orders_insert" on orders
  for insert with check (
    is_platform_admin() or (company_id = current_company_id() and rep_id = auth.uid())
  );

drop policy if exists "orders_update" on orders;
create policy "orders_update" on orders
  for update
  using (
    is_platform_admin()
    or (
      company_id = current_company_id()
      and (
        is_manager()
        or (rep_id = auth.uid() and status in ('draft', 'submitted', 'mockup_pending'))
      )
    )
  )
  with check (
    is_platform_admin()
    or (
      company_id = current_company_id()
      and (
        is_manager()
        or (
          rep_id = auth.uid()
          and status in ('draft', 'submitted', 'mockup_pending', 'cancelled', 'mockup_approved')
        )
      )
    )
  );

drop policy if exists "orders_delete" on orders;
create policy "orders_delete" on orders
  for delete using (
    is_platform_admin()
    or (
      company_id = current_company_id()
      and (is_manager() or (rep_id = auth.uid() and status = 'draft'))
    )
  );

-- ============================================================
-- order_items / order_item_sizes / order_item_size_names
-- (all three inherit their company scope from the parent order --
-- no company_id column of their own)
-- ============================================================

drop policy if exists "order_items_select" on order_items;
create policy "order_items_select" on order_items
  for select using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.company_id = current_company_id()
        and (o.rep_id = auth.uid() or (is_manager() and o.status <> 'draft'))
    )
  );
drop policy if exists "order_items_insert" on order_items;
create policy "order_items_insert" on order_items
  for insert with check (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.company_id = current_company_id()
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
drop policy if exists "order_items_update" on order_items;
create policy "order_items_update" on order_items
  for update using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.company_id = current_company_id()
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
drop policy if exists "order_items_delete" on order_items;
create policy "order_items_delete" on order_items
  for delete using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.company_id = current_company_id()
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );

drop policy if exists "order_item_sizes_select" on order_item_sizes;
create policy "order_item_sizes_select" on order_item_sizes
  for select using (
    is_platform_admin() or exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and o.company_id = current_company_id()
        and (o.rep_id = auth.uid() or (is_manager() and o.status <> 'draft'))
    )
  );
drop policy if exists "order_item_sizes_insert" on order_item_sizes;
create policy "order_item_sizes_insert" on order_item_sizes
  for insert with check (
    is_platform_admin() or exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and o.company_id = current_company_id()
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
drop policy if exists "order_item_sizes_update" on order_item_sizes;
create policy "order_item_sizes_update" on order_item_sizes
  for update using (
    is_platform_admin() or exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and o.company_id = current_company_id()
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
drop policy if exists "order_item_sizes_delete" on order_item_sizes;
create policy "order_item_sizes_delete" on order_item_sizes
  for delete using (
    is_platform_admin() or exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_sizes.order_item_id
        and o.company_id = current_company_id()
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );

drop policy if exists "order_item_size_names_select" on order_item_size_names;
create policy "order_item_size_names_select" on order_item_size_names
  for select using (
    is_platform_admin() or exists (
      select 1 from order_item_sizes ois
      join order_items oi on oi.id = ois.order_item_id
      join orders o on o.id = oi.order_id
      where ois.id = order_item_size_names.order_item_size_id
        and o.company_id = current_company_id()
        and (o.rep_id = auth.uid() or (is_manager() and o.status <> 'draft'))
    )
  );
drop policy if exists "order_item_size_names_insert" on order_item_size_names;
create policy "order_item_size_names_insert" on order_item_size_names
  for insert with check (
    is_platform_admin() or exists (
      select 1 from order_item_sizes ois
      join order_items oi on oi.id = ois.order_item_id
      join orders o on o.id = oi.order_id
      where ois.id = order_item_size_names.order_item_size_id
        and o.company_id = current_company_id()
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
drop policy if exists "order_item_size_names_update" on order_item_size_names;
create policy "order_item_size_names_update" on order_item_size_names
  for update using (
    is_platform_admin() or exists (
      select 1 from order_item_sizes ois
      join order_items oi on oi.id = ois.order_item_id
      join orders o on o.id = oi.order_id
      where ois.id = order_item_size_names.order_item_size_id
        and o.company_id = current_company_id()
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );
drop policy if exists "order_item_size_names_delete" on order_item_size_names;
create policy "order_item_size_names_delete" on order_item_size_names
  for delete using (
    is_platform_admin() or exists (
      select 1 from order_item_sizes ois
      join order_items oi on oi.id = ois.order_item_id
      join orders o on o.id = oi.order_id
      where ois.id = order_item_size_names.order_item_size_id
        and o.company_id = current_company_id()
        and (is_manager() or (o.rep_id = auth.uid() and o.status in ('draft', 'submitted')))
    )
  );

-- ============================================================
-- order_images
-- ============================================================

drop policy if exists "order_images_select" on order_images;
create policy "order_images_select" on order_images
  for select using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_images.order_id
        and o.company_id = current_company_id()
        and (o.rep_id = auth.uid() or is_manager())
    )
  );
drop policy if exists "order_images_insert" on order_images;
create policy "order_images_insert" on order_images
  for insert with check (
    is_platform_admin()
    or (
      kind in ('reference', 'ai_concept') and exists (
        select 1 from orders o
        where o.id = order_images.order_id
          and o.company_id = current_company_id() and o.rep_id = auth.uid()
      )
    )
    or (
      kind = 'mockup' and exists (
        select 1 from orders o
        where o.id = order_images.order_id
          and o.company_id = current_company_id() and is_manager()
      )
    )
  );
drop policy if exists "order_images_delete" on order_images;
create policy "order_images_delete" on order_images
  for delete using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_images.order_id
        and o.company_id = current_company_id() and is_manager()
    )
  );

-- ============================================================
-- payments
-- ============================================================

drop policy if exists "payments_select" on payments;
create policy "payments_select" on payments
  for select using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = payments.order_id
        and o.company_id = current_company_id()
        and (o.rep_id = auth.uid() or is_manager())
    )
  );
drop policy if exists "payments_insert" on payments;
create policy "payments_insert" on payments
  for insert with check (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = payments.order_id and o.company_id = current_company_id() and is_manager()
    )
  );
drop policy if exists "payments_update" on payments;
create policy "payments_update" on payments
  for update using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = payments.order_id and o.company_id = current_company_id() and is_manager()
    )
  );
drop policy if exists "payments_delete" on payments;
create policy "payments_delete" on payments
  for delete using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = payments.order_id and o.company_id = current_company_id() and is_manager()
    )
  );

-- ============================================================
-- activity_log
-- ============================================================

drop policy if exists "activity_log_select" on activity_log;
create policy "activity_log_select" on activity_log
  for select using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = activity_log.order_id
        and o.company_id = current_company_id()
        and (o.rep_id = auth.uid() or is_manager())
    )
  );
drop policy if exists "activity_log_insert" on activity_log;
create policy "activity_log_insert" on activity_log
  for insert with check (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = activity_log.order_id
        and o.company_id = current_company_id()
        and (o.rep_id = auth.uid() or is_manager())
    )
  );

-- ============================================================
-- vendors / vendor_item_costs / vendor_payments
-- ============================================================

drop policy if exists "vendors_select" on vendors;
create policy "vendors_select" on vendors
  for select using (is_platform_admin() or company_id = current_company_id());
drop policy if exists "vendors_insert" on vendors;
create policy "vendors_insert" on vendors
  for insert with check (
    is_platform_admin() or (company_id = current_company_id() and is_manager())
  );
drop policy if exists "vendors_update" on vendors;
create policy "vendors_update" on vendors
  for update using (
    is_platform_admin() or (company_id = current_company_id() and is_manager())
  );
drop policy if exists "vendors_delete" on vendors;
create policy "vendors_delete" on vendors
  for delete using (
    is_platform_admin() or (company_id = current_company_id() and is_manager())
  );

drop policy if exists "vendor_item_costs_all" on vendor_item_costs;
create policy "vendor_item_costs_all" on vendor_item_costs
  for all using (
    is_platform_admin() or exists (
      select 1 from vendors v
      where v.id = vendor_item_costs.vendor_id
        and v.company_id = current_company_id() and is_manager()
    )
  )
  with check (
    is_platform_admin() or exists (
      select 1 from vendors v
      where v.id = vendor_item_costs.vendor_id
        and v.company_id = current_company_id() and is_manager()
    )
  );

drop policy if exists "vendor_payments_all" on vendor_payments;
create policy "vendor_payments_all" on vendor_payments
  for all using (
    is_platform_admin() or exists (
      select 1 from vendors v
      where v.id = vendor_payments.vendor_id
        and v.company_id = current_company_id() and is_super_admin()
    )
  )
  with check (
    is_platform_admin() or exists (
      select 1 from vendors v
      where v.id = vendor_payments.vendor_id
        and v.company_id = current_company_id() and is_super_admin()
    )
  );

-- ============================================================
-- order_item_costs / order_costs
-- ============================================================

drop policy if exists "order_item_costs_all" on order_item_costs;
create policy "order_item_costs_all" on order_item_costs
  for all using (
    is_platform_admin() or exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_costs.order_item_id
        and o.company_id = current_company_id() and is_manager()
    )
  )
  with check (
    is_platform_admin() or exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_costs.order_item_id
        and o.company_id = current_company_id() and is_manager()
    )
  );

drop policy if exists "order_costs_all" on order_costs;
create policy "order_costs_all" on order_costs
  for all using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_costs.order_id and o.company_id = current_company_id() and is_manager()
    )
  )
  with check (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_costs.order_id and o.company_id = current_company_id() and is_manager()
    )
  );

-- ============================================================
-- login_events -- a company's own super_admin keeps seeing their own
-- team's activity (unlike issue_reports below, this one isn't being
-- centralized); the platform admin additionally sees every company's.
-- ============================================================

drop policy if exists "login_events_select" on login_events;
create policy "login_events_select" on login_events
  for select using (
    is_platform_admin() or (company_id = current_company_id() and is_super_admin())
  );
drop policy if exists "login_events_insert" on login_events;
create policy "login_events_insert" on login_events
  for insert with check (
    profile_id = auth.uid() and company_id = current_company_id()
  );

-- ============================================================
-- issue_reports -- deliberately different from every other table above.
-- The whole point is that a company's own owner does NOT get to see
-- these; every company's "Report Issue" submissions go to the platform
-- admin, and only the platform admin. is_super_admin() -- which read/
-- resolved these before multi-tenancy existed -- no longer appears in
-- any policy on this table.
-- ============================================================

drop policy if exists "issue_reports_insert" on issue_reports;
create policy "issue_reports_insert" on issue_reports
  for insert with check (
    reporter_id = auth.uid() and company_id = current_company_id()
  );

drop policy if exists "issue_reports_select" on issue_reports;
create policy "issue_reports_select" on issue_reports
  for select using (is_platform_admin());

drop policy if exists "issue_reports_update" on issue_reports;
create policy "issue_reports_update" on issue_reports
  for update using (is_platform_admin()) with check (is_platform_admin());

-- ============================================================
-- order_tracking_numbers
-- ============================================================

drop policy if exists "order_tracking_numbers_select" on order_tracking_numbers;
create policy "order_tracking_numbers_select" on order_tracking_numbers
  for select using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_tracking_numbers.order_id
        and o.company_id = current_company_id()
        and (o.rep_id = auth.uid() or is_manager())
    )
  );
drop policy if exists "order_tracking_numbers_insert" on order_tracking_numbers;
create policy "order_tracking_numbers_insert" on order_tracking_numbers
  for insert with check (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_tracking_numbers.order_id
        and o.company_id = current_company_id() and is_manager()
    )
  );
drop policy if exists "order_tracking_numbers_delete" on order_tracking_numbers;
create policy "order_tracking_numbers_delete" on order_tracking_numbers
  for delete using (
    is_platform_admin() or exists (
      select 1 from orders o
      where o.id = order_tracking_numbers.order_id
        and o.company_id = current_company_id() and is_manager()
    )
  );

-- ============================================================
-- roster_template_players
-- ============================================================

drop policy if exists "roster_template_players_all" on roster_template_players;
create policy "roster_template_players_all" on roster_template_players
  for all using (is_platform_admin() or company_id = current_company_id())
  with check (is_platform_admin() or company_id = current_company_id());

-- ============================================================
-- partner_splits
-- ============================================================

drop policy if exists "partner_splits_all" on partner_splits;
create policy "partner_splits_all" on partner_splits
  for all using (
    is_platform_admin() or (company_id = current_company_id() and is_super_admin())
  )
  with check (
    is_platform_admin() or (company_id = current_company_id() and is_super_admin())
  );

-- ============================================================
-- venmo_collectors
-- ============================================================

drop policy if exists "venmo_collectors_select" on venmo_collectors;
create policy "venmo_collectors_select" on venmo_collectors
  for select using (is_platform_admin() or company_id = current_company_id());
drop policy if exists "venmo_collectors_insert" on venmo_collectors;
create policy "venmo_collectors_insert" on venmo_collectors
  for insert with check (
    is_platform_admin() or (company_id = current_company_id() and is_manager())
  );
drop policy if exists "venmo_collectors_update" on venmo_collectors;
create policy "venmo_collectors_update" on venmo_collectors
  for update using (
    is_platform_admin() or (company_id = current_company_id() and is_manager())
  );
drop policy if exists "venmo_collectors_delete" on venmo_collectors;
create policy "venmo_collectors_delete" on venmo_collectors
  for delete using (
    is_platform_admin() or (company_id = current_company_id() and is_manager())
  );

-- ============================================================
-- storage.objects (order-images bucket) -- same company boundary,
-- joined through orders the same way the table policies above are.
-- ============================================================

drop policy if exists "order_images_bucket_select" on storage.objects;
create policy "order_images_bucket_select" on storage.objects
  for select using (
    bucket_id = 'order-images'
    and (
      is_platform_admin() or exists (
        select 1 from orders o
        where o.id::text = (storage.foldername(name))[1]
          and o.company_id = current_company_id()
          and (o.rep_id = auth.uid() or is_manager())
      )
    )
  );

drop policy if exists "order_images_bucket_insert_reference" on storage.objects;
create policy "order_images_bucket_insert_reference" on storage.objects
  for insert with check (
    bucket_id = 'order-images'
    and (storage.foldername(name))[2] = 'reference'
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.company_id = current_company_id() and o.rep_id = auth.uid()
    )
  );

drop policy if exists "order_images_bucket_insert_ai_concept" on storage.objects;
create policy "order_images_bucket_insert_ai_concept" on storage.objects
  for insert with check (
    bucket_id = 'order-images'
    and (storage.foldername(name))[2] = 'ai_concept'
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.company_id = current_company_id() and o.rep_id = auth.uid()
    )
  );

drop policy if exists "order_images_bucket_insert_mockup" on storage.objects;
create policy "order_images_bucket_insert_mockup" on storage.objects
  for insert with check (
    bucket_id = 'order-images'
    and (storage.foldername(name))[2] = 'mockup'
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.company_id = current_company_id() and is_manager()
    )
  );

drop policy if exists "order_images_bucket_delete" on storage.objects;
create policy "order_images_bucket_delete" on storage.objects
  for delete using (
    bucket_id = 'order-images'
    and (
      is_platform_admin() or exists (
        select 1 from orders o
        where o.id::text = (storage.foldername(name))[1]
          and o.company_id = current_company_id() and is_manager()
      )
    )
  );
