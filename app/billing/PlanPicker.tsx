"use client";

import { useState, useTransition } from "react";
import { startCheckout, openBillingPortal } from "./actions";
import {
  FEATURE_COPY,
  PLANS,
  TIERS,
  monthlyEquivalent,
  type Tier,
} from "@/lib/plans";

export function PlanPicker({
  currentTier,
  hasSubscription,
  canManage,
  checkoutEnabled,
}: {
  currentTier: Tier;
  hasSubscription: boolean;
  canManage: boolean;
  checkoutEnabled: boolean;
}) {
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (tier: Tier) => {
    setMessage(null);
    startTransition(async () => {
      const result = await startCheckout(tier, period);
      if (result.ok && result.url) window.location.href = result.url;
      else setMessage(result.message);
    });
  };

  const manage = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await openBillingPortal();
      if (result.ok && result.url) window.location.href = result.url;
      else setMessage(result.message);
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-center gap-1 rounded-lg border border-neutral-200 p-1">
        {(["monthly", "yearly"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              period === p
                ? "bg-black text-white"
                : "text-neutral-500 hover:bg-neutral-50"
            }`}
          >
            {p === "monthly" ? "Monthly" : "Yearly"}
            {p === "yearly" && (
              <span className="ml-1 text-xs opacity-80">2 months free</span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {TIERS.map((tier) => {
          const plan = PLANS[tier];
          const isCurrent = tier === currentTier;
          const price = period === "monthly" ? plan.monthly : plan.yearly;

          return (
            <div
              key={tier}
              className={`rounded-xl border p-4 ${
                isCurrent ? "border-black" : "border-neutral-200"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-black">
                    {plan.name}
                  </span>
                  {isCurrent && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
                      Current
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-bold text-black">
                    ${price.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    {period === "monthly"
                      ? "per month"
                      : `per year · $${monthlyEquivalent(plan)}/mo`}
                  </div>
                </div>
              </div>

              <p className="mt-1 text-sm text-neutral-500">{plan.pitch}</p>

              <ul className="mt-3 space-y-1 text-sm text-neutral-600">
                <li>
                  {plan.seats === null
                    ? "Unlimited staff accounts"
                    : `Up to ${plan.seats} staff accounts`}
                </li>
                <li>Orders, pricing, customers, tracking links, receipts</li>
                {plan.features.map((f) => (
                  <li key={f}>{FEATURE_COPY[f].name}</li>
                ))}
              </ul>

              {canManage && !isCurrent && (
                <button
                  type="button"
                  onClick={() => choose(tier)}
                  disabled={pending || !checkoutEnabled}
                  className="mt-4 w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {pending
                    ? "Opening…"
                    : hasSubscription
                      ? `Switch to ${plan.name}`
                      : `Choose ${plan.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canManage && hasSubscription && (
        <button
          type="button"
          onClick={manage}
          disabled={pending}
          className="mt-4 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50"
        >
          Manage payment method &amp; invoices
        </button>
      )}

      {message && <p className="mt-3 text-sm text-red-600">{message}</p>}

      {!checkoutEnabled && canManage && (
        <p className="mt-3 text-xs text-neutral-500">
          Online checkout isn&apos;t switched on yet. Contact the platform
          admin to get set up.
        </p>
      )}

      {!canManage && (
        <p className="mt-3 text-xs text-neutral-500">
          Only the account owner can change the plan.
        </p>
      )}
    </div>
  );
}
