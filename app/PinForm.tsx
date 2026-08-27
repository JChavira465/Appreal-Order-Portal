"use client";

import { useActionState } from "react";
import { setOwnPin, type SetPinResult } from "./pin-actions";

const initialState: SetPinResult = null;

export function PinForm() {
  const [state, formAction, pending] = useActionState(
    setOwnPin,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <p className="text-sm font-medium text-black">Set / change your PIN</p>
      <input
        name="pin"
        type="password"
        inputMode="numeric"
        pattern="\d*"
        maxLength={4}
        required
        placeholder="4-digit PIN"
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
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-50 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save PIN"}
      </button>
    </form>
  );
}
