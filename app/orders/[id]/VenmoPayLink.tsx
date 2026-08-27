"use client";

import { useState } from "react";
import { venmoPayLink, type VenmoCollector } from "@/lib/venmo";

export function VenmoPayLink({
  amount,
  note,
  collector,
}: {
  amount: number;
  note: string;
  collector: VenmoCollector;
}) {
  const [message, setMessage] = useState("");
  const link = venmoPayLink({ amount, note, username: collector.username });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Copied — text or email it to the customer");
    } catch {
      setMessage("Couldn't copy — long-press the link below instead");
    }
  };

  return (
    <div className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-400">
          Venmo pay link — {collector.name}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-black"
        >
          Copy
        </button>
      </div>
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="block truncate text-xs text-neutral-500 underline"
      >
        {link}
      </a>
      {message && <p className="mt-1 text-xs text-green-700">{message}</p>}
      <p className="mt-1 text-[11px] text-neutral-400">
        Opens Venmo with the balance due filled in for {collector.name} — the
        customer can still edit the amount before sending.
      </p>
    </div>
  );
}
