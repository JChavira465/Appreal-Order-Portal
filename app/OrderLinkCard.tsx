"use client";

import { useState, useTransition } from "react";
import { ensureOrderLink } from "./order-link-actions";

export function OrderLinkCard({ initialToken }: { initialToken: string | null }) {
  const [token, setToken] = useState(initialToken);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const link = token
    ? `${typeof window === "undefined" ? "" : window.location.origin}/order/${token}`
    : null;

  const create = () => {
    startTransition(async () => {
      const result = await ensureOrderLink();
      if (result.ok && result.token) setToken(result.token);
      else setMessage(result.message);
    });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Copied — text or email it to your customer");
    } catch {
      setMessage("Couldn't copy — long-press the link to copy it");
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 px-6 py-6 text-left">
      <p className="text-sm font-medium text-black">Customer order link</p>
      <p className="mt-1 text-xs text-neutral-500">
        Send this to a customer and they can fill out their own order. It comes
        back to you with your name on it.
      </p>

      {link ? (
        <>
          <div className="mt-3 flex items-center gap-2">
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-xs text-neutral-500 underline"
            >
              {link}
            </a>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-black"
            >
              Copy
            </button>
          </div>
          {message && <p className="mt-2 text-xs text-green-700">{message}</p>}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="mt-3 w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create my link"}
          </button>
          {message && <p className="mt-2 text-xs text-red-600">{message}</p>}
        </>
      )}
    </div>
  );
}
