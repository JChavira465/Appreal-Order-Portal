"use client";

import { useActionState } from "react";
import { saveShopInfo, type ShopInfoResult } from "./actions";
import type { ShopInfo } from "@/lib/shopInfo";

const initialState: ShopInfoResult = null;

const FIELD_CLASS =
  "w-full rounded-lg border border-neutral-300 px-4 py-3 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black";

export function ShopInfoForm({
  info,
  asCompany,
}: {
  info: ShopInfo;
  asCompany: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveShopInfo, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {asCompany && <input type="hidden" name="asCompany" value={asCompany} />}

      <div>
        <label htmlFor="paymentTerms" className="text-sm font-medium text-black">
          Payment terms
        </label>
        <p className="mb-2 mt-0.5 text-xs text-neutral-500">
          When you need to be paid, and what happens before an order goes to
          production.
        </p>
        <textarea
          id="paymentTerms"
          name="paymentTerms"
          rows={3}
          maxLength={500}
          defaultValue={info.paymentTerms ?? ""}
          placeholder="All orders must be paid in full before we submit the order to be processed and made."
          className={FIELD_CLASS}
        />
      </div>

      <div>
        <label htmlFor="turnaroundTime" className="text-sm font-medium text-black">
          Turnaround time
        </label>
        <p className="mb-2 mt-0.5 text-xs text-neutral-500">
          How long production takes once an order is approved and paid.
        </p>
        <textarea
          id="turnaroundTime"
          name="turnaroundTime"
          rows={2}
          maxLength={500}
          defaultValue={info.turnaroundTime ?? ""}
          placeholder="2-3 weeks from approval."
          className={FIELD_CLASS}
        />
      </div>

      <div>
        <label htmlFor="taxShippingNote" className="text-sm font-medium text-black">
          Tax &amp; shipping note
        </label>
        <p className="mb-2 mt-0.5 text-xs text-neutral-500">
          Anything a customer should know about charges added to the final
          bill.
        </p>
        <textarea
          id="taxShippingNote"
          name="taxShippingNote"
          rows={2}
          maxLength={500}
          defaultValue={info.taxShippingNote ?? ""}
          placeholder="Taxes and shipping are added to the final bill."
          className={FIELD_CLASS}
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
        {pending ? "Saving…" : "Save shop info"}
      </button>

      <p className="text-xs text-neutral-500">
        Leave a field empty to hide it. If all three are empty, nothing is
        shown to customers at all.
      </p>
    </form>
  );
}
