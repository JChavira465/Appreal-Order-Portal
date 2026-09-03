"use client";

import { useActionState, useState } from "react";
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

  const [asking, setAsking] = useState(false);

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

      {/* Shown only after "Request changes" is pressed, so approving
          stays a single tap and the box only appears for the person who
          actually has something to say. */}
      {asking && (
        <form action={reviseAction} className="mb-3">
          <input type="hidden" name="orderId" value={orderId} />
          <label htmlFor="reason" className="text-xs font-medium text-black">
            What would you like changed?
          </label>
          <textarea
            id="reason"
            name="reason"
            rows={3}
            maxLength={1000}
            autoFocus
            placeholder="e.g. can the number on the back be bigger, and try navy instead of royal"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={revisePending}
              className="flex-1 rounded-lg bg-red-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {revisePending ? "Sending…" : "Send request"}
            </button>
          </div>
          <p className="mt-1.5 text-center text-xs text-neutral-400">
            You can send it without a note if you&apos;d rather explain
            another way.
          </p>
        </form>
      )}

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
        <button
          type="button"
          onClick={() => setAsking(true)}
          disabled={approvePending || revisePending || asking}
          className="flex-1 rounded-lg border-2 border-red-700 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
        >
          Request changes
        </button>
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
