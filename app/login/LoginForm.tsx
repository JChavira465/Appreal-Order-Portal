"use client";

import { useActionState } from "react";
import { signIn, type AuthResult } from "./actions";

type StaffMember = { id: string; full_name: string };

const initialState: AuthResult = null;

export function LoginForm({ staff }: { staff: StaffMember[] }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <select
        name="userId"
        required
        defaultValue=""
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
      >
        <option value="" disabled>
          Select your name
        </option>
        {staff.map((person) => (
          <option key={person.id} value={person.id}>
            {person.full_name}
          </option>
        ))}
      </select>

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

      {state && !state.ok && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-4 py-3 text-base font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
