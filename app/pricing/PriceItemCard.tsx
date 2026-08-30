"use client";

import { useActionState, useState } from "react";
import {
  updatePriceItemBase,
  setPriceItemActive,
  updatePriceItemSizeGroup,
  updatePriceItemCategory,
  addModifier,
  updateModifierPrice,
  removeModifier,
  type ActionResult,
} from "./actions";
import { SIZE_GROUPS, SIZE_GROUP_LABELS, type SizeGroup } from "@/lib/sizes";

const initialState: ActionResult = null;

type Modifier = { key: string; label: string; price: number };

export function PriceItemCard({
  name,
  basePrice,
  isHeadwear,
  category,
  active,
  sizeGroup,
  modifiers,
}: {
  name: string;
  basePrice: number;
  isHeadwear: boolean;
  category: string | null;
  active: boolean;
  sizeGroup: SizeGroup;
  modifiers: Modifier[];
}) {
  const [baseState, baseAction, basePending] = useActionState(
    updatePriceItemBase,
    initialState,
  );
  const [activeState, activeAction, activePending] = useActionState(
    setPriceItemActive,
    initialState,
  );
  const [sizeGroupState, sizeGroupAction, sizeGroupPending] = useActionState(
    updatePriceItemSizeGroup,
    initialState,
  );
  const [categoryState, categoryAction, categoryPending] = useActionState(
    updatePriceItemCategory,
    initialState,
  );
  const [addModState, addModAction, addModPending] = useActionState(
    addModifier,
    initialState,
  );
  const [showAddMod, setShowAddMod] = useState(false);

  return (
    <div
      className="rounded-xl border border-neutral-200 p-4"
      style={{ opacity: active ? 1 : 0.55 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-black">{name}</div>
          {isHeadwear && (
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              Headwear
            </div>
          )}
          {!active && (
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
              Removed
            </div>
          )}
        </div>
        <form action={baseAction} className="w-24 shrink-0">
          <input type="hidden" name="name" value={name} />
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            Base $
          </label>
          <div className="flex gap-1">
            <input
              name="basePrice"
              type="number"
              min="0"
              step="0.5"
              defaultValue={basePrice}
              disabled={!active}
              className="w-full rounded border border-neutral-300 px-2 py-1 text-right font-mono text-sm text-black disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={basePending || !active}
            className="mt-1 w-full rounded border border-neutral-300 py-1 text-[11px] font-semibold text-black disabled:opacity-50"
          >
            {basePending ? "…" : "Save"}
          </button>
        </form>
      </div>
      {baseState && !baseState.ok && (
        <p className="mt-1 text-xs text-red-600">{baseState.message}</p>
      )}

      <form action={sizeGroupAction} className="mt-3 border-t border-neutral-100 pt-3">
        <input type="hidden" name="name" value={name} />
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
          Size group
        </label>
        <div className="flex gap-2">
          <select
            name="sizeGroup"
            defaultValue={sizeGroup}
            disabled={!active}
            className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-black disabled:opacity-50"
          >
            {SIZE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {SIZE_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={sizeGroupPending || !active}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            {sizeGroupPending ? "…" : "Save"}
          </button>
        </div>
        {sizeGroupState && !sizeGroupState.ok && (
          <p className="mt-1 text-xs text-red-600">{sizeGroupState.message}</p>
        )}
      </form>

      <form action={categoryAction} className="mt-3 border-t border-neutral-100 pt-3">
        <input type="hidden" name="name" value={name} />
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
          Category
        </label>
        <div className="flex gap-2">
          <input
            name="category"
            list="category-suggestions"
            defaultValue={category ?? ""}
            disabled={!active}
            placeholder="e.g. JERSEY"
            className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={categoryPending || !active}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            {categoryPending ? "…" : "Save"}
          </button>
        </div>
        {categoryState && !categoryState.ok && (
          <p className="mt-1 text-xs text-red-600">{categoryState.message}</p>
        )}
      </form>

      {modifiers.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            Add-ons
          </div>
          {modifiers.map((m) => (
            <ModifierRow key={m.key} itemName={name} modifier={m} disabled={!active} />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
        {active && (
          <button
            type="button"
            onClick={() => setShowAddMod((v) => !v)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-black"
          >
            + Add-on
          </button>
        )}
        <form action={activeAction}>
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="active" value={(!active).toString()} />
          <button
            type="submit"
            disabled={activePending}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-500 disabled:opacity-50"
          >
            {active ? "Remove" : "Restore"}
          </button>
        </form>
      </div>
      {activeState && !activeState.ok && (
        <p className="mt-1 text-xs text-red-600">{activeState.message}</p>
      )}

      {showAddMod && (
        <form action={addModAction} className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
          <input type="hidden" name="itemName" value={name} />
          <div className="grid grid-cols-2 gap-2">
            <input
              name="label"
              placeholder="e.g. Long sleeve"
              className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-400"
            />
            <input
              name="price"
              type="number"
              min="0"
              step="0.5"
              placeholder="Extra $"
              className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-400"
            />
          </div>
          {addModState && !addModState.ok && (
            <p className="text-xs text-red-600">{addModState.message}</p>
          )}
          <button
            type="submit"
            disabled={addModPending}
            className="w-full rounded-lg border border-neutral-300 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            {addModPending ? "Adding…" : "Add"}
          </button>
        </form>
      )}
    </div>
  );
}

function ModifierRow({
  itemName,
  modifier,
  disabled,
}: {
  itemName: string;
  modifier: Modifier;
  disabled: boolean;
}) {
  const [priceState, priceAction, pricePending] = useActionState(
    updateModifierPrice,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeModifier,
    initialState,
  );

  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm text-black">
        {modifier.label}
      </span>
      <form action={priceAction} className="flex items-center gap-1">
        <input type="hidden" name="itemName" value={itemName} />
        <input type="hidden" name="key" value={modifier.key} />
        <span className="text-sm text-neutral-400">+$</span>
        <input
          name="price"
          type="number"
          min="0"
          step="0.5"
          defaultValue={modifier.price}
          disabled={disabled}
          className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-right font-mono text-sm text-black disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pricePending || disabled}
          className="text-[11px] font-semibold text-black underline disabled:opacity-50"
        >
          {pricePending ? "…" : "Save"}
        </button>
      </form>
      <form action={removeAction}>
        <input type="hidden" name="itemName" value={itemName} />
        <input type="hidden" name="key" value={modifier.key} />
        <button
          type="submit"
          disabled={removePending || disabled}
          className="p-1 text-neutral-400 disabled:opacity-50"
          aria-label={`Remove ${modifier.label}`}
        >
          ×
        </button>
      </form>
      {priceState && !priceState.ok && (
        <p className="text-xs text-red-600">{priceState.message}</p>
      )}
      {removeState && !removeState.ok && (
        <p className="text-xs text-red-600">{removeState.message}</p>
      )}
    </div>
  );
}
