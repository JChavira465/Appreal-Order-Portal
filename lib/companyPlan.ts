import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  type BillingStatus,
  type Feature,
  type Tier,
  isBillingStatus,
  isTier,
  planHasFeature,
  statusIsEntitled,
} from "@/lib/plans";

export type CompanyPlan = {
  tier: Tier;
  billingStatus: BillingStatus;
  billingPeriod: "monthly" | "yearly" | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** True for the platform admin, who is entitled to everything everywhere. */
  isPlatformAdmin: boolean;
};

// Falls back to the cheapest plan rather than the most generous one. If
// this row can't be read for any reason, the safe failure is "you have
// the least", not "you have everything" -- and the database's own
// has_feature() is the real gate underneath either way, so a wrong guess
// here shows the wrong screen, it never hands out data.
const FALLBACK: CompanyPlan = {
  tier: "starter",
  billingStatus: "trialing",
  billingPeriod: null,
  trialEndsAt: null,
  currentPeriodEnd: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  isPlatformAdmin: false,
};

export async function loadCompanyPlan(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CompanyPlan> {
  if (!companyId) return FALLBACK;

  const { data, error } = await supabase
    .from("companies")
    .select(
      `tier, billing_status, billing_period, trial_ends_at,
       current_period_end, stripe_customer_id, stripe_subscription_id`,
    )
    .eq("id", companyId)
    .maybeSingle();

  // Per CLAUDE.md: never silently swallow an error on a query whose data
  // drives access. An unrun 0037 means every one of these columns is
  // missing, and without this line that arrives as "every shop is
  // suddenly on Starter" with nothing to explain it.
  if (error) console.error("loadCompanyPlan: query failed", error);

  if (!data) return FALLBACK;

  return {
    tier: isTier(data.tier) ? data.tier : "starter",
    billingStatus: isBillingStatus(data.billing_status)
      ? data.billing_status
      : "trialing",
    billingPeriod:
      data.billing_period === "monthly" || data.billing_period === "yearly"
        ? data.billing_period
        : null,
    trialEndsAt: data.trial_ends_at ?? null,
    currentPeriodEnd: data.current_period_end ?? null,
    stripeCustomerId: data.stripe_customer_id ?? null,
    stripeSubscriptionId: data.stripe_subscription_id ?? null,
    isPlatformAdmin: false,
  };
}

export function planAllows(plan: CompanyPlan, feature: Feature): boolean {
  if (plan.isPlatformAdmin) return true;
  if (!statusIsEntitled(plan.billingStatus)) return false;
  return planHasFeature(plan.tier, feature);
}

export type FeatureContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  companyId: string;
  plan: CompanyPlan;
  allowed: boolean;
};

// The signed-in user's own company and plan, for a page or action that
// needs to know whether a feature is unlocked. Deliberately separate
// from requireManagerContext (which answers "who are you allowed to act
// as") -- role and plan are different questions, and a page usually
// needs both.
export async function loadOwnPlan(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  companyId: string | null;
  plan: CompanyPlan;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("company_id, platform_admin")
    .eq("id", user.id)
    .single();

  if (error) console.error("loadOwnPlan: profile query failed", error);

  if (profile?.platform_admin === true) {
    return {
      supabase,
      companyId: null,
      plan: { ...FALLBACK, tier: "unlimited", isPlatformAdmin: true },
    };
  }

  const companyId = profile?.company_id ?? null;
  if (!companyId) return { supabase, companyId: null, plan: FALLBACK };

  return {
    supabase,
    companyId,
    plan: await loadCompanyPlan(supabase, companyId),
  };
}

// Gate for a server action. Returns null when the caller's plan doesn't
// include the feature, so the action can bail with a clear message
// instead of relying on an RLS denial that surfaces as an empty result.
export async function requireFeature(
  feature: Feature,
): Promise<FeatureContext | null> {
  const own = await loadOwnPlan();
  if (!own) return null;
  if (!planAllows(own.plan, feature)) return null;
  return {
    supabase: own.supabase,
    companyId: own.companyId ?? "",
    plan: own.plan,
    allowed: true,
  };
}
