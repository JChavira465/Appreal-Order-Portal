"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { money } from "@/lib/catalog";
import { setLineCost, setOrderCosts, type ActionResult } from "./cost-actions";

const initialState: ActionResult = null;

type Vendor = { id: string; name: string };

export function LineCostForm({
  orderId,
  orderItemId,
  itemLabel,
  itemName,
  isHeadwear,
  hatVendors,
  manufacturerId,
  vendorItemCosts,
  vendorId,
  unitCost,
  qty,
  lineTotal,
}: {
  orderId: string;
  orderItemId: string;
  itemLabel: string;
  itemName: string;
  isHeadwear: boolean;
  hatVendors: Vendor[];
  manufacturerId: string | null;
  vendorItemCosts: Record<string, Record<string, number>>;
  vendorId: string | null;
  unitCost: number | null;
  qty: number;
  lineTotal: number;
}) {
  const [state, formAction, pending] = useActionState(setLineCost, initialState);
  const [selectedVendor, setSelectedVendor] = useState(vendorId ?? "");
  const costInputRef = useRef<HTMLInputElement>(null);

  const lookupVendor = isHeadwear ? selectedVendor : manufacturerId;
  const listPrice = lookupVendor
    ? vendorItemCosts[lookupVendor]?.[itemName]
    : undefined;

  const lineCost = unitCost != null ? unitCost * qty : null;
  const lineProfit = lineCost != null ? lineTotal - lineCost : null;

  return (
    <form
      action={formAction}
      className="rounded-lg border border-neutral-200 p-3"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <div className="mb-2 text-sm font-semibold text-black">{itemLabel}</div>
      <div className={isHeadwear ? "grid grid-cols-2 gap-2" : ""}>
        {isHeadwear && (
          <select
            name="vendorId"
            value={selectedVendor}
            onChange={(e) => setSelectedVendor(e.target.value)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-black focus:border-black focus:outline-none"
          >
            <option value="">No hat vendor</option>
            {hatVendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        <input
          ref={costInputRef}
          name="unitCost"
          type="number"
          min="0"
          step="0.01"
          defaultValue={unitCost ?? ""}
          placeholder="Unit cost $"
          className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
      </div>
      {listPrice != null && (
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
          <span>List: {money(listPrice)}</span>
          <button
            type="button"
            onClick={() => {
              if (costInputRef.current) {
                costInputRef.current.value = listPrice.toFixed(2);
              }
            }}
            className="font-semibold text-black underline"
          >
            Use
          </button>
        </div>
      )}
      {lineCost != null && (
        <div className="mt-2 flex justify-between text-xs">
          <span className="text-neutral-400">Cost {money(lineCost)}</span>
          <span
            className="font-semibold"
            style={{ color: (lineProfit ?? 0) >= 0 ? "#15803D" : "#B42318" }}
          >
            Profit {money(lineProfit ?? 0)}
          </span>
        </div>
      )}
      {state && !state.ok && <p className="mt-1 text-xs text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full rounded-lg border border-neutral-300 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save cost"}
      </button>
    </form>
  );
}

export function OrderCostForm({
  orderId,
  manufacturerId,
  shippingCost,
  suppliesCost,
  vendorReadyBy,
  apparelVendors,
}: {
  orderId: string;
  manufacturerId: string | null;
  shippingCost: number | null;
  suppliesCost: number | null;
  vendorReadyBy: string | null;
  apparelVendors: Vendor[];
}) {
  const [state, formAction, pending] = useActionState(setOrderCosts, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
          Manufacturer
        </label>
        <select
          name="manufacturerId"
          defaultValue={manufacturerId ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
        >
          <option value="">Not set</option>
          {apparelVendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            Shipping cost (what we pay)
          </label>
          <input
            name="shippingCost"
            type="number"
            min="0"
            step="0.01"
            defaultValue={shippingCost ?? ""}
            placeholder="0.00"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            Supplies cost
          </label>
          <input
            name="suppliesCost"
            type="number"
            min="0"
            step="0.01"
            defaultValue={suppliesCost ?? ""}
            placeholder="0.00"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
          Vendor ready by (separate from customer deadline)
        </label>
        <input
          name="vendorReadyBy"
          type="date"
          defaultValue={vendorReadyBy ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border border-neutral-300 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state && !state.ok && <p className="text-xs text-red-600">{state.message}</p>}
    </form>
  );
}
