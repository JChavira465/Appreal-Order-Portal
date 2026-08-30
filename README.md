# Apparel Order Portal

Order-management platform for custom sports-apparel shops: reps take team
orders on their phone, managers move them through mockup → production →
shipped, and each shop's owner gets a private view of profit split and
vendor payables.

This is a **multi-tenant platform** — many companies use the same
deployment, each with its own isolated data. On top of every company sits
one **platform admin**: the person who runs this platform, who can see and
assist across every company's data, and is the sole recipient of every
company's "Report Issue" submissions. See "Multi-tenant model" below.

## Who uses it

**Per company**, three roles, layered — each one can do everything the
role below it can, plus its own extra:

- **Rep** — places and edits orders for their own teams, uploads reference
  photos, generates an optional AI concept image, approves or requests
  changes on a mockup.
- **Manager** — sees every rep's orders, advances an order through its
  workflow, sends mockups, records payments, assigns vendor cost per line,
  exports build sheets for a manufacturer, manages the price list and
  vendors, adds/renames/deactivates reps.
- **Owner (`super_admin`)** — everything a manager can do, plus a private
  `/company` page: profit split across partners, what's owed/paid to each
  vendor, and login/usage activity across the team.

**Across every company**, one additional tier:

- **Platform admin** (`profiles.platform_admin`) — not a member of any
  company. Can read and act on any company's data to help with support,
  and is the only account that ever sees `/issues` — every company's
  "Report Issue" submissions land there, never with that company's own
  owner.

## Multi-tenant model

- Every tenant-owned table (`orders`, `customers`, `vendors`,
  `price_items`, `issue_reports`, `partner_splits`, `venmo_collectors`,
  `roster_template_players`, `login_events`) carries a `company_id`.
  Tables that hang off one of those (`order_items`, `order_images`,
  `payments`, `vendor_item_costs`, etc.) inherit their company scope from
  the parent row instead of duplicating the column.
- RLS is the actual authorization boundary, same as before multi-tenancy,
  now with a second dimension: every policy checks *which company* a row
  belongs to (`company_id = current_company_id()`), not just *what role*
  the caller has. `is_manager()`/`is_super_admin()` only ever describe the
  calling user's own role — they say nothing about tenancy, so every
  policy that uses them pairs it with a company check.
- `is_platform_admin()` bypasses the company check everywhere, with one
  deliberate exception: `issue_reports`. A company's own `super_admin`
  never has read/update access to that table, by design — see
  `supabase/migrations/0031_multi_tenant_rls.sql`.
- **Not yet built**: an actual onboarding flow (a "create company" +
  invite-the-first-owner UI), and a real per-company login URL (a
  subdomain, or a `/c/{slug}/login` path) — `/login` currently resolves
  the company from a `?company=<slug>` query param as a stopgap. Every
  existing query/action in `app/` also still needs to be retrofitted to
  filter/insert by `company_id` explicitly — the schema and RLS enforce
  the boundary at the database level regardless, but the app layer isn't
  fully wired to it yet.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Auth +
Postgres + Storage) · Vercel

## Setup

### 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run every file in `supabase/migrations/` **in order**
   (`0001` → `0031`). Each one is idempotent — safe to re-run. `0030` and
   `0031` are the multi-tenant foundation: `companies`, `company_id` on
   every tenant table, the `platform_admin` flag, and every RLS policy
   rewritten to enforce the company boundary.
3. **Bootstrap your own platform admin account** via magic-link recovery,
   since nobody can self-register:
   - Visit `/login/recovery`, sign in with your email via magic link.
   - Promote yourself in the SQL editor:
     ```sql
     update profiles set platform_admin = true, full_name = 'Your Name'
     where id = (select id from auth.users where email = 'you@example.com');
     ```
4. **Create your first company** (also via SQL editor, until an
   onboarding UI exists):
   ```sql
   insert into companies (name, slug) values ('Acme Apparel', 'acme');
   ```
   Then create that company's first owner account the same way as the
   platform admin above, but set `company_id` (to the new company's id)
   and `role = 'super_admin'` instead of `platform_admin`.
5. In **Authentication → URL Configuration**, set:
   - **Site URL**: your deployed Vercel URL
   - **Redirect URLs**: add `https://<your-domain>/auth/callback` (and
     `http://localhost:3000/auth/callback` for local dev)
6. Supabase's built-in email sending (used for magic-link recovery) has a
   low rate limit meant for testing, not production. Fine for now; add
   custom SMTP later if it becomes a real bottleneck.

### 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the values from
**Project Settings → API** in Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is the `service_role` secret key (not the
`anon` key) — server-only, never prefixed with `NEXT_PUBLIC_` or
referenced from a Client Component.

### 3. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000/login?company=acme` (swap in the slug you
created above).

### 4. Deploy to Vercel

1. Import this repo into Vercel.
2. Add the same three environment variables in **Project Settings →
   Environment Variables**.
3. Deploy, then confirm Supabase's Site URL/Redirect URLs match the final
   domain exactly.

## Core features (per company)

- **PIN login** — staff sign in with their name + a 4-digit PIN
  (synthetic-email auth under the hood). Five wrong attempts locks an
  account for 15 minutes.
- **Roster-first order entry** — an order is built as one or more "blocks"
  (an item + its add-ons), each with its own roster of name/number/size
  rows, or a pasted-in roster list.
- **Add-on modifier groups** — independent toggles or mutually-exclusive
  choice groups per item.
- **Custom sizing** — youth through adult XS–8XL on tops; bottoms
  additionally offer a free-text custom measurement.
- **Mockup workflow** — Submitted → Mockup Sent → Mockup Approved → In
  Production → Shipped, plus Cancel/Reopen and save-as-draft.
- **Vendor cost & profit tracking** — a manager assigns a manufacturer (and
  a separate hat vendor) per order, pulls a per-item cost with one tap,
  and sees profit per line and per order.
- **Excel export** — filtered order/line-item/size-tally/roster export,
  plus a per-order "build order" export for a manufacturer.
- **Venmo pay links** — a pre-filled Venmo deep link per collector (the
  company's own `venmo_collectors`, entered from the app, not hardcoded)
  on any order with a balance due.
- **Owner-only company view** — profit split across partners, vendor
  owed/paid balances, and team login/usage activity.
- **Report Issue** — any signed-in user can flag a problem; it goes to the
  platform admin, not their own company's owner.
- **RLS as the only authorization layer** — every table's row-level
  security policy is the real security boundary, enforcing both role and
  company at once.

## Directory map

```
app/
  activity/                   cross-order activity feed (manager/owner)
  auth/callback/route.ts       magic-link/recovery callback handler
  company/                    owner-only profit split, vendor balances, team activity
  customers/                  saved customers (team/contact info)
  hats/                       hat-specific vendor/cost views
  issues/                     platform-admin-only inbox for Report Issue submissions
  login/                      name+PIN sign-in, magic-link recovery
  orders/                     New Order, Order Board, Order Detail (workflow, costs,
                                payments, images, tracking, AI concept)
  pricing/                    price list + add-on management (manager/owner)
  reports/                    filtered Excel export
  track/                      public, unauthenticated order-tracking page for customers
  vendors/                    vendor + per-item cost management
  issue-actions.ts             server action behind the Report Issue button
  team-actions.ts              add/edit/deactivate rep & manager accounts
lib/
  supabase/                   browser / server / middleware / admin Supabase clients
  catalog.ts                  loads price_items/price_modifiers, pricing helpers
  venmo.ts                     loads a company's venmo_collectors, builds pay links
  payment-methods.ts           payment method list + labels
  sizes.ts                     size groups + fixed size-label lists (reference data)
  order-images.ts              upload to the order-images bucket, batch signed URLs
  exportOrders.ts              Excel/TSV export (dynamically imported)
  tracking.ts                  carrier list for shipment tracking numbers
  ai-mockup.ts                 calls OpenAI's gpt-image-2 for the AI concept feature
supabase/migrations/           see below
```

## Migrations

```
0001_profiles.sql            profiles table, is_manager(), RLS, signup trigger
0002_pin_login.sql            super_admin role, PIN login support, list_active_staff()
0003_orders_schema.sql        orders/pricing/customers/etc. schema, RLS, pricing trigger, seed data
0004_order_workflow.sql       RLS fix for rep mockup approve/revise, discount-only guard
0005_order_images_storage.sql order-images bucket + storage.objects policies
0006_order_item_sizes.sql     structured per-size quantities, for the Excel size tally
0007_size_groups.sql          size_group column on price_items, for constrained size dropdowns
0008_vendors_and_costs.sql    vendors table + manager-only order_item_costs/order_costs
0009_payment_method.sql       method column on payments
0010_protect_super_admin.sql  trigger blocking active=false on a super_admin row
0011_vendor_manufacturer_pricelist.sql  vendor kind, order-level manufacturer_id, vendor_item_costs
0012_ai_concept_images.sql    ai_concept order_images kind, rep-insertable
0013_pin_lockout.sql          failed_pin_attempts/pin_locked_until, for PIN brute-force protection
0014_shipping_address.sql     shipping_address on orders and customers
0015_size_names_numbers.sql   order_item_size_names, for player names/numbers per size
0016_beanie_not_headwear.sql  Beanie is_headwear -> false
0017_seed_real_vendor_costs.sql  placeholder — vendor/cost data is entered per company in-app,
                                   not seeded (see migration file)
0018_company_financials.sql   partner_splits + vendor_payments, owner-only
0019_login_events.sql         login_events table, for /company's Team activity section
0020_modifier_groups.sql      group_key/is_default on price_modifiers, for choice groups
0021_order_drafts.sql         'draft' order status, RLS/trigger updates for save-without-submitting
0022_item_category.sql        category column on price_items
0023_supplies_cost.sql        supplies_cost column on order_costs
0024_orders_viewed_at.sql     orders_viewed_at on profiles, for "N new orders" banner
0025_issue_reports.sql        issue_reports table, for the Report Issue button
0026_issue_resolved.sql       resolved column + update policy on issue_reports
0027_order_tracking_numbers.sql  order_tracking_numbers table, for shipping tracking links
0028_roster_templates.sql     roster_template_players table, for saved roster templates
0029_vendor_ready_by.sql      vendor_ready_by date column on order_costs
0030_companies_and_platform_admin.sql  companies table, company_id on every tenant table,
                                          platform_admin flag, current_company_id()/
                                          is_platform_admin() helpers, scoped list_active_staff()
0031_multi_tenant_rls.sql     every RLS policy rewritten to enforce the company boundary;
                                 issue_reports restricted to the platform admin only
```
