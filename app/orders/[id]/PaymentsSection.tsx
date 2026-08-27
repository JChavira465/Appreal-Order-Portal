"use client";

import { useActionState } from "react";
import { recordPayment, applyDiscount, type ActionResult } from "./actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";

const initialState: ActionResult = null;

export function PaymentsManagerForm({
  orderId,
  discount,
}: {
  orderId: string;
  discount: number;
}) {
  const [payState, payAction, payPending] = useActionState(
    recordPayment,
    initialState,
  );
  const [discountState, discountAction, discountPending] = useActionState(
    applyDiscount,
    initialState,
  );

  return (
    <div className="space-y-2">
      <form action={payAction} className="space-y-2">
        <input type="hidden" name="orderId" value={orderId} />
        <div className="grid grid-cols-2 gap-2">
          <input
            name="amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount"
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
          />
          <input
            name="note"
            placeholder="Deposit / final"
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
          />
        </div>
        <select
          name="method"
          defaultValue="cash"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black focus:border-black focus:outline-none"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
        {payState && (
          <p className={`text-sm ${payState.ok ? "text-green-700" : "text-red-600"}`}>
            {payState.message}
          </p>
        )}
        <button
          type="submit"
          disabled={payPending}
          className="w-full rounded-lg border-2 border-neutral-300 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
        >
          {payPending ? "Saving…" : "Record payment"}
        </button>
      </form>

      <form action={discountAction} className="grid grid-cols-2 gap-2 pt-1">
        <input type="hidden" name="orderId" value={orderId} />
        <input
          name="discount"
          type="number"
          min="0"
          step="1"
          defaultValue={discount || ""}
          placeholder="Discount $"
          className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
        <button
          type="submit"
          disabled={discountPending}
          className="rounded-lg border-2 border-neutral-300 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
        >
          {discountPending ? "Saving…" : "Apply discount"}
        </button>
      </form>
      {discountState && !discountState.ok && (
        <p className="text-sm text-red-600">{discountState.message}</p>
      )}
    </div>
  );
}
