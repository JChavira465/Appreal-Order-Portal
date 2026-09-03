"use client";

import { useState, useTransition } from "react";
import { setCompanyTrialEnd } from "../actions";

export function TrialDate({
  companyId,
  value,
  expired,
}: {
  companyId: string;
  value: string;
  expired: boolean;
}) {
  const [date, setDate] = useState(value);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (next: string) => {
    setDate(next);
    setMessage(null);
    startTransition(async () => {
      const result = await setCompanyTrialEnd(companyId, next);
      setMessage(result.message);
    });
  };

  const extend = (days: number) => {
    const from = date ? new Date(`${date}T12:00:00Z`) : new Date();
    const base = isNaN(from.getTime()) || from.getTime() < Date.now()
      ? new Date()
      : from;
    base.setUTCDate(base.getUTCDate() + days);
    save(base.toISOString().slice(0, 10));
  };

  return (
    <div className="mt-3 border-t border-neutral-200 pt-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-400">
          Trial ends
        </span>
        {expired && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
            Expired — locked out
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          disabled={pending}
          onChange={(e) => save(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-black focus:border-black focus:outline-none focus:ring-1 focus:ring-black disabled:opacity-50"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => extend(14)}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          +14 days
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => extend(30)}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          +30 days
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => save("")}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Never expires
        </button>
      </div>

      <p className="mt-1.5 text-xs text-neutral-500">
        {date
          ? "Past this date they lose access to everything until they pick a plan. Their data is untouched."
          : "No end date — this trial runs indefinitely."}
      </p>

      {message && <p className="mt-1 text-xs text-neutral-600">{message}</p>}
    </div>
  );
}
