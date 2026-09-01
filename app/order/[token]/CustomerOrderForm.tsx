"use client";

import { useActionState, useState } from "react";
import { submitCustomerOrder, type CustomerOrderResult } from "./actions";

export type CustomerCatalogItem = {
  name: string;
  basePrice: number;
  sizes: string[];
  addOns: { key: string; label: string; price: number }[];
};

type Line = {
  id: number;
  item: string;
  mods: string[];
  sizes: Record<string, number>;
};

const initialState: CustomerOrderResult = null;

function money(n: number): string {
  return `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`;
}

export function CustomerOrderForm({
  token,
  catalog,
}: {
  token: string;
  catalog: CustomerCatalogItem[];
}) {
  const [state, formAction, pending] = useActionState(
    submitCustomerOrder,
    initialState,
  );
  const [lines, setLines] = useState<Line[]>([
    { id: 1, item: catalog[0]?.name ?? "", mods: [], sizes: {} },
  ]);

  const itemFor = (name: string) => catalog.find((c) => c.name === name);

  const updateLine = (id: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      {
        id: Math.max(0, ...prev.map((l) => l.id)) + 1,
        item: catalog[0]?.name ?? "",
        mods: [],
        sizes: {},
      },
    ]);

  const removeLine = (id: number) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)));

  const lineTotal = (line: Line): number => {
    const item = itemFor(line.item);
    if (!item) return 0;
    const addOnTotal = item.addOns
      .filter((a) => line.mods.includes(a.key))
      .reduce((s, a) => s + a.price, 0);
    const qty = Object.values(line.sizes).reduce((s, n) => s + (n || 0), 0);
    return (item.basePrice + addOnTotal) * qty;
  };

  const estimate = lines.reduce((s, l) => s + lineTotal(l), 0);
  const totalPieces = lines.reduce(
    (s, l) => s + Object.values(l.sizes).reduce((t, n) => t + (n || 0), 0),
    0,
  );

  const itemsJson = JSON.stringify(
    lines.map((l) => ({
      item: l.item,
      mods: l.mods,
      sizes: Object.entries(l.sizes)
        .filter(([, qty]) => qty > 0)
        .map(([label, qty]) => ({ label, qty })),
    })),
  );

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-8 text-center">
        <p className="text-base font-semibold text-green-900">Order sent</p>
        <p className="mt-2 text-sm text-green-800">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="itemsJson" value={itemsJson} />

      <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
        <p className="text-sm font-semibold text-black">Your info</p>
        <input
          name="teamName"
          required
          placeholder="Team or group name"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            name="contactName"
            required
            placeholder="Your name"
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
          />
          <input
            name="contactPhone"
            required
            type="tel"
            placeholder="Phone"
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            name="sport"
            placeholder="Sport (optional)"
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
          />
          <div>
            <label className="mb-1 block text-xs text-neutral-500">
              Needed by (optional)
            </label>
            <input
              name="deadline"
              type="date"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base text-black focus:border-black focus:outline-none"
            />
          </div>
        </div>
        <textarea
          name="shippingAddress"
          rows={2}
          placeholder="Shipping address (optional)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-black">What do you need?</p>

        {lines.map((line, idx) => {
          const item = itemFor(line.item);
          return (
            <div key={line.id} className="rounded-xl border border-neutral-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                  Item {idx + 1}
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="text-xs text-neutral-400 underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <select
                value={line.item}
                onChange={(e) =>
                  updateLine(line.id, { item: e.target.value, mods: [], sizes: {} })
                }
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base text-black focus:border-black focus:outline-none"
              >
                {catalog.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} — {money(c.basePrice)}
                  </option>
                ))}
              </select>

              {item && item.addOns.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-semibold text-neutral-500">Add-ons</p>
                  {item.addOns.map((a) => (
                    <label key={a.key} className="flex items-center gap-2 text-sm text-black">
                      <input
                        type="checkbox"
                        checked={line.mods.includes(a.key)}
                        onChange={(e) =>
                          updateLine(line.id, {
                            mods: e.target.checked
                              ? [...line.mods, a.key]
                              : line.mods.filter((k) => k !== a.key),
                          })
                        }
                      />
                      {a.label}
                      {a.price > 0 && (
                        <span className="text-neutral-400">+{money(a.price)}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}

              {item && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-semibold text-neutral-500">
                    How many of each size?
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {item.sizes.map((size) => (
                      <div key={size}>
                        <label className="mb-0.5 block text-center text-[11px] text-neutral-500">
                          {size}
                        </label>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={line.sizes[size] ?? ""}
                          onChange={(e) =>
                            updateLine(line.id, {
                              sizes: {
                                ...line.sizes,
                                [size]: Number(e.target.value) || 0,
                              },
                            })
                          }
                          className="w-full rounded-lg border border-neutral-300 px-1 py-2 text-center text-base text-black focus:border-black focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lineTotal(line) > 0 && (
                <p className="mt-3 text-right text-sm text-neutral-500">
                  {money(lineTotal(line))}
                </p>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addLine}
          className="w-full rounded-lg border-2 border-dashed border-neutral-300 py-2.5 text-sm font-semibold text-neutral-600"
        >
          + Add another item
        </button>
      </section>

      <section className="rounded-xl border border-neutral-200 p-4">
        <textarea
          name="notes"
          rows={3}
          placeholder="Anything else they should know? Colors, logo ideas, etc."
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
        />
      </section>

      {totalPieces > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
          <span className="text-sm text-neutral-500">
            {totalPieces} {totalPieces === 1 ? "piece" : "pieces"} — estimate
          </span>
          <span className="text-lg font-bold text-black">{money(estimate)}</span>
        </div>
      )}

      <p className="text-center text-xs text-neutral-400">
        This is an estimate only — shipping, tax, and any setup fees get added
        when they send your final total.
      </p>

      {state && !state.ok && (
        <p className="text-center text-sm text-red-600">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-4 py-3.5 text-base font-medium text-white disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send my order"}
      </button>
    </form>
  );
}
