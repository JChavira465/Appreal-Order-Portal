"use client";

import { useActionState } from "react";
import { addVendor, type ActionResult } from "./actions";

const initialState: ActionResult = null;

export function AddVendorForm() {
  const [state, formAction, pending] = useActionState(addVendor, initialState);

  return (
    <form action={formAction} className="rounded-xl border border-neutral-200 p-4">
      <p className="mb-3 text-sm font-medium text-black">Add a vendor</p>
      <div className="grid grid-cols-2 gap-3">
        <input
          name="name"
          placeholder="e.g. Ace Hat Co."
          className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
        <select
          name="kind"
          defaultValue="apparel"
          className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black focus:border-black focus:outline-none"
        >
          <option value="apparel">Apparel manufacturer</option>
          <option value="hat">Hat vendor</option>
        </select>
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
        {pending ? "Adding…" : "Add vendor"}
      </button>
    </form>
  );
}
