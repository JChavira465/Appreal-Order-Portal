"use client";

import { useActionState } from "react";
import { money } from "@/lib/catalog";
import {
  addPartner,
  updatePartner,
  setPartnerActive,
  type ActionResult,
} from "./actions";

const initialState: ActionResult = null;

export function AddPartnerForm() {
  const [state, formAction, pending] = useActionState(addPartner, initialState);

  return (
    <form action={formAction} className="rounded-xl border border-neutral-200 p-4">
      <p className="mb-3 text-sm font-medium text-black">Add a partner</p>
      <div className="grid grid-cols-2 gap-3">
        <input
          name="name"
          placeholder="e.g. Jay"
          className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
        <input
          name="percent"
          type="number"
          min="0"
          max="100"
          step="0.1"
          placeholder="Percent"
          className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
      </div>
      {state && (
        <p className={`mt-2 text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 w-full rounded-lg border-2 border-neutral-300 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add partner"}
      </button>
    </form>
  );
}

export function PartnerRow({
  id,
  name,
  percent,
  active,
  share,
}: {
  id: string;
  name: string;
  percent: number;
  active: boolean;
  share: number;
}) {
  const [percentState, percentAction, percentPending] = useActionState(
    updatePartner,
    initialState,
  );
  const [activeState, activeAction, activePending] = useActionState(
    setPartnerActive,
    initialState,
  );

  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-neutral-100 py-2 last:border-0"
      style={{ opacity: active ? 1 : 0.5 }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-black">{name}</div>
        <div className="font-mono text-xs text-neutral-400">{money(share)}</div>
      </div>
      <form action={percentAction} className="flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <input
          name="percent"
          type="number"
          min="0"
          max="100"
          step="0.1"
          defaultValue={percent}
          disabled={!active}
          className="w-16 rounded border border-neutral-300 px-2 py-1 text-right font-mono text-sm text-black disabled:opacity-50"
        />
        <span className="text-sm text-neutral-400">%</span>
        <button
          type="submit"
          disabled={percentPending || !active}
          className="text-[11px] font-semibold text-black underline disabled:opacity-50"
        >
          {percentPending ? "…" : "Save"}
        </button>
      </form>
      <form action={activeAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={(!active).toString()} />
        <button
          type="submit"
          disabled={activePending}
          className="rounded-lg border border-neutral-300 px-2 py-1 text-[11px] font-semibold text-neutral-500 disabled:opacity-50"
        >
          {active ? "Remove" : "Restore"}
        </button>
      </form>
      {percentState && !percentState.ok && (
        <p className="text-xs text-red-600">{percentState.message}</p>
      )}
      {activeState && !activeState.ok && (
        <p className="text-xs text-red-600">{activeState.message}</p>
      )}
    </div>
  );
}
