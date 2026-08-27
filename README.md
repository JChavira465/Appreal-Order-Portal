# Apparel Order Desk

Order management for a custom sports-apparel shop: reps take team orders on
their phone, managers move them through mockup → production → shipped, and
the owner gets a private view of profit split and vendor payables. Built on
Next.js 15 (App Router) and Supabase (Postgres + Auth), deployed on Vercel.

This repo is a **demo template** — all branding, prices, vendors, and Venmo
handles are placeholder/dummy data. Swap them for a real shop's values before
using this for anything live (see "Before going live" below).

## Who uses it

Three roles, layered — each one can do everything the role below it can, plus
its own extra:

- **Rep** — places and edits orders for their own teams while an order is
  still in the `submitted` stage, uploads reference photos, generates an
  optional AI concept image, approves or requests changes on a mockup.
- **Manager** — sees every rep's orders, advances an order through its
  workflow, sends mockups, records payments, assigns vendor cost per line,
  exports build sheets for a manufacturer, manages the price list and
  vendors, adds/renames/deactivates reps.
- **Owner (`super_admin`)** — everything a manager can do, plus a private
  `/company` page: profit split across partners, what's owed/paid to each
  vendor, and login/usage activity across the team. Not visible to regular
  managers. Exactly one account can hold this role's protections (it can't be
  deactivated, by accident or otherwise) but nothing stops promoting more
  than one profile to `super_admin` if a shop has multiple owners.

## Core features

- **PIN login** — reps/managers sign in with their name + a 4-digit PIN
  (synthetic-email auth under the hood), no email/password to manage day to
  day. Five wrong attempts locks an account for 15 minutes. A magic-link
  recovery page bootstraps the very first account.
- **Roster-first order entry** — an order is built as one or more "blocks"
  (an item + its specific add-ons, e.g. Jersey / Meshback / Crew Neck), each
  with its own roster of name/number/size rows. A row doesn't need a name —
  a size-only row is a valid unnamed/bulk piece. A "paste a list" mode
  accepts a whole roster pasted in at once (`Smith, 23, L` per line, or a
  bare size for an unnamed piece) instead of typing every row by hand.
- **Add-on modifier groups** — an item's add-ons can be independent toggles
  (long sleeve, hood — pick any combination) or mutually-exclusive choice
  groups (mesh type, collar — pick one, optionally with a default).
- **Custom sizing** — sizes run from youth through adult XS–8XL on tops;
  bottoms additionally offer a free-text "Custom (W×L)" measurement
  alongside the standard size list.
- **Mockup workflow** — Submitted → Mockup Sent → Mockup Approved → In
  Production → Shipped, plus Cancel/Reopen (cancel asks for confirmation
  first). A rep approves or requests changes on a mockup on the customer's
  behalf.
- **Vendor cost & profit tracking** — a manager assigns a manufacturer (and
  a separate hat vendor, since hats often come from a different supplier)
  per order, pulls a per-item cost from that vendor's price list with one
  tap, and sees profit per line and per order once cost is entered anywhere.
- **Excel export** — one filtered export produces order summaries, line
  items, a size tally for cutting, and a names/numbers roster in separate
  sheets; a per-order "build order" export gives a manufacturer a clean
  Item/Description/Size/Count/Cost/Total sheet with no player names on it.
- **Venmo pay links** — a pre-filled Venmo deep link per collector shows up
  automatically on any order with a balance due, with a note carrying the
  team name and the date the order was placed.
- **Owner-only company view** — total profit split across configurable
  partners (by percentage), a running owed/paid balance per vendor with a
  "record payment" action, and a login/usage activity table (last login,
  30-day and all-time login counts, order count) per team member.
- **RLS as the only authorization layer** — every table's row-level security
  policy is the actual security boundary (not just hidden UI); a handful of
  column-level guard triggers stop a rep from editing fields RLS can't
  restrict at row granularity (e.g. changing who submitted an order).

## Tech stack

- **Next.js 15** (App Router, Server Components/Actions, `useActionState`)
- **Supabase** — Postgres, Auth (`@supabase/ssr`), Storage, Row-Level Security
- **Tailwind CSS**
- **SheetJS (`xlsx`)** for exports, dynamically imported so it never ships to
  a rep's bundle (only managers see export buttons)
- Optional **OpenAI** `gpt-image-2` for the AI concept-image feature — unset
  the API key and that one feature just shows "not set up yet"

## Getting started

1. Create a Supabase project.
2. Copy `.env.local.example` to `.env.local` and fill in your project's URL,
   anon key, and service role key (the AI concept feature's `OPENAI_API_KEY`
   is optional).
3. Run every file in `supabase/migrations/` against your project, in order,
   via the Supabase SQL editor (or the CLI). Each one is idempotent —
   safe to re-run.
4. `npm install && npm run dev`.
5. The first account has to come in through `/login/recovery` (magic link)
   since PIN login needs an existing account to pick from — from there,
   promote that account to `super_admin` directly in the `profiles` table,
   and it can create every other account from the app itself.

## Before going live for a real shop

Everything here is dummy/demo data — replace it before this represents an
actual business:

- **Branding** — "Acme Apparel Co." appears in `app/page.tsx`,
  `app/login/page.tsx`, `app/login/recovery/page.tsx`, and the page metadata
  in `app/layout.tsx`.
- **Prices & catalog** — `supabase/migrations/0003_orders_schema.sql` seeds
  round dummy prices; adjust items, add-ons, and base prices for the real
  shop (or do it from `/pricing` after the fact — either works).
- **Vendors & costs** — `supabase/migrations/0017_seed_demo_vendor_costs.sql`
  seeds fictional vendors and costs; replace with the shop's real
  manufacturers/hat vendors and their actual per-item pricing (or add them
  from `/vendors`).
- **Venmo collectors** — `lib/venmo.ts` ships with obviously-fake placeholder
  usernames (`REPLACE-WITH-VENMO-USERNAME-1`/`-2`). Replace with real
  `@usernames` before any pay link is shown to a real customer — a
  wrong-but-plausible placeholder could send a payment to a stranger.
- **Company financials** — the `partner_splits` table starts empty; add real
  partners and percentages from `/company` once there's an owner account.

## Project structure

```
app/
  login/                 unified PIN login page (name + PIN) + server action
  login/recovery/        magic-link fallback, only way to bootstrap the first account
  auth/callback/         exchanges the magic-link code for a session
  logout/                server action to sign out
  page.tsx                protected page: name/role, PIN self-service, manager's
                           "add a rep" panel, super_admin's "add a manager" panel
  team-actions.ts          server actions that provision/rename/deactivate rep and manager accounts
  pin-actions.ts           server action for a signed-in user to set/change their PIN
  orders/OrderForm.tsx        shared form used by both New Order and Edit Order
  orders/new/                 New Order page + its server action
  orders/page.tsx             Order Board (search/sort/filter, manager totals)
  orders/[id]/                Order Detail: pricing breakdown, payments, mockup, status
                               workflow actions, activity log
  orders/[id]/edit/           Edit Order page (reuses OrderForm, updateOrder action)
  pricing/                    Pricing screen (manager-only): add/remove items and add-ons,
                               edit base prices, soft-delete items
  orders/[id]/cost-actions.ts    manager-only server actions: set a line's vendor/unit cost,
                                   set an order's shipping cost
  orders/[id]/CostSection.tsx    LineCostForm + ShippingCostForm, rendered in the manager-only
                                   "Cost & vendor" section on Order Detail
  orders/[id]/VenmoPayLink.tsx   pay link + copy button, shown on Order Detail when a balance is due
  orders/[id]/ai-concept-actions.ts  rep-only server action calling OpenAI to generate a concept image
  orders/[id]/AiConceptSection.tsx   the AI concept generate form on Order Detail
  company/                    super_admin-only: profit split, vendor balances, team activity
  orders/[id]/BuildOrderExport.tsx  "Export build order" button (manager-only)
  orders/[id]/DeleteImageButton.tsx  manager-only × button shown on every photo thumbnail
  vendors/                    Vendors screen (manager-only): add/deactivate manufacturers and hat vendors
  vendors/[id]/               Vendor detail (manager-only): that vendor's per-item price list
lib/supabase/              browser / server / middleware / admin Supabase clients
lib/payment-methods.ts      payment method list + labels (cash, Venmo, Zelle, Cash App, check, card, other)
lib/venmo.ts                 builds the Venmo pay link from a collector's handle + a balance/note
lib/ai-mockup.ts             calls OpenAI's gpt-image-2 to generate an AI concept image
lib/catalog.ts              loads price_items/price_modifiers from the DB, pricing helpers
lib/sizes.ts                 size groups + their fixed size-label lists (tops, bottoms,
                              fitted_hat, one_size) -- reference data, not DB-backed
lib/order-images.ts         upload to the order-images bucket, batch signed URLs
lib/exportOrders.ts         Excel/TSV export (dynamically imported so the xlsx
                             library never ships to reps, who can't see the export button)
middleware.ts               redirects unauthenticated users to /login
supabase/migrations/
  0001_profiles.sql          profiles table, is_manager(), RLS, signup trigger
  0002_pin_login.sql          super_admin role, PIN login support
  0003_orders_schema.sql      orders/pricing/customers/etc. schema, RLS, pricing trigger, seed data
  0004_order_workflow.sql     RLS fix for rep mockup approve/revise, discount-only guard
  0005_order_images_storage.sql  order-images bucket + storage.objects policies
  0006_order_item_sizes.sql   structured per-size quantities, for the Excel size tally
  0007_size_groups.sql        size_group column on price_items, for constrained size dropdowns
  0008_vendors_and_costs.sql  vendors table + manager-only order_item_costs/order_costs tables,
                               for per-order profit tracking
  0009_payment_method.sql     method column on payments (cash, Venmo, Zelle, Cash App, check, card, other)
  0010_protect_super_admin.sql  trigger blocking active=false on a super_admin row, at the DB level
  0011_vendor_manufacturer_pricelist.sql  vendor kind (apparel/hat), order-level manufacturer_id,
                                            vendor_item_costs price list
  0012_ai_concept_images.sql  ai_concept as a third order_images kind, rep-insertable, for
                                the AI concept feature
  0013_pin_lockout.sql        failed_pin_attempts/pin_locked_until columns on profiles,
                                for PIN brute-force protection
  0014_shipping_address.sql   shipping_address column on orders and customers
  0015_size_names_numbers.sql  order_item_size_names, for player names/numbers per size
  0017_seed_demo_vendor_costs.sql  demo vendor names + costs -- replace before going live
  0018_company_financials.sql  partner_splits + vendor_payments, both super_admin-only
  0019_login_events.sql       login_events table, for /company's Team activity section
  0020_modifier_groups.sql    group_key/is_default on price_modifiers, for mutually-exclusive
                                choice groups (mesh type, collar type)
```
