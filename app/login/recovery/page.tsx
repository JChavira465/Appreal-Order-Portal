"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendMagicLink, type SendMagicLinkResult } from "./actions";

const initialState: SendMagicLinkResult | null = null;

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    sendMagicLink,
    initialState,
  );

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-script mb-1 text-center text-5xl leading-tight text-black">
          Apparel Logic
        </h1>
        <p className="mb-10 text-center text-sm text-neutral-500">
          Account recovery
        </p>

        {state?.ok ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-center text-sm text-green-800">
            {state.message}
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@company.com"
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            {state && !state.ok && (
              <p className="text-sm text-red-600">{state.message}</p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-black px-4 py-3 text-base font-medium text-white transition-opacity disabled:opacity-50"
            >
              {pending ? "Sending link…" : "Email me a sign-in link"}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-neutral-400">
          Use this only if you&apos;re locked out of your PIN. We&apos;ll email
          you a link to sign in and set a new one.
        </p>
        <p className="mt-2 text-center text-xs">
          <Link href="/login" className="text-neutral-400 underline">
            Back to regular sign-in
          </Link>
        </p>
      </div>
    </main>
  );
}
