# Apparel Logic

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

In production also set:

```
NEXT_PUBLIC_SITE_URL=https://your-final-domain
```

This is the base URL the emailed magic-link callback points back to. Left
unset, that URL falls back to the incoming request's `Origin` header,
which is set by whoever made the request — fine locally, not something to
trust on a real deployment.

### 3. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000/login?company=acme` (swap in the slug you
created above).

### 4. Deploy to Vercel

1. Import this repo into Vercel.
2. Add the same environment variables in **Project Settings →
   Environment Variables** (including `NEXT_PUBLIC_SITE_URL`).
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
  shopInfo.ts                  loads a company's standing terms (payment/turnaround/tax)
  plans.ts                     the three tiers, their prices and which features each unlocks
  companyPlan.ts               loads a company's plan/billing state; requireFeature() gate
  stripe.ts                    Stripe client + tier<->price mapping, inert without keys
  email.ts                     Resend wrapper; a no-op that logs when unconfigured
  notify.ts                    the four moments worth emailing about
  payouts.ts                   payment handles, deep links and the order reference
  like.ts                      escapes SQL LIKE wildcards before an ilike match
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
0032_company_suspension.sql   current_company_id() returns null while a company is inactive,
                                 so suspending one row locks out every table at once
0033_price_items_per_company.sql  price_items keyed on (company_id, name) instead of name
                                     alone; company_id + composite FKs on price_modifiers,
                                     order_items and vendor_item_costs
0034_customer_order_links.sql order_links table + orders.customer_submitted, for the
                                 customer-facing intake form; set_order_item_price() scoped
                                 to the order's own company
0035_security_hardening.sql   price_modifiers RLS scoped to its own company_id (was joining
                                 price_items on name alone, leaking across companies);
                                 role changes restricted to a super_admin/platform admin and
                                 never to your own row
0036_shop_info.sql            company_settings table (payment terms, turnaround, tax/shipping
                                 note), kept separate from `companies` so an owner editing
                                 their own terms can't reach `active` or `slug`
0037_plans_and_billing.sql    tier + billing columns on companies, has_feature()/
                                 tier_seat_limit(), and RLS on every gated table so a plan
                                 can't be bypassed through PostgREST
0038_company_feature_overrides.sql  company_features table + override-aware has_feature(),
                                       so one company can be granted or denied a single
                                       feature without moving their whole tier
0039_trial_enforcement.sql    company_is_entitled(); an expired trial now closes access the
                                 same way suspension does, instead of trial_ends_at being a
                                 date nothing ever checked
0040_revision_notes.sql       orders.revision_note — what the customer actually wants changed,
                                 instead of a boolean that said only that someone was unhappy
0041_self_serve_signup.sql    profiles.signup_email + unique index, so a shop can sign itself
                                 up without the platform admin creating it by hand
0042_payout_accounts.sql      payout_accounts (Venmo / Cash App / Apple Cash / Zelle),
                                 replacing venmo_collectors; migrates existing handles across
```

## Changelog

### September 3, 2026 — Real screens on the landing page

The landing page described the product without ever showing it. Three
screenshots now sit under the hero: an order with a five-player roster on
it, a customer's own order form headed with the shop's name and terms,
and a balance due with Venmo and Cash App buttons.

They're captured from the running app, not drawn — a temporary route
rendered the actual `OrderForm`, `CustomerOrderForm` and `PayPanel`
components with obviously-fake demo data (Northside Wildcats 12U,
Strikeout Nation Apparel), Playwright photographed them at phone width,
and the route was deleted. So the images can never drift from the real
UI the way a mock-up does, and no real customer's order is sitting on a
public marketing page.

Also removed a duplicated "Reference photos" heading on the new-order
form — the section header and the field label rendered identically, one
directly above the other. It only became obvious in a screenshot.

### September 3, 2026 — Apparel Logic, and a front door

Renamed from "Order Desk", which turned out to be an existing ecommerce
SaaS (orderdesk.com) — same industry, and theirs in Google's index.
Caught before a domain was bought, staff bookmarked sign-in links, or it
went on an invoice. Renaming later would have cost every saved link a
shop had plus a trademark letter nobody wants.

**`/` is now a public landing page** and the signed-in dashboard moved to
`/home`. Until now the front door was a login screen, so a shop owner who
got pitched on Tuesday and looked the company up on Thursday saw
somebody's internal tool rather than a product worth buying. One page:
what it is, who it's for, the six things nobody else does properly, and
the price list.

Kept as one domain and one deploy rather than a separate marketing site.
For a solo founder every extra moving part is something that breaks at
1am, and Next.js serves a static landing page from the same project at no
extra cost.

One trap worth recording: `/` could not simply be added to the
middleware's `PUBLIC_PATHS`, which is matched with `startsWith()` — every
path on the site starts with `/`, so that one line would have made the
whole application public. It lives in a separate exact-match list, named
so nobody appends to the wrong array later.

### September 3, 2026 — Getting paid

Shops collected on Venmo only, through a table with no screen to edit it.
A coach who uses Cash App was not going to install Venmo to pay for
jerseys, and payments arrived with references like "jerseys" that nobody
could match to an order.

**Owners now add their own handles** under Shop Info — Venmo, Cash App,
Apple Cash and Zelle — and they appear automatically on every order with
a balance, in two places: the rep's order screen, and the **customer's own
tracking page**, where they can pay without an account or a phone call.

Every payment carries a reference of `#1042 Wildcats` — order number
first because that's what a shop searches by, team name because that's
what they recognise.

The four apps are deliberately not treated as one thing, because they
aren't:

- **Venmo** takes a real deep link: recipient, amount *and* the reference
  all pre-fill, so the note lands on the payment itself.
- **Cash App** pre-fills the amount but has no note parameter, so the
  screen says to add the reference and offers a copy button.
- **Apple Cash and Zelle** have no link at all — Apple Cash goes through
  Messages, Zelle through the payer's own bank. Both show the details with
  instructions rather than a button that would pretend to work.

Writing a handle is manager-and-up. A rep quietly redirecting payments to
their own Venmo is precisely what that restriction is for.

The customer tracking page now shows a balance, which is a change to what
that page reveals: it was previously status-only. It shows the total the
customer already agreed to and nothing else — cost, vendor and profit
stay off it as firmly as ever — because a customer cannot pay a balance
they can't see.

**This is not payment processing.** Nothing moves money or confirms
anything; somebody still checks the app and records the payment, exactly
as today. What changes is that the customer stops asking where to send it,
and the shop stops guessing what an incoming $340 was for.

### September 3, 2026 — Notifications, self-serve signup, revision notes

The three biggest gaps between what this app claims and what it did.

**Nothing ever notified anybody.** No email, no SMS, anywhere. The pitch
is "stop running your shop on texts", but a mockup going out still meant
someone had to send a text — so the texts came back and the app became
the extra step. Four moments now send email: a new order lands, a mockup
is ready, the customer approves or asks for changes, a payment is
recorded. Email is optional infrastructure like Stripe: with no
`RESEND_API_KEY` every send is a logged no-op and nothing else changes.
Nothing in `lib/notify.ts` can throw — an order that saved and didn't
email beats an order that didn't save because an email did. Rep accounts
carry synthetic `@staff.internal` addresses, which are filtered out
before sending so they never bounce against the sending domain.

**Only the platform admin could create a company.** Correct for three
design partners, impossible at thirty — nobody could start a trial while
he was asleep. `/signup` now creates the company, the owner, and a
14-day trial in one step and signs them in. Everything that matters is
set server-side from constants: tier, billing status, trial length, role
and `platform_admin` are never read from the form, so a shop cannot sign
itself up onto Unlimited or as a platform admin. Slug collisions get a
numeric suffix rather than an error, because two shops sharing a name is
normal. A failed owner account rolls the company row back, so a
half-finished signup leaves nothing behind.

**"Request changes" captured no reason.** The shop learned someone was
unhappy and had to phone to find out why — the exact conversation this
app exists to absorb. The customer now gets a box to say what they want
changed; it lands at the top of the order screen under the status, and
into the activity feed so round three can still read what round two
asked for. Optional on purpose: making it required pushes someone who
just wants to say "not quite" back into a text message.

### September 3, 2026 — Trials that actually end

`trial_ends_at` was set, displayed, and never checked. "14-day free
trial" meant "free forever" — fine while every company is someone you
know, wrong the moment strangers sign up.

Enforced through the same single point of control suspension uses:
`current_company_id()` stops resolving once a trial lapses, and because
nearly every RLS policy compares against it, everything closes at once
with no per-policy changes. Both it and `has_feature()` now route through
one `company_is_entitled()` function, so the rule can't drift between
them.

The shop sees a "your free trial has ended" screen with a link to the
plans — deliberately a different screen from suspension, because this one
has a way out the owner can take themselves. Their data is untouched and
comes straight back on payment.

**A null end date never expires.** Missing data must not lock anyone out:
the safe failure is "keeps working", because a wrongly-locked-out paying
customer is far worse than a trial that runs long. It also gives the
platform admin a clean way to carry a design partner indefinitely.

Trial dates are now editable from the company page — set a date, +14, +30,
or "never expires" — so extending someone is a click rather than SQL.

### September 3, 2026 — Per-company feature overrides

Tier is the right default and the wrong whole story. Real deals don't fit
three boxes: a beta tester gets AI concepts thrown in while paying
Starter money, a shop needs cost tracking today and will upgrade next
month, someone abuses a feature and has it pulled without a price change.
All three are "this company, this feature", not "this tier".

So tier stays the baseline and an override wins over it, in **both**
directions — force a feature on that the plan doesn't include, or off
that it does. A feature with no override just follows the tier, which is
the case for nearly every company nearly always.

Each company now has its own page under Companies showing what they're
on, what it lists at, how many staff seats they're using, whether Stripe
is connected, and a three-state control per feature: *plan default*,
*force on*, *force off*. Overrides carry a note field, because six months
from now "why does this one shop have AI concepts on Starter" is a
question with no answer unless it was written down at the time.

Resolution order, in `has_feature()` and mirrored in `planAllows()`:
platform admin → always yes; unpaid → always no; override → wins; else
tier. The unpaid check sits **above** overrides deliberately — a grant
made while a company was paying does not survive their cancellation.

Writes to `company_features` are platform-admin only with no exceptions.
A company able to write its own row there could hand itself every feature
in the product.

### September 1, 2026 — Plans, billing, and a company switcher

Three tiers, priced so the middle one is the obvious answer for a real
shop:

| | Starter | Pro | Unlimited |
|---|---|---|---|
| Monthly | $99 | $199 | $299 |
| Yearly | $990 | $1,990 | $2,990 |
| Staff | 3 | 10 | unlimited |

Yearly is 10× monthly — "two months free" is easy to say out loud and
easy for a shop owner to verify, which matters more than optimizing a
percentage.

Everything core is on every plan: taking orders, pricing, customers,
staff PINs, public tracking links, receipts, shop info. **Pro** adds cost
tracking and profit reports, customer order links, saved rosters, and hat
orders. **Unlimited** adds partner splits, vendor payments, and AI design
concepts.

Two of those placements are deliberate rather than arbitrary. AI concepts
sit on the top tier because every generation costs the platform real
money at the image API — it's the one feature with per-use cost, so it
belongs where the margin is. Cost tracking sits on Pro because it's the
feature that separates "I write orders down" from "I run a business,"
and that's exactly the moment a shop is willing to pay more.

**Enforcement is in the database, not the UI.** `has_feature()` is called
from the RLS policies on every gated table, so a shop can't reach a paid
feature by hitting PostgREST directly with the public anon key — which
they could, if this were only a hidden button. The app-layer checks exist
so people get an explanation of what they'd be buying instead of a screen
that silently comes back empty.

**Billing runs through Stripe** and is entirely optional: with no keys
set, the app behaves exactly as before and the platform admin assigns
tiers by hand. With keys set, an owner picks a plan, pays through Stripe
Checkout, and manages their own card and invoices in Stripe's hosted
portal. The webhook is the only thing that can mark a company paid —
nothing in the app's own UI can, which is what stops a shop from granting
itself a plan.

A failed payment (`past_due`) deliberately keeps full access. An expired
card is not a shop that decided to leave, and locking someone out of
their own order history mid-season over $99 costs far more goodwill than
the week Stripe spends retrying. Only a genuine cancellation locks out,
and it does so through the existing suspension lever rather than a second
mechanism.

**Company switcher.** The platform admin now gets a dropdown at the top
of every screen listing every company; picking one drops you into that
company's side, with a banner showing whose data you're looking at and an
Exit button. It stays on the current screen where that screen understands
assist mode, and lands on the Order Board where it doesn't. Nothing about
this needed a custom domain.

### September 1, 2026 — Shop info

Every shop has standing terms — when they need to be paid, how long
production takes, how tax and shipping are handled — and they lived
nowhere in the app. A customer reading a receipt or a tracking page had
no way to answer "when do I get this?", and a rep sending an order link
had to paste the terms into a text message by hand every time.

**Managers now set three fields once, under Shop Info**, and they appear
on all three customer-facing surfaces automatically:

- the printed receipt, next to the balance due;
- the public tracking page;
- the customer-facing order form, above the items — payment terms and
  turnaround are what someone wants to know *before* filling out an
  order, not after.

Any field left empty is hidden, and a shop that sets none of the three
shows no terms section at all. The platform admin can edit a company's
shop info the same way as pricing, via `?company=<slug>`.

`company_settings` is a separate table rather than columns on
`companies`, and that is load-bearing rather than tidiness:
`companies_update` is platform-admin-only because `active` is the
suspension lever and `slug` is what every sign-in URL resolves through.
Opening that row up so an owner could edit their own turnaround time
would also hand them their own un-suspend button.

### September 1, 2026 — Security audit and fixes

A full pass over the multi-tenant conversion: every `createAdminClient`
(RLS-bypassing) call site, every server action, every RLS policy, and the
public/unauthenticated surface. Seven issues found and fixed.

Tenant boundary:

- **`price_modifiers` leaked across companies (read and write).** `0031`
  resolved that table's tenancy by joining `price_items` on `name` alone,
  which was correct while `price_items.name` was globally unique. `0033`
  changed the key to `(company_id, name)` and gave `price_modifiers` its
  own `company_id`, but the policies were never updated — so a manager at
  one company could read, edit and delete another company's add-on rows
  for any item name both happened to share ("Jersey", "Hoodie"). `0035`
  scopes the policies to the row's own `company_id`.

Privilege escalation:

- **A manager could promote themselves to `super_admin`.**
  `protect_profile_fields` gated role changes behind `is_manager()`, which
  has always meant "manager *or* super_admin", and `profiles_update` lets
  a user edit their own row. The app's own UI refuses this, but the anon
  key is public and PostgREST takes an authenticated `PATCH` directly.
  Role changes now require a super_admin or the platform admin, and
  nobody can change their own role.

Unauthenticated surface:

- **Account recovery created accounts.** `signInWithOtp` defaults to
  `shouldCreateUser: true`, so anyone could type any email into
  `/login/recovery` and have an auth user provisioned for it — on a
  platform with no public sign-up — while spending the project's email
  quota to mail arbitrary addresses. Now `shouldCreateUser: false`, with
  a deliberately identical response either way so the form can't be used
  to test whether an address has an account.
- **The magic-link callback URL came from the request's `Origin`
  header.** Attacker-controlled input deciding where a sign-in link
  points, with Supabase's redirect allowlist as the only backstop — and a
  wildcard entry there (which preview deployments encourage) removes that
  backstop. Now read from `NEXT_PUBLIC_SITE_URL`, falling back to the
  request origin only for local development.
- **Post-auth open redirect in `/auth/callback`.** The `next` query
  parameter was concatenated onto the site origin unchecked, so
  `next=//evil.com` sent a *freshly authenticated* user to another origin.
  Only plain same-site paths are accepted now.
- **The customer order form could overwrite an existing customer.**
  `submitCustomerOrder` matched an existing customer with `ilike` on the
  team name the customer typed, and PostgREST passes `%`/`_` through as
  SQL wildcards — so a team name of `%` matched the shop's first customer
  row and overwrote its contact name, phone and shipping address. Added
  `lib/like.ts` and escaped the wildcards at all three `ilike` call sites.
- **Unmetered spend on AI concept generation.** `generateAiConcept`
  called the paid image API before checking the caller could see the
  order, and its four-per-order cap counts `order_images` rows — which
  returns 0 for any order id the caller can't read. A random UUID was
  therefore an unlimited generation budget. The order is now confirmed
  visible first.

Also tightened: `/login` no longer echoes an arbitrary `?error=` string
back to the user (React escaped it, so never an XSS, but "Sign-in failed:
&lt;attacker text&gt;" on a real sign-in page is a free phishing lure), and
raw Supabase error text is no longer surfaced on the unauthenticated
recovery and callback paths.
