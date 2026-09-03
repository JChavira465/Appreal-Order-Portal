"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addPayoutAccount,
  removePayoutAccount,
  type PayoutResult,
} from "./actions";
import {
  PAYOUT_PROVIDERS,
  PROVIDER_INFO,
  displayHandle,
  type PayoutAccount,
  type PayoutProvider,
} from "@/lib/payouts";

const initialState: PayoutResult = null;

export function PayoutAccounts({
  accounts,
  asCompany,
}: {
  accounts: PayoutAccount[];
  asCompany: string | null;
}) {
  const [state, formAction, pending] = useActionState(addPayoutAccount, initialState);
  const [provider, setProvider] = useState<PayoutProvider>("venmo");
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  const info = PROVIDER_INFO[provider];

  return (
    <div>
      {accounts.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-black">
                  {PROVIDER_INFO[account.provider].name}
                  {account.label && (
                    <span className="ml-1.5 font-normal text-neutral-500">
                      {account.label}
                    </span>
                  )}
                </div>
                <div className="truncate font-mono text-xs text-neutral-500">
                  {displayHandle(account)}
                </div>
              </div>
              <button
                type="button"
                disabled={removing}
                onClick={() => {
                  if (!confirm(`Remove ${PROVIDER_INFO[account.provider].name}? Customers will stop seeing it.`)) return;
                  setRemoveError(null);
                  startRemove(async () => {
                    const result = await removePayoutAccount(account.id, asCompany);
                    if (!result?.ok) setRemoveError(result?.message ?? "Could not remove it.");
                  });
                }}
                className="shrink-0 text-xs text-neutral-400 underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-4 rounded-lg border-2 border-dashed border-neutral-200 p-5 text-center text-sm text-neutral-400">
          Nothing added yet, so customers see no way to pay you.
        </div>
      )}

      {removeError && (
        <p className="mb-3 text-sm text-red-600">{removeError}</p>
      )}

      <form action={formAction} className="space-y-3 border-t border-neutral-200 pt-4">
        {asCompany && <input type="hidden" name="asCompany" value={asCompany} />}

        <div className="grid grid-cols-2 gap-2">
          {PAYOUT_PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                provider === p
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {PROVIDER_INFO[p].name}
            </button>
          ))}
        </div>
        <input type="hidden" name="provider" value={provider} />

        <div>
          <label htmlFor="handle" className="text-sm font-medium text-black">
            {provider === "applecash" || provider === "zelle"
              ? "Phone number or email"
              : "Username"}
          </label>
          <div className="mt-1 flex items-center gap-2">
            {info.prefix && (
              <span className="font-mono text-lg text-neutral-400">{info.prefix}</span>
            )}
            <input
              id="handle"
              name="handle"
              required
              maxLength={120}
              placeholder={info.placeholder}
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>
          <p className="mt-1 text-xs text-neutral-500">{info.instruction}</p>
          {!info.linkable && (
            <p className="mt-1 text-xs text-amber-700">
              {info.name} has no tap-to-pay link, so customers see the details
              and send it from their own app.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="label" className="text-sm font-medium text-black">
            Whose is it? <span className="font-normal text-neutral-400">optional</span>
          </label>
          <input
            id="label"
            name="label"
            maxLength={60}
            placeholder="Alex"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Only needed if more than one person collects.
          </p>
        </div>

        {state && (
          <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Adding…" : `Add ${info.name}`}
        </button>
      </form>
    </div>
  );
}
