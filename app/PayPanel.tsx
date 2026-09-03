"use client";

import { useState } from "react";
import {
  PROVIDER_INFO,
  displayHandle,
  payLink,
  type PayoutAccount,
} from "@/lib/payouts";

// The same block on the rep's order screen and on the customer's public
// tracking page. One component so the two can't drift -- a customer being
// shown a different handle from the one the rep quoted is the kind of
// bug that costs a shop an actual payment.
export function PayPanel({
  accounts,
  amount,
  reference,
  audience,
}: {
  accounts: PayoutAccount[];
  amount: number;
  reference: string;
  /** "customer" is paying; "rep" is sending the details to someone else. */
  audience: "customer" | "rep";
}) {
  const [copied, setCopied] = useState<string | null>(null);

  if (accounts.length === 0 || amount <= 0) return null;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(`${key}:failed`);
    }
  };

  return (
    <div className="mt-5">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-400">
        {audience === "customer" ? "Pay your balance" : "Send payment details"}
      </div>

      <div className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-neutral-500">Balance due</span>
          <span className="font-mono text-lg font-bold text-black">
            ${amount.toFixed(2)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-neutral-200 pt-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              Reference
            </div>
            <div className="truncate font-mono text-sm text-black">{reference}</div>
          </div>
          <button
            type="button"
            onClick={() => copy("ref", reference)}
            className="shrink-0 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-black"
          >
            {copied === "ref" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {accounts.map((account) => {
          const info = PROVIDER_INFO[account.provider];
          const link = payLink(account, amount, reference);
          const handle = displayHandle(account);

          return (
            <div
              key={account.id}
              className="rounded-lg border border-neutral-200 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-black">
                    {info.name}
                  </span>
                  {account.label && (
                    <span className="ml-1.5 text-xs text-neutral-500">
                      {account.label}
                    </span>
                  )}
                  <div className="truncate font-mono text-xs text-neutral-500">
                    {handle}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => copy(account.id, link ?? handle)}
                  className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-black"
                >
                  {copied === account.id ? "Copied" : link ? "Copy link" : "Copy"}
                </button>
              </div>

              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2.5 block rounded-lg bg-black py-2.5 text-center text-sm font-semibold text-white"
                >
                  {audience === "customer"
                    ? `Pay $${amount.toFixed(2)} with ${info.name}`
                    : `Open ${info.name}`}
                </a>
              ) : null}

              <p className="mt-2 text-xs text-neutral-500">{info.instruction}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        {audience === "customer"
          ? "Payments are handled in your own app — this just fills in the details. Your order updates once the shop confirms it."
          : "These open the customer's app with the amount and reference filled in. Record the payment here once it lands."}
      </p>
    </div>
  );
}
