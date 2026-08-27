"use client";

import { useActionState } from "react";
import {
  advanceStatus,
  cancelOrder,
  reopenOrder,
  type ActionResult,
} from "./actions";

const initialState: ActionResult = null;

export function AdvanceButton({
  orderId,
  nextLabel,
}: {
  orderId: string;
  nextLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    advanceStatus,
    initialState,
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-black px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? "…" : `Advance to ${nextLabel}`}
      </button>
      {state && !state.ok && (
        <p className="mt-2 text-sm text-red-600">{state.message}</p>
      )}
    </form>
  );
}

export function CancelButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(cancelOrder, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!confirm("Cancel this order? This can be undone later by reopening it.")) {
            e.preventDefault();
          }
        }}
        className="w-full rounded-xl border-2 border-red-700 py-3 text-sm font-semibold text-red-700 disabled:opacity-50"
      >
        {pending ? "…" : "Cancel order"}
      </button>
      {state && !state.ok && (
        <p className="mt-2 text-sm text-red-600">{state.message}</p>
      )}
    </form>
  );
}

export function ReopenButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(reopenOrder, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl border-2 border-neutral-300 py-3 text-sm font-semibold text-black disabled:opacity-50"
      >
        {pending ? "…" : "Reopen order"}
      </button>
      {state && !state.ok && (
        <p className="mt-2 text-sm text-red-600">{state.message}</p>
      )}
    </form>
  );
}
