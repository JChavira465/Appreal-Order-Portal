import Link from "next/link";
import { FEATURE_COPY, PLANS, lowestTierWith, type Feature } from "@/lib/plans";

// What a shop sees when they land on something their plan doesn't
// include. Written to describe what they'd get and what it costs, not to
// tell them off for not having it -- this screen's whole job is to be
// the least annoying possible version of a paywall.
export function UpgradeNotice({
  feature,
  isOwner,
}: {
  feature: Feature;
  isOwner: boolean;
}) {
  const copy = FEATURE_COPY[feature];
  const tier = lowestTierWith(feature);
  const plan = PLANS[tier];

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/home" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>

      <div className="mt-6 rounded-xl border border-neutral-200 p-6">
        <div className="text-xs font-bold uppercase tracking-wide text-neutral-400">
          On {plan.name} and up
        </div>
        <h1 className="mt-1 text-lg font-bold text-black">{copy.name}</h1>
        <p className="mt-2 text-sm text-neutral-500">{copy.blurb}</p>

        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm">
          <span className="font-bold text-black">
            ${plan.monthly}
            <span className="font-normal text-neutral-500">/month</span>
          </span>
          <span className="text-neutral-400"> · </span>
          <span className="text-neutral-500">
            ${plan.yearly.toLocaleString()}/year
          </span>
        </div>

        {isOwner ? (
          <Link
            href="/billing"
            className="mt-4 block rounded-lg bg-black px-4 py-3 text-center text-sm font-medium text-white"
          >
            See plans
          </Link>
        ) : (
          <p className="mt-4 text-xs text-neutral-500">
            Ask the account owner to upgrade — they can do it from Plan &amp;
            billing.
          </p>
        )}
      </div>
    </main>
  );
}
