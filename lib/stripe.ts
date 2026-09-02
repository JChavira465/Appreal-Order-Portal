import "server-only";
import Stripe from "stripe";
import type { Tier } from "@/lib/plans";

// Billing is optional infrastructure, exactly like the OpenAI key: the
// whole app runs without it, and every screen that touches Stripe checks
// stripeConfigured() first and explains itself rather than throwing. That
// matters for two reasons -- the build has to pass with placeholder env
// vars, and a company should never hit a stack trace because the person
// running the platform hasn't finished setting up payments yet.
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

// Where Stripe sends people back to after checkout or the billing
// portal. Same reasoning as the magic-link callback (see
// app/login/recovery/actions.ts): read from configuration, never from
// the incoming request's own headers.
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "").replace(/\/+$/, "");
}

// Stripe Price IDs, one per tier per billing period. These are created in
// the Stripe dashboard (or by `npm run stripe:setup`) and pasted into the
// environment -- prices live in Stripe so they can be changed without a
// deploy, and so existing subscribers keep the price they signed up at.
export type BillingPeriod = "monthly" | "yearly";

const PRICE_ENV: Record<Tier, Record<BillingPeriod, string>> = {
  starter: {
    monthly: "STRIPE_PRICE_STARTER_MONTHLY",
    yearly: "STRIPE_PRICE_STARTER_YEARLY",
  },
  pro: {
    monthly: "STRIPE_PRICE_PRO_MONTHLY",
    yearly: "STRIPE_PRICE_PRO_YEARLY",
  },
  unlimited: {
    monthly: "STRIPE_PRICE_UNLIMITED_MONTHLY",
    yearly: "STRIPE_PRICE_UNLIMITED_YEARLY",
  },
};

export function priceIdFor(tier: Tier, period: BillingPeriod): string | null {
  return process.env[PRICE_ENV[tier][period]]?.trim() || null;
}

// The reverse lookup, for the webhook: Stripe tells us which price the
// customer is now on, and we have to turn that back into a tier. Doing
// it from the same env vars means there is exactly one place where a
// price and a tier are associated, rather than a mapping that can drift.
export function tierFromPriceId(
  priceId: string,
): { tier: Tier; period: BillingPeriod } | null {
  for (const tier of Object.keys(PRICE_ENV) as Tier[]) {
    for (const period of ["monthly", "yearly"] as BillingPeriod[]) {
      if (priceIdFor(tier, period) === priceId) return { tier, period };
    }
  }
  return null;
}

/** Which price IDs are actually configured -- drives the setup checklist. */
export function configuredPrices(): { missing: string[]; present: string[] } {
  const missing: string[] = [];
  const present: string[] = [];
  for (const tier of Object.keys(PRICE_ENV) as Tier[]) {
    for (const period of ["monthly", "yearly"] as BillingPeriod[]) {
      const envName = PRICE_ENV[tier][period];
      if (process.env[envName]?.trim()) present.push(envName);
      else missing.push(envName);
    }
  }
  return { missing, present };
}
