# Order Desk — Manager & Super Admin Guide

_Last updated: August 30, 2026_

Everything a manager (or anyone running the shop side) can do beyond what
a rep can do. Anything marked **super_admin only** is restricted to the
account owner.

## Roles, quickly

- **Rep** — takes orders, tracks their own, can't see cost/profit or record
  payments. (See the Rep Guide for their side of things.)
- **Manager** — sees and manages every order in the shop: pricing, vendors,
  costs, payments, mockups, and rep accounts.
- **Super Admin** — everything a manager can do, plus Company financials
  (profit splits, vendor balances), the Issues inbox, and adding/removing
  other managers.

## Signing in

Same as reps: pick your name, enter your 4-digit PIN. Change your PIN any
time from the home screen.

## The home screen

Managers see everything a rep sees, plus:

- **"N new orders submitted since you last checked"** — a blue banner that
  appears when a rep has submitted something new. It clears automatically
  the moment you open the Order Board (All Orders) — no button to click.
- **Overdue / due-soon banner** covers every order in the shop, not just
  your own.
- **All Orders** (instead of "My Orders").
- Extra links: **Pricing**, **Vendors**, **Customers**, **Reports**,
  **Hat Orders** — and for super_admin, **Company** and **Issues**.
- **Add a rep** (with their name and a starting 4-digit PIN) — super_admin
  can also **add a manager**.
- A list of staff you manage, where you can rename them or
  deactivate/reactivate their account. (A deactivated account can't sign
  in, but its order history stays intact.)

## Activity

A shop-wide feed of everything happening across every order (mockup sent,
payment recorded, status changed, tracking number added, and so on), most
recent first — a rep only sees activity on their own orders, but as a
manager this is genuinely everything, across everyone. Each entry links
back to the order it happened on.

## The Order Board (All Orders)

Same search/sort/filter tools reps have, plus:

- Filter by **rep**, to see just one person's orders.
- Stat tiles: total order value, balance due, and how many are overdue —
  for whatever's currently filtered.
- **Export N orders to Excel** — exports exactly what's currently filtered,
  so filter by month or rep first if you want a scoped export. The
  workbook has an Orders tab and a Line Items tab, plus a Size Tally and a
  Names & Numbers tab if any order has roster names on it. Rows are
  color-coded by status and paid/unpaid.
- If the download gets blocked by the browser, a "copy for Excel instead"
  button appears — copies the same data as text you can paste straight
  into a spreadsheet.

## What you can do on an individual order that a rep can't

- **Advance the status** — moves the order forward one stage at a time
  (Submitted → Mockup Sent → Mockup Approved → In Production → Shipped).
- **Cancel** any order, or **reopen** one you cancelled by mistake.
- **Cost & vendor** section — assign a vendor and unit cost to each line
  item, plus the order's shipping cost, supplies cost, and **vendor ready
  by** date (when the vendor expects to have it done — separate from the
  customer's deadline). Profit is computed automatically from the costs.
  If the vendor ready-by date is on/after the customer deadline, or
  leaves 2 days or less to ship, a warning shows right there — catches a
  scheduling problem a week early instead of the day the deadline hits.
- **Export build order** — a clean, manufacturer-ready sheet (Item,
  Description, Size, Count, Cost, Total), plus a separate Names & Numbers
  sheet for anything that needs a name/number printed on it. This is a
  different file from the bulk "Export to Excel" above — one per order,
  meant to hand straight to whichever vendor is making it.
- **Tracking numbers** — add one or more shipping tracking numbers (a big
  order can ship in more than one box). Pick the carrier or leave it on
  Auto-detect; both you and the rep see a clickable link to that carrier's
  tracking page, and it also shows on the customer tracking link (below).
- **Customer tracking link** — every order gets a no-login link (copy
  button right on the order page) you or the rep can text/email the
  customer. Shows status, tracking numbers, and — once a mockup's posted —
  the mockup itself with its own Approve / Request changes buttons, so a
  customer can respond directly instead of going through you.
- **Send the mockup** — notes plus an optional image, moves the order into
  "Mockup Sent." From there either you approve/revise it on the customer's
  behalf after talking to them, or the customer does it themselves from
  the tracking link above.
- **Record a payment** (cash, Venmo, Zelle, Cash App, check, card, or
  other) and **apply a discount**.
- **Delete** any uploaded photo (reference, mockup, or AI concept).
- **View / print receipt** — a clean, customer-safe receipt (no cost,
  vendor, or profit info) with a Print / Save as PDF button, for actually
  handing or emailing to the customer.

## Pricing

Add, edit, or remove price items and their add-ons (modifiers): base
prices, which size group an item uses, and its category (jersey, hoodie,
bottoms, hat, etc. — used for reporting). Some add-ons are grouped as
mutually-exclusive choices with a default (e.g. mesh type, collar style) —
a customer picks one from the group, not several.

## Vendors

Add or deactivate manufacturers and hat vendors. Each vendor has its own
price list (tap into a vendor for their per-item costs) — this is what
feeds the Cost & vendor section on individual orders.

## Customers

Every team that has at least one real order on file (drafts and cancelled
orders don't count), ranked by total spend, with their order count and
last order date. Tap a team to jump straight to their filtered order
history on the Order Board. A team with no order in 180+ days gets a
small amber "No order in Nmo" badge — an easy way to spot who's worth a
follow-up call.

## Hat Orders

Every headwear line item across pending orders (not draft, cancelled, or
already shipped), grouped by vendor and style, with a running total
against the shop's usual 10-unit vendor minimum. If three different teams
each ordered a few of the same hat, this is where you'd notice they add
up to a full order and can be combined into one vendor order instead of
three small ones.

## Reports

- Stat tiles: total revenue, total orders, average order value, average
  pieces per order.
- Breakdown tables: by month (orders/revenue/pieces), top items by
  quantity sold, and top customers by spend.
- Its own **"Export reports to Excel"** button — a separate workbook
  (Summary / By Month / By Item / By Customer) from both order exports
  above. Use this one for trend/performance questions, not per-order
  detail.

## Company _(super_admin only)_

- **Profit splits** — the fixed percentage each partner gets (e.g. two
  partners at 50/50, or several at uneven percentages).
- **Vendor balances** — what's owed to each vendor vs. what's actually
  been paid out, plus a log of every vendor payment.
- **Team activity** — a login history for every account (only tracked from
  when this shipped forward — anyone who logged in before that just shows
  "Never logged in" until their next sign-in).

## Issues inbox _(super_admin only)_

Every report submitted through the Report Issue button, newest
unresolved first. Each one shows who submitted it, what they said, which
page they were on, and when. Check the box next to one once you've handled
it — it sinks to the bottom of the list rather than disappearing, so
there's still a record it happened.

There's no email notification for these yet — checking `/issues` in the
app is currently the only way to see them.

## Managing staff

- **Add a rep** — anyone with the "manager" role or higher can do this.
- **Add a manager** — super_admin only.
- **Rename** or **deactivate/reactivate** any rep (a manager) or any
  manager (super_admin only). The super_admin account itself can never be
  deactivated.
