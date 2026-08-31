"use client";

import Link from "next/link";
import { useActionState } from "react";
import { adminSignIn, type AdminSignInResult } from "./actions";

const initialState: AdminSignInResult = null;

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(
    adminSignIn,
    initialState,
  );

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-script mb-1 text-center text-5xl leading-tight text-black">
          Order Desk
        </h1>
        <p className="mb-10 text-center text-sm text-neutral-500">
          Platform admin sign-in
        </p>

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
              placeholder="you@example.com"
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>

          <div>
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Password"
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
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-neutral-400">
          This is the platform admin&apos;s own sign-in, separate from any
          company&apos;s staff login.
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
