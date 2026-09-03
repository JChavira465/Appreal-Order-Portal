// The three subscription tiers, and which features each one unlocks.
//
// IMPORTANT: this table is mirrored in SQL by has_feature() /
// tier_seat_limit() in supabase/migrations/0037_plans_and_billing.sql.
// The database copy is the one that actually stops a determined company
// from reaching a feature they haven't paid for (the anon key is public,
// so PostgREST is reachable without going through any of this code); the
// copy here is what the app reads to draw screens and decide what to
// show. Change one and you must change the other, or a company sees an
// upgrade prompt for something the database would happily have given
// them, or worse, the reverse.

export type Tier = "starter" | "pro" | "unlimited";

export const TIERS: Tier[] = ["starter", "pro", "unlimited"];

export function isTier(value: string): value is Tier {
  return (TIERS as string[]).includes(value);
}

// Every gated capability in the app. Anything not listed here is core and
// available on every plan: taking orders, pricing, customers, staff PINs,
// public tracking links, receipts, shop info, and the Report Issue button.
export type Feature =
  | "costs" // vendors, per-line cost entry, profit reporting
  | "customer_links" // the link a rep sends a customer to self-serve an order
  | "roster_templates" // saved team rosters that prefill an order
  | "hats" // the hat-order screen
  | "financials" // partner splits and vendor payments
  | "ai_concepts"; // AI-generated concept images

export const FEATURES: Feature[] = [
  "costs",
  "customer_links",
  "roster_templates",
  "hats",
  "financials",
  "ai_concepts",
];

export function isFeature(value: string): value is Feature {
  return (FEATURES as string[]).includes(value);
}

export type Plan = {
  tier: Tier;
  name: string;
  /** Price in whole dollars per month, billed monthly. */
  monthly: number;
  /** Price in whole dollars per year. Two months free vs. paying monthly. */
  yearly: number;
  /** Max staff accounts, or null for no limit. */
  seats: number | null;
  /** One line, written for the shop owner deciding between plans. */
  pitch: string;
  features: Feature[];
};

// Yearly is 10x monthly across the board -- "two months free" is easy to
// say out loud and easy for a shop owner to check, which matters more
// than squeezing out a percentage point.
export const PLANS: Record<Tier, Plan> = {
  starter: {
    tier: "starter",
    name: "Starter",
    monthly: 99,
    yearly: 990,
    seats: 3,
    pitch: "One shop, a couple of people, taking orders properly instead of on paper.",
    features: [],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    monthly: 199,
    yearly: 1990,
    seats: 10,
    pitch: "A real team, tracking what each order actually costs and letting customers order themselves.",
    features: ["costs", "customer_links", "roster_templates", "hats"],
  },
  unlimited: {
    tier: "unlimited",
    name: "Unlimited",
    monthly: 299,
    yearly: 2990,
    seats: null,
    pitch: "Everything, no seat limit, with partner splits and AI design concepts.",
    features: [
      "costs",
      "customer_links",
      "roster_templates",
      "hats",
      "financials",
      "ai_concepts",
    ],
  },
};

// What each gated feature is called on screen, and the short line shown
// when a shop lands on something their plan doesn't include. Written to
// tell them what they'd get, not to scold them for not having it.
export const FEATURE_COPY: Record<Feature, { name: string; blurb: string }> = {
  costs: {
    name: "Cost tracking & profit reports",
    blurb:
      "Record what each order costs you from your vendors, and see profit per order instead of just revenue.",
  },
  customer_links: {
    name: "Customer order links",
    blurb:
      "Send a customer their own link and let them fill out the order themselves. It comes back to your queue with your rep's name on it.",
  },
  roster_templates: {
    name: "Saved rosters",
    blurb:
      "Save a team's roster once and prefill it on every future order instead of retyping names and numbers.",
  },
  hats: {
    name: "Hat orders",
    blurb: "A dedicated screen for hat lines, with their own vendors and sizing.",
  },
  financials: {
    name: "Partner splits & vendor payments",
    blurb:
      "Track what each partner is owed and what you've paid each vendor, all in one place.",
  },
  ai_concepts: {
    name: "AI design concepts",
    blurb:
      "Generate concept artwork from a written description while you're on the phone with a customer.",
  },
};

export function planHasFeature(tier: Tier, feature: Feature): boolean {
  return PLANS[tier].features.includes(feature);
}

/** The cheapest plan that includes this feature -- what an upgrade prompt points at. */
export function lowestTierWith(feature: Feature): Tier {
  return TIERS.find((t) => planHasFeature(t, feature)) ?? "unlimited";
}

export function seatLimit(tier: Tier): number | null {
  return PLANS[tier].seats;
}

export function monthlyEquivalent(plan: Plan): number {
  return Math.round(plan.yearly / 12);
}

// ---------------------------------------------------------------------
// Billing status
// ---------------------------------------------------------------------

// Mirrors the states Stripe reports on a subscription, narrowed to the
// ones that change what a shop can do.
export type BillingStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export const BILLING_STATUS_COPY: Record<BillingStatus, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  canceled: "Canceled",
};

export function isBillingStatus(value: string): value is BillingStatus {
  return ["trialing", "active", "past_due", "canceled"].includes(value);
}

// past_due deliberately still counts as entitled. A failed card is
// usually an expired card, not a shop that decided to leave, and locking
// someone out of their own order history mid-season over a $99 charge
// costs far more goodwill than the week it takes Stripe to retry. The
// webhook flips them to canceled (which does lock out, through the
// existing suspension lever) only once Stripe gives up entirely.
export function statusIsEntitled(status: BillingStatus): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}

// Mirrors company_is_entitled() in 0039. A trial that has run out is no
// longer entitled to anything; a null end date never expires, because
// the safe failure on missing data is "keeps working" -- wrongly locking
// out a paying customer is a far worse outcome than a trial running long.
export function isEntitled(
  status: BillingStatus,
  trialEndsAt: string | null,
): boolean {
  if (status === "active" || status === "past_due") return true;
  if (status !== "trialing") return false;
  if (!trialEndsAt) return true;
  const ends = new Date(trialEndsAt);
  return isNaN(ends.getTime()) || ends.getTime() > Date.now();
}

export function trialHasExpired(
  status: BillingStatus,
  trialEndsAt: string | null,
): boolean {
  return status === "trialing" && !isEntitled(status, trialEndsAt);
}

export const TRIAL_DAYS = 14;
