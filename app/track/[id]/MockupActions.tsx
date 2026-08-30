"use client";

import { useActionState } from "react";
import { customerApproveMockup, customerRequestRevision, type TrackActionResult } from "./actions";

const initialState: TrackActionResult = null;

export function MockupActions({ orderId }: { orderId: string }) {
  const [approveState, approveAction, approvePending] = useActionState(
    customerApproveMockup,
    initialState,
  );
  const [reviseState, reviseAction, revisePending] = useActionState(
    customerRequestRevision,
    initialState,
  );

  const done = approveState?.ok || reviseState?.ok;
  if (done) {
    return (
      <p className="mt-3 text-center text-sm font-semibold text-green-700">
        {approveState?.message ?? reviseState?.message}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-center text-xs text-neutral-400">
        Happy with this? Let the shop know.
      </p>
      <div className="flex gap-2">
        <form action={approveAction} className="flex-1">
          <input type="hidden" name="orderId" value={orderId} />
          <button
            type="submit"
            disabled={approvePending || revisePending}
            className="w-full rounded-lg border-2 border-green-700 py-2.5 text-sm font-semibold text-green-700 disabled:opacity-50"
          >
            {approvePending ? "…" : "Approve"}
          </button>
        </form>
        <form action={reviseAction} className="flex-1">
          <input type="hidden" name="orderId" value={orderId} />
          <button
            type="submit"
            disabled={approvePending || revisePending}
            className="w-full rounded-lg border-2 border-red-700 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
          >
            {revisePending ? "…" : "Request changes"}
          </button>
        </form>
      </div>
      {approveState && !approveState.ok && (
        <p className="mt-2 text-center text-xs text-red-600">{approveState.message}</p>
      )}
      {reviseState && !reviseState.ok && (
        <p className="mt-2 text-center text-xs text-red-600">{reviseState.message}</p>
      )}
    </div>
  );
}
