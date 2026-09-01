"use client";

import { useActionState } from "react";
import { addPriceItem, type ActionResult } from "./actions";
import { SIZE_GROUPS, SIZE_GROUP_LABELS } from "@/lib/sizes";

const initialState: ActionResult = null;

export function AddPriceItemForm({ asCompany }: { asCompany: string | null }) {
  const [state, formAction, pending] = useActionState(addPriceItem, initialState);

  return (
    <form action={formAction} className="rounded-xl border border-neutral-200 p-4">
      {asCompany && <input type="hidden" name="asCompany" value={asCompany} />}
      <p className="mb-3 text-sm font-medium text-black">Add a new item</p>
      <div className="grid grid-cols-2 gap-3">
        <input
          name="name"
          placeholder="e.g. Compression Sleeve"
          className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
        <input
          name="basePrice"
          type="number"
          min="0"
          step="0.5"
          placeholder="Base price"
          className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Size group
          </label>
          <select
            name="sizeGroup"
            defaultValue="one_size"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black focus:border-black focus:outline-none"
          >
            {SIZE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {SIZE_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Category
          </label>
          <input
            name="category"
            list="category-suggestions"
            placeholder="e.g. JERSEY"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
          />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-black">
        <input type="checkbox" name="isHeadwear" />
        Headwear (applies the 10-unit minimum warning)
      </label>
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
        {pending ? "Adding…" : "Add item"}
      </button>
    </form>
  );
}
