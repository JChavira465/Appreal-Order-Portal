"use client";

import { useActionState } from "react";
import { createCompany, type CreateCompanyResult } from "./actions";

const initialState: CreateCompanyResult = null;

export function CreateCompanyForm() {
  const [state, formAction, pending] = useActionState(
    createCompany,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">
          Company name
        </label>
        <input
          name="companyName"
          type="text"
          required
          placeholder="Acme Apparel"
          className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">
          Sign-in slug (leave blank to generate from the name)
        </label>
        <input
          name="slug"
          type="text"
          placeholder="acme"
          className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">
          Owner&apos;s full name
        </label>
        <input
          name="ownerName"
          type="text"
          required
          placeholder="Full name"
          className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">
          Owner&apos;s initial 4-digit PIN
        </label>
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={4}
          required
          placeholder="1234"
          className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        />
      <input
        name="ownerEmail"
        type="email"
        placeholder="Owner's email (optional — for notifications)"
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
      />
      </div>

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
        {pending ? "Creating…" : "Create company"}
      </button>
    </form>
  );
}
