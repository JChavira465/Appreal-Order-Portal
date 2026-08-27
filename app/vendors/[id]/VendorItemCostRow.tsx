"use client";

import { useActionState } from "react";
import { setVendorItemCost, type ActionResult } from "./actions";

const initialState: ActionResult = null;

export function VendorItemCostRow({
  vendorId,
  item,
  unitCost,
}: {
  vendorId: string;
  item: string;
  unitCost: number | null;
}) {
  const [state, formAction, pending] = useActionState(setVendorItemCost, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2 border-b border-neutral-100 py-2 last:border-0">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="item" value={item} />
      <span className="min-w-0 flex-1 truncate text-sm text-black">{item}</span>
      <span className="text-sm text-neutral-400">$</span>
      <input
        name="unitCost"
        type="number"
        min="0"
        step="0.01"
        defaultValue={unitCost ?? ""}
        placeholder="—"
        className="w-20 rounded border border-neutral-300 px-2 py-1 text-right font-mono text-sm text-black"
      />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 text-xs font-semibold text-black underline disabled:opacity-50"
      >
        {pending ? "…" : "Save"}
      </button>
      {state && !state.ok && <p className="text-xs text-red-600">{state.message}</p>}
    </form>
  );
}
