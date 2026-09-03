# Apparel Order Portal — notes for Claude

Next.js 15 (App Router) + TypeScript + Tailwind + Supabase order-management
platform, built by Jose Chavira. Deployed via Vercel. Repo:
`JChavira465/Appreal-Order-Portal`. Work happens on branch
`claude/apparel-order-desk-setup-42k8gj`.

**This is a multi-tenant platform, not a single shop's internal tool.**
Every company using it gets its own isolated data (orders, vendors,
pricing, staff) via `company_id` + RLS — see `supabase/migrations/0030_*`
and `0031_*` for the tenant model. On top of every company sits exactly
one **platform admin** (`profiles.platform_admin = true`), who can see and
assist across every company's data and is the sole recipient of every
company's "Report Issue" submissions. A company's own `super_admin` never
sees another company's data, and never sees the platform admin's inbox.

## Name

The user calls Claude **Stitch** on this project. Answer to it. He picked
it because a stitch holds pieces together and catches things before they
unravel, which is roughly the job here.

He's Jose — founder, not an engineer.

## Workflow for every change

1. Implement.
2. `npx tsc --noEmit` — must be clean.
3. `npm run build` with placeholder env vars — must be clean:
   ```
   NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" \
   NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" \
   SUPABASE_SERVICE_ROLE_KEY="placeholder" \
   OPENAI_API_KEY="placeholder" \
   npm run build
   ```
4. `rm -rf .next`.
5. `git add` the specific changed files (never `-A`/`.`).
6. Commit with a descriptive multi-paragraph message.
7. `git push -u origin claude/apparel-order-desk-setup-42k8gj`, retrying up
   to 4 times with exponential backoff (2s/4s/8s/16s) on network failure.
8. If a new migration was written, paste its full SQL verbatim in the chat
   reply. **Never run a migration against Supabase directly** — the user
   runs it themselves in the SQL editor.
9. Update `README.md`: add a new dated section describing the feature, and
   append to the running migrations list at the bottom.
10. See "User guides" below — every 5th change also regenerates
    `docs/rep-guide.md` and `docs/manager-guide.md`.

## User guides

Two living guides for the people who actually use the app day to day (not
developers), written from a single company's point of view — a rep or
manager never needs to know the platform is multi-tenant:

- `docs/rep-guide.md` — everything a rep needs to sign in, submit and track
  orders, handle mockups, and get paid.
- `docs/manager-guide.md` — everything a manager/super_admin can do beyond
  a rep (covers both roles, noting super_admin-only sections explicitly).

**Standing instruction from the user: after every 5 changes shipped to this
app, regenerate both guides** so they stay current with what's actually
live — re-read the changed pages/actions rather than relying on memory,
update anything that's now inaccurate or missing, and bump the "Last
updated" date at the top of each file. A "change" here means one shipped
feature/fix cycle (one entry in the README's dated changelog), not each
individual file edit within it.

Change counter — increment by 1 each time a change is committed and
pushed; reset to 0 immediately after regenerating both guides:

- **Changes since last guide update: 3** (guides last regenerated
  September 3, 2026)

## Scheduled routines (standing instructions from the user)

Two recurring jobs run against this repo. Each fires a fresh session, so
they carry no memory of previous runs -- read the README changelog and
recent commits before claiming anything is new.

- **5:00pm Central, daily -- "What's still not complete."** A single
  checklist of everything outstanding, with step-by-step instructions a
  non-developer can follow. Any SQL goes in exact run order, lowest
  migration number first, preferably as one combined script rather than
  several. If nothing is outstanding, say so in one line -- never
  manufacture work to fill the report.

- **10:00pm Central, daily -- deep security review.** Full audit (see
  the threat list in the routine's own prompt). Fix only what purely
  tightens access and cannot break working behaviour. Anything that
  could break something, lock someone out, change what a company can
  see, touch billing, or need a data-rewriting migration: STOP, explain
  it in plain language, and wait for the user's decision. A clean night
  reported as clean is a real result.

**Deadline: this app must be production-ready by September 30, 2026.**
Flag genuine risk to that date honestly rather than reassuringly.

The user is the founder, not an engineer, and has said he often doesn't
read long output. Lead with the two or three things that actually matter
in plain language; put detail underneath.

## Before running any check the user asks for

**Standing instruction from the user:** when they ask for a check, an
audit, a review, or "does this work" — the FIRST thing to do is confirm
every migration written so far has actually been run against their
Supabase project. Do not audit or diagnose anything until that's
established.

List `supabase/migrations/`, name the ones from recent work by number,
and ask which have been run — or have them run the verification query
below and paste the result. An unrun migration is the single most common
cause of "everything is broken" in this app, and it looks identical to a
real bug from the outside (missing column, empty result, silent
permission failure). Diagnosing on top of a stale schema wastes their
time and produces wrong answers.

```sql
-- What the schema actually has right now
select
  to_regclass('public.order_links')       is not null as has_0034,
  exists (select 1 from pg_policies
           where tablename = 'price_modifiers'
             and policyname = 'price_modifiers_select'
             and qual like '%company_id = current_company_id()%') as has_0035,
  to_regclass('public.company_settings')  is not null as has_0036,
  to_regproc('public.has_feature(text)')  is not null as has_0037,
  to_regclass('public.company_features')  is not null as has_0038,
  to_regproc('public.company_is_entitled(uuid)') is not null as has_0039,
  exists (select 1 from information_schema.columns
           where table_name = 'orders' and column_name = 'revision_note') as has_0040,
  exists (select 1 from information_schema.columns
           where table_name = 'profiles' and column_name = 'signup_email') as has_0041;
```

## Things that have bitten us before

- A `"use server"` file may only export **async functions**. Re-exporting
  a constant or an array from one (`export { FEATURES }`) compiles and
  passes `npm run build` clean, then throws a server-side exception at
  runtime on every page that imports it. Types are fine (they erase);
  values are not. Keep shared constants in `lib/`.

- Vercel Edge Middleware has a hard 25s execution limit that can't be
  raised — any slow operation there needs to race against a shorter
  internal timeout and fail closed (see `lib/supabase/middleware.ts`).
- Next.js Server Actions default to a 1MB body limit — raised to 20MB in
  `next.config.ts` for big roster + photo submissions.
- Don't silently swallow Supabase query errors on anything gating access
  (profile/role/company lookups especially) — an unrun migration adding a
  selected column turns into "everyone loses all their permissions" with
  no visible error, not a clean failure. `console.error` on any query
  whose data drives a permission check or a core screen.
- RLS is the real authorization boundary everywhere; manager-only tables
  (`order_item_costs`, `order_costs`, etc.) just come back empty for a rep
  rather than erroring, so a shared query can always request manager-only
  joined data safely. Same principle now applies across companies: a
  cross-company row just doesn't come back, it doesn't error.
- `is_manager()` / `is_super_admin()` only describe the *calling* user's
  own role — they say nothing about which company a row belongs to. Every
  policy that uses them must separately scope the target row by
  `company_id = current_company_id()` (or allow `is_platform_admin()` to
  bypass that entirely). Forgetting the `company_id` half is the
  multi-tenant equivalent of the RLS bugs above: it fails open, not
  closed, letting one company's manager see another's rows.
