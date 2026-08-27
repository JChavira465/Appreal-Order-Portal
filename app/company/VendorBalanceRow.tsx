"use client";

import { useActionState, useState } from "react";
import { money } from "@/lib/catalog";
import { recordVendorPayment, type ActionResult } from "./actions";

const initialState: ActionResult = null;

export function VendorBalanceRow({
  vendorId,
  name,
  owed,
  paid,
  balance,
}: {
  vendorId: string;
  name: string;
  owed: number;
  paid: number;
  balance: number;
}) {
  const [state, formAction, pending] = useActionState(recordVendorPayment, initialState);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="border-b border-neutral-100 py-3 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-black">{name}</div>
          <div className="text-xs text-neutral-400">
            Owed {money(owed)} · Paid {money(paid)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="font-mono text-sm font-bold"
            style={{ color: balance > 0 ? "#B42318" : "#15803D" }}
          >
            {money(balance)}
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="text-[11px] font-semibold text-black underline"
          >
            {showForm ? "Cancel" : "Record payment"}
          </button>
        </div>
      </div>
      {showForm && (
        <form action={formAction} className="mt-2 space-y-2">
          <input type="hidden" name="vendorId" value={vendorId} />
          <div className="grid grid-cols-2 gap-2">
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
            />
            <input
              name="note"
              placeholder="Note (optional)"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
            />
          </div>
          {state && !state.ok && <p className="text-xs text-red-600">{state.message}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg border-2 border-neutral-300 py-2 text-xs font-semibold text-black disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save payment"}
          </button>
        </form>
      )}
    </div>
  );
}
