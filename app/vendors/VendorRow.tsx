"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setVendorActive, type ActionResult } from "./actions";

const initialState: ActionResult = null;

const KIND_LABEL: Record<string, string> = {
  apparel: "Apparel manufacturer",
  hat: "Hat vendor",
};

export function VendorRow({
  id,
  name,
  kind,
  active,
}: {
  id: string;
  name: string;
  kind: string;
  active: boolean;
}) {
  const [state, formAction, pending] = useActionState(setVendorActive, initialState);

  return (
    <li className="flex items-center justify-between gap-2 border-b border-neutral-100 py-2 last:border-0">
      <Link
        href={`/vendors/${id}`}
        className="min-w-0 flex-1"
        style={{ opacity: active ? 1 : 0.5 }}
      >
        <div className="truncate text-sm text-black underline">{name}</div>
        <div className="text-[10px] uppercase tracking-wide text-neutral-400">
          {KIND_LABEL[kind] ?? kind}
          {!active && (
            <span className="ml-2 font-bold text-red-600">Removed</span>
          )}
        </div>
      </Link>
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={(!active).toString()} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-500 disabled:opacity-50"
        >
          {active ? "Remove" : "Restore"}
        </button>
      </form>
      {state && !state.ok && <p className="text-xs text-red-600">{state.message}</p>}
    </li>
  );
}
