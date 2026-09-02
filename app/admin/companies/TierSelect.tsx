"use client";

import { useState, useTransition } from "react";
import { setCompanyTier } from "./actions";
import { PLANS, TIERS, type Tier } from "@/lib/plans";

export function TierSelect({
  companyId,
  tier,
  billingStatus,
}: {
  companyId: string;
  tier: Tier;
  billingStatus: string;
}) {
  const [current, setCurrent] = useState<Tier>(tier);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: Tier) => {
    const previous = current;
    setCurrent(next);
    setMessage(null);
    startTransition(async () => {
      const result = await setCompanyTier(companyId, next);
      if (!result.ok) {
        setCurrent(previous);
        setMessage(result.message);
      }
    });
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        value={current}
        disabled={pending}
        onChange={(e) => change(e.target.value as Tier)}
        aria-label="Plan"
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-black focus:border-black focus:outline-none focus:ring-1 focus:ring-black disabled:opacity-50"
      >
        {TIERS.map((t) => (
          <option key={t} value={t}>
            {PLANS[t].name} — ${PLANS[t].monthly}/mo
          </option>
        ))}
      </select>

      <span className="text-xs text-neutral-500">{billingStatus}</span>

      {message && <span className="text-xs text-red-600">{message}</span>}
    </div>
  );
}
