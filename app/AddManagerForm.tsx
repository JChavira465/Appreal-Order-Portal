"use client";

import { useActionState } from "react";
import { addManager, type AddStaffResult } from "./team-actions";

const initialState: AddStaffResult = null;

export function AddManagerForm() {
  const [state, formAction, pending] = useActionState(
    addManager,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <p className="text-sm font-medium text-black">Add a manager</p>
      <input
        name="fullName"
        type="text"
        required
        placeholder="Full name"
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
      />
      <input
        name="pin"
        type="password"
        inputMode="numeric"
        pattern="\d*"
        maxLength={4}
        required
        placeholder="Initial 4-digit PIN"
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
      />
      {state && (
        <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-4 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add manager"}
      </button>
    </form>
  );
}
