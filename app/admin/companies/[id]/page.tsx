import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  BILLING_STATUS_COPY,
  FEATURES,
  PLANS,
  isBillingStatus,
  isFeature,
  isTier,
  trialHasExpired,
  type BillingStatus,
  type Feature,
} from "@/lib/plans";
import { TierSelect } from "../TierSelect";
import { FeatureToggle } from "./FeatureToggle";
import { TrialDate } from "./TrialDate";

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

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("platform_admin")
        .eq("id", user.id)
        .single()
    : { data: null };

  if (profile?.platform_admin !== true) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Only the platform admin can manage companies.
        </div>
      </main>
    );
  }

  const [{ data: company }, { data: overrideRows }, { count: staffCount }] =
    await Promise.all([
      supabase
        .from("companies")
        .select(
          `id, name, slug, active, tier, billing_status, billing_period,
           trial_ends_at, current_period_end, stripe_subscription_id`,
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("company_features")
        .select("feature, enabled, note")
        .eq("company_id", id),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", id)
        .eq("active", true),
    ]);

  if (!company) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/admin/companies" className="text-xs text-neutral-400 underline">
          ← Companies
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Company not found.
        </div>
      </main>
    );
  }

  const tier = isTier(company.tier) ? company.tier : "starter";
  const plan = PLANS[tier];
  const billingLabel = isBillingStatus(company.billing_status)
    ? BILLING_STATUS_COPY[company.billing_status]
    : "Free trial";

  const overrides = new Map<Feature, { enabled: boolean; note: string }>();
  for (const row of overrideRows ?? []) {
    if (isFeature(row.feature)) {
      overrides.set(row.feature, {
        enabled: row.enabled,
        note: row.note ?? "",
      });
    }
  }

  const trialExpired =
    isBillingStatus(company.billing_status) &&
    trialHasExpired(
      company.billing_status as BillingStatus,
      company.trial_ends_at ?? null,
    );

  const seatsUsed = staffCount ?? 0;
  const overSeats = plan.seats !== null && seatsUsed > plan.seats;

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/admin/companies" className="text-xs text-neutral-400 underline">
        ← Companies
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-lg font-bold text-black">{company.name}</h1>
        {!company.active && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Suspended
          </span>
        )}
      </div>
      <p className="mb-5 font-mono text-xs text-neutral-500">
        /login?company={company.slug}
      </p>

      {/* ---- What they're on ---- */}
      <div className="rounded-xl border border-neutral-200 p-4">
        <h2 className="text-sm font-bold text-black">Plan</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          What they pay for. Changing this changes what they can use, never
          what they&apos;re charged — Stripe is the only thing that moves
          money.
        </p>

        <TierSelect companyId={company.id} tier={tier} billingStatus={billingLabel} />

        <dl className="mt-4 space-y-1.5 border-t border-neutral-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">List price</dt>
            <dd className="font-mono text-black">
              ${plan.monthly}/mo · ${plan.yearly.toLocaleString()}/yr
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Billing</dt>
            <dd className="text-black">
              {billingLabel}
              {company.billing_period ? ` · ${company.billing_period}` : ""}
            </dd>
          </div>
          {company.current_period_end && (
            <div className="flex justify-between">
              <dt className="text-neutral-500">Renews</dt>
              <dd className="text-black">{fmtDate(company.current_period_end)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-neutral-500">Staff</dt>
            <dd className={overSeats ? "font-semibold text-amber-700" : "text-black"}>
              {seatsUsed} of {plan.seats === null ? "unlimited" : plan.seats}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Stripe</dt>
            <dd className="text-black">
              {company.stripe_subscription_id ? "Connected" : "Not connected"}
            </dd>
          </div>
        </dl>

        {company.billing_status === "trialing" && (
          <TrialDate
            companyId={company.id}
            value={
              company.trial_ends_at
                ? new Date(company.trial_ends_at).toISOString().slice(0, 10)
                : ""
            }
            expired={trialExpired}
          />
        )}

        {overSeats && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            They have more active staff than this plan allows. Nobody is
            locked out — existing accounts keep working — but they can&apos;t
            add anyone new until they upgrade or deactivate someone.
          </p>
        )}
      </div>

      {/* ---- Feature overrides ---- */}
      <div className="mt-6 rounded-xl border border-neutral-200 p-4">
        <h2 className="text-sm font-bold text-black">Features</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Each one follows the plan unless you override it here. Use this for
          the deals that don&apos;t fit three boxes — comping a beta tester,
          letting someone try a feature before upgrading, or pulling
          something without changing what they pay.
        </p>

        <div className="mt-2">
          {FEATURES.map((feature) => {
            const override = overrides.get(feature);
            return (
              <FeatureToggle
                key={feature}
                companyId={company.id}
                feature={feature}
                tier={tier}
                initialState={
                  override === undefined
                    ? "default"
                    : override.enabled
                      ? "on"
                      : "off"
                }
                initialNote={override?.note ?? ""}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex gap-3 text-sm">
        <Link href={`/pricing?company=${company.slug}`} className="text-black underline">
          Their pricing
        </Link>
        <Link href={`/orders?company=${company.slug}`} className="text-black underline">
          Their orders
        </Link>
        <a href={`/admin/backup?company=${company.slug}`} className="text-black underline">
          Back up
        </a>
      </div>
    </main>
  );
}
