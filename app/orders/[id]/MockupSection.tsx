"use client";

import { useActionState } from "react";
import {
  saveMockup,
  approveMockup,
  requestRevision,
  addReferenceImage,
  type ActionResult,
} from "./actions";

const initialState: ActionResult = null;

export function MockupManagerForm({
  orderId,
  mockupNotes,
}: {
  orderId: string;
  mockupNotes: string;
}) {
  const [state, formAction, pending] = useActionState(saveMockup, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Mockup notes
        </label>
        <input
          name="mockupNotes"
          defaultValue={mockupNotes}
          placeholder="Colorway, proof version…"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Mockup image (optional)
        </label>
        <input
          name="mockupImage"
          type="file"
          accept="image/*"
          className="w-full text-sm text-black file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-black"
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
        className="w-full rounded-lg bg-black px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send mockup to customer"}
      </button>
    </form>
  );
}

export function MockupRepActions({ orderId }: { orderId: string }) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveMockup,
    initialState,
  );
  const [reviseState, reviseAction, revisePending] = useActionState(
    requestRevision,
    initialState,
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-neutral-400">
        Approve or request changes on the customer&apos;s behalf.
      </p>
      <div className="flex gap-2">
        <form action={approveAction} className="flex-1">
          <input type="hidden" name="orderId" value={orderId} />
          <button
            type="submit"
            disabled={approvePending}
            className="w-full rounded-lg border-2 border-green-700 py-2.5 text-sm font-semibold text-green-700 disabled:opacity-50"
          >
            {approvePending ? "…" : "Approve"}
          </button>
        </form>
        <form action={reviseAction} className="flex-1">
          <input type="hidden" name="orderId" value={orderId} />
          <button
            type="submit"
            disabled={revisePending}
            className="w-full rounded-lg border-2 border-red-700 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
          >
            {revisePending ? "…" : "Revise"}
          </button>
        </form>
      </div>
      {approveState && !approveState.ok && (
        <p className="text-sm text-red-600">{approveState.message}</p>
      )}
      {reviseState && !reviseState.ok && (
        <p className="text-sm text-red-600">{reviseState.message}</p>
      )}
    </div>
  );
}

export function AddReferenceImageForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(
    addReferenceImage,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input
        name="referenceImage"
        type="file"
        accept="image/*"
        className="w-full text-sm text-black file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-black"
      />
      {state && (
        <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border-2 border-neutral-300 py-2 text-sm font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add photo"}
      </button>
    </form>
  );
}
