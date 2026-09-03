"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signUpCompany, type SignupResult } from "./actions";
import { TRIAL_DAYS } from "@/lib/plans";

const initialState: SignupResult = null;

const FIELD =
  "w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpCompany, initialState);
  const router = useRouter();

  // The action signs them in before returning, so the only thing left is
  // to put them somewhere useful. Done here rather than with redirect()
  // in the action so the success state can render first.
  useEffect(() => {
    if (state?.ok) router.push("/");
  }, [state?.ok, router]);

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-sm font-semibold text-green-800">
          Your shop is ready — taking you in…
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="companyName" className="text-sm font-medium text-black">
          Shop name
        </label>
        <input
          id="companyName"
          name="companyName"
          required
          maxLength={120}
          placeholder="Strikeout Nation Apparel"
          className={`mt-1 ${FIELD}`}
        />
      </div>

      <div>
        <label htmlFor="ownerName" className="text-sm font-medium text-black">
          Your name
        </label>
        <input
          id="ownerName"
          name="ownerName"
          required
          maxLength={120}
          autoComplete="name"
          placeholder="Alex Rivera"
          className={`mt-1 ${FIELD}`}
        />
      </div>

      <div>
        <label htmlFor="email" className="text-sm font-medium text-black">
          Email
        </label>
        <p className="mb-1 mt-0.5 text-xs text-neutral-500">
          Where we send your sign-in link. You won&apos;t use it to log in.
        </p>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@yourshop.com"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="pin" className="text-sm font-medium text-black">
          Pick a 4-digit PIN
        </label>
        <p className="mb-1 mt-0.5 text-xs text-neutral-500">
          This is how you sign in. Your team gets their own.
        </p>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={4}
          required
          placeholder="••••"
          className={FIELD}
        />
      </div>

      {state && !state.ok && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-4 py-3.5 text-base font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Setting up your shop…" : "Start free trial"}
      </button>

      <p className="text-center text-xs text-neutral-500">
        {TRIAL_DAYS} days free. No card needed.
      </p>
    </form>
  );
}
