import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCompanyPlan } from "@/lib/companyPlan";
import { stripeConfigured, priceIdFor, siteUrl } from "@/lib/stripe";
import { BILLING_STATUS_COPY, PLANS, TIERS } from "@/lib/plans";
import { PlanPicker } from "./PlanPicker";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Not signed in.
        </div>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id, platform_admin")
    .eq("id", user.id)
    .single();

  if (profile?.platform_admin === true) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
          You don&apos;t have a subscription — you run the platform. Set a
          company&apos;s plan from{" "}
          <Link href="/admin/companies" className="text-black underline">
            Companies
          </Link>
          .
        </div>
      </main>
    );
  }

  const companyId = profile?.company_id as string | null;
  if (!companyId) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Your account isn&apos;t assigned to a company yet.
        </div>
      </main>
    );
  }

  const [{ data: company }, plan] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).single(),
    loadCompanyPlan(supabase, companyId),
  ]);

  const current = PLANS[plan.tier];
  const isOwner = profile?.role === "super_admin";
  const trialDaysLeft =
    plan.billingStatus === "trialing" ? daysUntil(plan.trialEndsAt) : null;

  // Checkout only works once the platform admin has both a Stripe key
  // and a price for every tier -- a half-configured setup that renders
  // buttons which fail on click is worse than buttons that say why.
  // siteUrl() belongs in this check as much as the keys and prices do:
  // Checkout can't be created without somewhere to send the customer
  // back to, so leaving it out meant the buttons rendered enabled and
  // then failed on click with a message the person clicking can do
  // nothing about. A control that looks ready and isn't is worse than
  // one that's plainly switched off.
  const checkoutEnabled =
    stripeConfigured() &&
    Boolean(siteUrl()) &&
    TIERS.every(
      (t) => priceIdFor(t, "monthly") && priceIdFor(t, "yearly"),
    );

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>

      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Plan &amp; billing</h1>
      <p className="mb-5 text-sm text-neutral-500">
        {company?.name ?? "Your shop"}
      </p>

      <div className="rounded-xl border border-neutral-200 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-400">
              Current plan
            </div>
            <div className="mt-0.5 text-xl font-bold text-black">
              {current.name}
            </div>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background:
                plan.billingStatus === "past_due"
                  ? "#FEF2F2"
                  : plan.billingStatus === "canceled"
                    ? "#F5F5F5"
                    : "#F0FDF4",
              color:
                plan.billingStatus === "past_due"
                  ? "#B42318"
                  : plan.billingStatus === "canceled"
                    ? "#525252"
                    : "#15803D",
            }}
          >
            {BILLING_STATUS_COPY[plan.billingStatus]}
          </span>
        </div>

        <dl className="mt-4 space-y-1.5 border-t border-neutral-200 pt-3 text-sm">
          {plan.billingPeriod && (
            <div className="flex justify-between">
              <dt className="text-neutral-500">Billed</dt>
              <dd className="text-black">
                {plan.billingPeriod === "yearly" ? "Yearly" : "Monthly"}
              </dd>
            </div>
          )}
          {plan.currentPeriodEnd && plan.billingStatus !== "canceled" && (
            <div className="flex justify-between">
              <dt className="text-neutral-500">Renews</dt>
              <dd className="text-black">{fmtDate(plan.currentPeriodEnd)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-neutral-500">Staff accounts</dt>
            <dd className="text-black">
              {current.seats === null ? "Unlimited" : `Up to ${current.seats}`}
            </dd>
          </div>
        </dl>

        {trialDaysLeft !== null && (
          <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
            {trialDaysLeft > 0
              ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial.`
              : "Your free trial has ended — pick a plan to keep going."}
          </p>
        )}

        {plan.billingStatus === "past_due" && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            Your last payment didn&apos;t go through. Everything still works
            for now — update your card to avoid losing access.
          </p>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold text-black">Plans</h2>
      <PlanPicker
        currentTier={plan.tier}
        hasSubscription={Boolean(plan.stripeSubscriptionId)}
        canManage={isOwner}
        checkoutEnabled={checkoutEnabled}
      />

      <p className="mt-6 text-center text-xs text-neutral-400">
        Prices in USD. Cancel any time — you keep access until the end of the
        period you&apos;ve paid for.
      </p>
    </main>
  );
}
