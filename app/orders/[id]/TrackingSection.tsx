"use client";

import { useActionState } from "react";
import {
  addTrackingNumber,
  removeTrackingNumber,
  type ActionResult,
} from "./actions";
import { CARRIER_LABELS, CARRIERS, trackingUrl, type Carrier } from "@/lib/tracking";

const initialState: ActionResult = null;

export function TrackingList({
  orderId,
  entries,
  canManage,
}: {
  orderId: string;
  entries: { id: string; carrier: Carrier; trackingNumber: string }[];
  canManage: boolean;
}) {
  const [removeState, removeAction, removePending] = useActionState(
    removeTrackingNumber,
    initialState,
  );

  if (entries.length === 0) {
    return <p className="text-sm text-neutral-400">No tracking numbers yet.</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const url = trackingUrl(entry.carrier, entry.trackingNumber);
        return (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                {CARRIER_LABELS[entry.carrier]}
              </div>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-sm font-semibold text-black underline"
                >
                  {entry.trackingNumber}
                </a>
              ) : (
                <span className="break-all text-sm font-semibold text-black">
                  {entry.trackingNumber}
                </span>
              )}
            </div>
            {canManage && (
              <form action={removeAction} className="shrink-0">
                <input type="hidden" name="orderId" value={orderId} />
                <input type="hidden" name="id" value={entry.id} />
                <button
                  type="submit"
                  disabled={removePending}
                  className="text-xs text-neutral-400 underline"
                >
                  Remove
                </button>
              </form>
            )}
          </div>
        );
      })}
      {removeState && !removeState.ok && (
        <p className="text-sm text-red-600">{removeState.message}</p>
      )}
    </div>
  );
}

export function TrackingManagerForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(addTrackingNumber, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid grid-cols-3 gap-2">
        <select
          name="carrier"
          defaultValue="auto"
          className="rounded-lg border border-neutral-300 px-2 py-2.5 text-sm text-black focus:border-black focus:outline-none"
        >
          <option value="auto">Auto-detect</option>
          {CARRIERS.map((c) => (
            <option key={c} value={c}>
              {CARRIER_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          name="trackingNumber"
          placeholder="Tracking number"
          className="col-span-2 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
      </div>
      {state && (
        <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border-2 border-neutral-300 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add tracking number"}
      </button>
    </form>
  );
}
