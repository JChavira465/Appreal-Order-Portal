"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { createOrder, type CreateOrderResult } from "./new/actions";
import { updateOrder } from "./[id]/actions";
import { getRosterTemplate, saveRosterTemplate } from "./roster-template-actions";
import { checkRecentDuplicate, type RecentDuplicate } from "./duplicate-check-actions";
import {
  unitPriceFor,
  money,
  HAT_MIN,
  type Catalog,
  type PriceModifier,
} from "@/lib/catalog";
import { SIZES_BY_GROUP } from "@/lib/sizes";

const SPORTS = [
  "Baseball",
  "Softball",
  "Football",
  "Basketball",
  "Soccer",
  "Volleyball",
  "Wrestling",
  "Track",
  "Other",
];

type Customer = {
  id: string;
  team_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  sport: string | null;
  shipping_address: string | null;
};

// One roster row = one physical piece: who it's for (optional) and what
// size. A block's total quantity is just how many rows have a size
// picked -- a blank name/number is a valid row too, for pieces nobody's
// put a name to yet or a plain bulk order with no roster at all.
type RosterRow = {
  rowId: string;
  name: string;
  number: string;
  size: string;
  customSize: boolean;
};

// The simpler alternative to a roster: just a size and how many, no
// names attached at all -- for things like towels, headbands, or hats
// that don't get anything printed on the back.
type SizeQty = {
  sizeId: string;
  label: string;
  qty: string;
  customSize: boolean;
};

type ItemLine = {
  lineId: string;
  item: string;
  mods: string[];
  needsRoster: boolean;
  rows: RosterRow[];
  sizeQtys: SizeQty[];
};

const initialState: CreateOrderResult = null;
const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
    </div>
  );
}

// Accepts "Smith, 23, L", "Smith 23 L", "Smith L" (no number), or a bare
// size on its own line ("L") for an unnamed/bulk piece. The trailing
// token has to match one of this block's actual size options -- that's
// how a size is told apart from part of a name -- so an unrecognized
// last token means the line can't be placed and is skipped.
function parseRosterLine(
  line: string,
  sizeOptions: string[],
): { name: string; number: string; size: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const findSize = (token: string) =>
    sizeOptions.find((s) => s.toLowerCase() === token.toLowerCase());

  const bareSize = findSize(trimmed);
  if (bareSize) return { name: "", number: "", size: bareSize };

  const parts = trimmed.includes(",")
    ? trimmed.split(",").map((p) => p.trim()).filter(Boolean)
    : trimmed.split(/\s+/);
  if (parts.length < 2) return null;

  const size = findSize(parts[parts.length - 1]);
  if (!size) return null;

  const rest = parts.slice(0, -1);
  const maybeNumber = rest[rest.length - 1];
  if (rest.length >= 2 && /^\d{1,3}$/.test(maybeNumber)) {
    return { name: rest.slice(0, -1).join(" "), number: maybeNumber, size };
  }
  return { name: rest.join(" "), number: "", size };
}

function parseRoster(
  text: string,
  sizeOptions: string[],
): { name: string; number: string; size: string }[] {
  return text
    .split("\n")
    .map((line) => parseRosterLine(line, sizeOptions))
    .filter((e): e is { name: string; number: string; size: string } => e !== null);
}

function RosterRowFields({
  row,
  sizeOptions,
  allowCustomSize,
  onChange,
  onRemove,
  removeDisabled,
}: {
  row: RosterRow;
  sizeOptions: string[];
  allowCustomSize: boolean;
  onChange: (patch: Partial<RosterRow>) => void;
  onRemove: () => void;
  removeDisabled: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-2">
      <input
        value={row.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Name for the back"
        className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-400"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          value={row.number}
          onChange={(e) => onChange({ number: e.target.value })}
          placeholder="#"
          inputMode="numeric"
          className="w-14 shrink-0 rounded border border-neutral-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-400"
        />
        {row.customSize ? (
          <>
            <input
              value={row.size}
              onChange={(e) => onChange({ size: e.target.value })}
              placeholder="WxL, e.g. 34x32"
              className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-400"
            />
            <button
              type="button"
              onClick={() => onChange({ customSize: false, size: "" })}
              className="shrink-0 text-[10px] font-semibold text-neutral-500 underline"
            >
              List
            </button>
          </>
        ) : (
          <select
            value={row.size}
            onChange={(e) =>
              e.target.value === "__custom__"
                ? onChange({ size: "", customSize: true })
                : onChange({ size: e.target.value, customSize: false })
            }
            className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm text-black"
          >
            <option value="" disabled>
              Size
            </option>
            {sizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {allowCustomSize && <option value="__custom__">Custom (WxL)</option>}
          </select>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={removeDisabled}
          className="shrink-0 text-neutral-400 disabled:opacity-30"
          aria-label="Remove row"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function RosterEditor({
  rows,
  sizeOptions,
  allowCustomSize,
  teamName,
  onAdd,
  onChange,
  onRemove,
  onBulkAdd,
  onReplaceAll,
}: {
  rows: RosterRow[];
  sizeOptions: string[];
  allowCustomSize: boolean;
  teamName: string;
  onAdd: () => void;
  onChange: (rowId: string, patch: Partial<RosterRow>) => void;
  onRemove: (rowId: string) => void;
  onBulkAdd: (entries: { name: string; number: string; size: string }[]) => void;
  onReplaceAll: (rows: RosterRow[]) => void;
}) {
  // Stays collapsed by default even when rows are already filled in -- a
  // 100-row roster expanded on every visit is exactly the "super busy"
  // screen a rep complained about. The count in the button label is
  // enough to see progress without forcing the whole list open.
  const [expanded, setExpanded] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateMessage, setTemplateMessage] = useState("");
  const filled = rows.filter((r) => r.size.trim()).length;
  const bulkEntries = parseRoster(bulkText, sizeOptions);

  const handleLoadTemplate = async () => {
    if (!teamName.trim()) {
      setTemplateMessage("Enter a team name first.");
      return;
    }
    setTemplateBusy(true);
    const entries = await getRosterTemplate(teamName);
    setTemplateBusy(false);
    if (entries.length === 0) {
      setTemplateMessage("No saved roster found for this team.");
      return;
    }
    onReplaceAll(
      entries.map((e) => ({
        rowId: crypto.randomUUID(),
        name: e.name,
        number: e.number,
        size: e.size,
        customSize: e.size !== "" && !sizeOptions.includes(e.size),
      })),
    );
    setTemplateMessage(`Loaded ${entries.length} player${entries.length === 1 ? "" : "s"}.`);
  };

  const handleSaveTemplate = async () => {
    if (!teamName.trim()) {
      setTemplateMessage("Enter a team name first.");
      return;
    }
    setTemplateBusy(true);
    const result = await saveRosterTemplate(
      teamName,
      rows.map((r) => ({ name: r.name, number: r.number, size: r.size })),
    );
    setTemplateBusy(false);
    setTemplateMessage(result.message);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-semibold text-neutral-600 underline"
      >
        {expanded ? "Hide" : "Show"} roster
        {filled > 0 ? ` (${filled} ${filled === 1 ? "piece" : "pieces"})` : ""}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => setBulkOpen((v) => !v)}
              className="text-[11px] font-semibold text-black underline"
            >
              {bulkOpen ? "Hide paste-a-list" : "Paste a list instead"}
            </button>
            <button
              type="button"
              onClick={handleLoadTemplate}
              disabled={templateBusy}
              className="text-[11px] font-semibold text-black underline disabled:opacity-40"
            >
              Load saved roster
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={templateBusy}
              className="text-[11px] font-semibold text-black underline disabled:opacity-40"
            >
              Save this roster
            </button>
          </div>
          {templateMessage && (
            <p className="text-[11px] text-neutral-500">{templateMessage}</p>
          )}
          {bulkOpen && (
            <div className="space-y-1 rounded border border-neutral-300 bg-neutral-50 p-2">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  "One per line -- name, number, size, e.g.\nSmith, 23, L\nJones, 7, M\nor just a size alone (M) for a blank piece"
                }
                rows={4}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-400"
              />
              <button
                type="button"
                onClick={() => {
                  if (bulkEntries.length > 0) onBulkAdd(bulkEntries);
                  setBulkText("");
                  setBulkOpen(false);
                }}
                disabled={bulkEntries.length === 0}
                className="text-[11px] font-semibold text-black underline disabled:opacity-30"
              >
                Add {bulkEntries.length > 0 ? bulkEntries.length : ""} from list
              </button>
            </div>
          )}
          <div className="space-y-1.5">
            {rows.map((r) => (
              <RosterRowFields
                key={r.rowId}
                row={r}
                sizeOptions={sizeOptions}
                allowCustomSize={allowCustomSize}
                onChange={(patch) => onChange(r.rowId, patch)}
                onRemove={() => onRemove(r.rowId)}
                removeDisabled={rows.length === 1}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="text-[11px] font-semibold text-black underline"
          >
            + Add row
          </button>
        </div>
      )}
    </div>
  );
}

function SizeQtyRow({
  sizeQty,
  sizeOptions,
  allowCustomSize,
  onChange,
  onRemove,
  removeDisabled,
}: {
  sizeQty: SizeQty;
  sizeOptions: string[];
  allowCustomSize: boolean;
  onChange: (patch: Partial<SizeQty>) => void;
  onRemove: () => void;
  removeDisabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
        {sizeQty.customSize ? (
          <input
            value={sizeQty.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="WxL, e.g. 34x32"
            className="min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-400"
          />
        ) : (
          <select
            value={sizeQty.label}
            onChange={(e) =>
              e.target.value === "__custom__"
                ? onChange({ label: "", customSize: true })
                : onChange({ label: e.target.value, customSize: false })
            }
            className="min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm text-black"
          >
            <option value="" disabled>
              Size
            </option>
            {sizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {allowCustomSize && <option value="__custom__">Custom (WxL)</option>}
          </select>
        )}
        <input
          value={sizeQty.qty}
          onChange={(e) => onChange({ qty: e.target.value })}
          type="number"
          min="1"
          placeholder="Qty"
          className="min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-400"
        />
      </div>
      {sizeQty.customSize && (
        <button
          type="button"
          onClick={() => onChange({ customSize: false, label: "" })}
          className="shrink-0 text-[10px] font-semibold text-neutral-500 underline"
        >
          List
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={removeDisabled}
        className="shrink-0 text-neutral-400 disabled:opacity-30"
        aria-label="Remove size"
      >
        ×
      </button>
    </div>
  );
}

function SizeQtyEditor({
  sizeQtys,
  sizeOptions,
  allowCustomSize,
  onAdd,
  onChange,
  onRemove,
}: {
  sizeQtys: SizeQty[];
  sizeOptions: string[];
  allowCustomSize: boolean;
  onAdd: () => void;
  onChange: (sizeId: string, patch: Partial<SizeQty>) => void;
  onRemove: (sizeId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {sizeQtys.map((sz) => (
        <SizeQtyRow
          key={sz.sizeId}
          sizeQty={sz}
          sizeOptions={sizeOptions}
          allowCustomSize={allowCustomSize}
          onChange={(patch) => onChange(sz.sizeId, patch)}
          onRemove={() => onRemove(sz.sizeId)}
          removeDisabled={sizeQtys.length === 1}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="text-[11px] font-semibold text-black underline"
      >
        + Add another size
      </button>
    </div>
  );
}

function defaultSizeLabel(catalog: Catalog, item: string): string {
  const options = SIZES_BY_GROUP[catalog[item]?.sizeGroup ?? "one_size"];
  return options.length === 1 ? options[0] : "";
}

function emptyRow(size = ""): RosterRow {
  return { rowId: crypto.randomUUID(), name: "", number: "", size, customSize: false };
}

function emptySizeQty(size = ""): SizeQty {
  return { sizeId: crypto.randomUUID(), label: size, qty: "", customSize: false };
}

function defaultMods(catalog: Catalog, item: string): string[] {
  return (catalog[item]?.modifiers ?? []).filter((m) => m.isDefault).map((m) => m.key);
}

function emptyLine(firstItem: string, catalog: Catalog): ItemLine {
  return {
    lineId: crypto.randomUUID(),
    item: firstItem,
    mods: defaultMods(catalog, firstItem),
    needsRoster: true,
    rows: [emptyRow(defaultSizeLabel(catalog, firstItem))],
    sizeQtys: [emptySizeQty(defaultSizeLabel(catalog, firstItem))],
  };
}

function lineQty(li: ItemLine): number {
  return li.needsRoster
    ? li.rows.filter((r) => r.size.trim()).length
    : li.sizeQtys.reduce((s, sz) => s + (parseInt(sz.qty, 10) || 0), 0);
}

export type OrderFormInitial = {
  teamName: string;
  contactName: string;
  contactPhone: string;
  sport: string;
  deadline: string;
  notes: string;
  shippingFee: string;
  shippingAddress: string;
  items: {
    item: string;
    mods: string[];
    sizes: {
      label: string;
      qty: string;
      names?: { name: string; number: string }[];
    }[];
  }[];
};

export function OrderForm({
  catalog,
  customers,
  mode = "new",
  orderId,
  orderStatus,
  initial,
}: {
  catalog: Catalog;
  customers: Customer[];
  mode?: "new" | "edit";
  orderId?: string;
  orderStatus?: string;
  initial?: OrderFormInitial;
}) {
  const isEdit = mode === "edit";
  // A brand-new order can always be saved as a draft. An existing order
  // can only go back to "draft" behavior if it's still a draft itself --
  // once it's a real submitted order, there's no drafting it back.
  const showDraftOption = !isEdit || orderStatus === "draft";
  const itemNames = Object.keys(catalog);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateOrder : createOrder,
    initialState,
  );

  const [teamName, setTeamName] = useState(initial?.teamName ?? "");
  const [contactName, setContactName] = useState(initial?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "");
  const [sport, setSport] = useState(initial?.sport ?? SPORTS[0]);
  const [deadline, setDeadline] = useState(initial?.deadline ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [shippingFee, setShippingFee] = useState(initial?.shippingFee ?? "");
  const [shippingAddress, setShippingAddress] = useState(
    initial?.shippingAddress ?? "",
  );
  const [items, setItems] = useState<ItemLine[]>(() =>
    initial?.items?.length
      ? initial.items.map((li) => {
          const sizeOptions = SIZES_BY_GROUP[catalog[li.item]?.sizeGroup ?? "one_size"];
          const rows: RosterRow[] = [];
          let anyNames = false;
          for (const sz of li.sizes) {
            const names = sz.names ?? [];
            if (names.length > 0) anyNames = true;
            const rowCount = Math.max(parseInt(sz.qty, 10) || 0, names.length);
            for (let i = 0; i < rowCount; i++) {
              const n = names[i];
              rows.push({
                rowId: crypto.randomUUID(),
                name: n?.name ?? "",
                number: n?.number ?? "",
                size: sz.label,
                customSize: !sizeOptions.includes(sz.label),
              });
            }
          }
          const sizeQtys: SizeQty[] = li.sizes.map((sz) => ({
            sizeId: crypto.randomUUID(),
            label: sz.label,
            qty: sz.qty,
            customSize: !sizeOptions.includes(sz.label),
          }));
          return {
            lineId: crypto.randomUUID(),
            item: li.item,
            mods: li.mods,
            // Loads into whichever mode matches how the data was
            // actually entered -- if nobody put a name on anything,
            // there's no reason to default into the busier roster view.
            needsRoster: anyNames,
            rows: rows.length ? rows : [emptyRow(defaultSizeLabel(catalog, li.item))],
            sizeQtys: sizeQtys.length
              ? sizeQtys
              : [emptySizeQty(defaultSizeLabel(catalog, li.item))],
          };
        })
      : [emptyLine(itemNames[0] ?? "", catalog)],
  );
  const [clientError, setClientError] = useState("");
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<RecentDuplicate>(null);

  // Non-blocking heads-up, not a hard stop -- a second real order for the
  // same team within 48h is entirely normal, this just catches accidental
  // double-entry during a busy intake session.
  const handleTeamNameBlur = async () => {
    if (isEdit) return;
    setDuplicateWarning(await checkRecentDuplicate(teamName));
  };

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const handleReferenceFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    const files = Array.from(e.target.files ?? []);
    setPreviewUrls(files.map((f) => URL.createObjectURL(f)));
  };

  const setItemField = (id: string, patch: Partial<ItemLine>) =>
    setItems((list) =>
      list.map((li) => (li.lineId === id ? { ...li, ...patch } : li)),
    );

  // Ungrouped modifiers (groupKey null) stay simple independent toggles.
  // Grouped ones are mutually exclusive: picking one clears any other
  // option in that group. A group with a default (e.g. collar -- always
  // exactly one selected) can't be toggled off to nothing; a group
  // without one (e.g. mesh type -- optional) can.
  const toggleMod = (id: string, mod: PriceModifier, itemMods: PriceModifier[]) =>
    setItems((list) =>
      list.map((li) => {
        if (li.lineId !== id) return li;
        const selected = li.mods.includes(mod.key);

        if (!mod.groupKey) {
          return {
            ...li,
            mods: selected
              ? li.mods.filter((k) => k !== mod.key)
              : [...li.mods, mod.key],
          };
        }

        const groupKeys = itemMods
          .filter((m) => m.groupKey === mod.groupKey)
          .map((m) => m.key);
        const groupHasDefault = itemMods.some(
          (m) => m.groupKey === mod.groupKey && m.isDefault,
        );

        if (selected) {
          if (groupHasDefault) return li;
          return { ...li, mods: li.mods.filter((k) => k !== mod.key) };
        }
        return {
          ...li,
          mods: [...li.mods.filter((k) => !groupKeys.includes(k)), mod.key],
        };
      }),
    );

  const addLine = () =>
    setItems((list) => [...list, emptyLine(itemNames[0] ?? "", catalog)]);
  const removeLine = (id: string) =>
    setItems((list) =>
      list.length > 1 ? list.filter((li) => li.lineId !== id) : list,
    );

  const mapRows = (lineId: string, fn: (rows: RosterRow[]) => RosterRow[]) =>
    setItems((list) =>
      list.map((li) => (li.lineId === lineId ? { ...li, rows: fn(li.rows) } : li)),
    );

  const addRow = (lineId: string) =>
    setItems((list) =>
      list.map((li) =>
        li.lineId === lineId
          ? { ...li, rows: [...li.rows, emptyRow(defaultSizeLabel(catalog, li.item))] }
          : li,
      ),
    );

  const removeRow = (lineId: string, rowId: string) =>
    mapRows(lineId, (rows) =>
      rows.length > 1 ? rows.filter((r) => r.rowId !== rowId) : rows,
    );

  const replaceRows = (lineId: string, rows: RosterRow[]) =>
    setItemField(lineId, { rows });

  const setRowField = (lineId: string, rowId: string, patch: Partial<RosterRow>) =>
    mapRows(lineId, (rows) =>
      rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    );

  const addRowsBulk = (
    lineId: string,
    entries: { name: string; number: string; size: string }[],
  ) =>
    mapRows(lineId, (rows) => [
      ...rows,
      ...entries.map((e) => ({
        rowId: crypto.randomUUID(),
        name: e.name,
        number: e.number,
        size: e.size,
        customSize: false,
      })),
    ]);

  const setNeedsRoster = (lineId: string, needsRoster: boolean) =>
    setItemField(lineId, { needsRoster });

  const mapSizeQtys = (lineId: string, fn: (sizeQtys: SizeQty[]) => SizeQty[]) =>
    setItems((list) =>
      list.map((li) =>
        li.lineId === lineId ? { ...li, sizeQtys: fn(li.sizeQtys) } : li,
      ),
    );

  const addSizeQty = (lineId: string) =>
    setItems((list) =>
      list.map((li) =>
        li.lineId === lineId
          ? { ...li, sizeQtys: [...li.sizeQtys, emptySizeQty()] }
          : li,
      ),
    );

  const removeSizeQty = (lineId: string, sizeId: string) =>
    mapSizeQtys(lineId, (sizeQtys) =>
      sizeQtys.length > 1 ? sizeQtys.filter((sz) => sz.sizeId !== sizeId) : sizeQtys,
    );

  const setSizeQtyField = (lineId: string, sizeId: string, patch: Partial<SizeQty>) =>
    mapSizeQtys(lineId, (sizeQtys) =>
      sizeQtys.map((sz) => (sz.sizeId === sizeId ? { ...sz, ...patch } : sz)),
    );

  const loadCustomer = (customerId: string) => {
    const c = customers.find((x) => x.id === customerId);
    if (!c) return;
    setTeamName(c.team_name);
    setContactName(c.contact_name ?? "");
    setContactPhone(c.contact_phone ?? "");
    if (c.sport) setSport(c.sport);
    if (c.shipping_address) setShippingAddress(c.shipping_address);
  };

  const totalQty = items.reduce((s, li) => s + lineQty(li), 0);
  const subtotal = items.reduce(
    (s, li) => s + unitPriceFor(catalog, li.item, li.mods) * lineQty(li),
    0,
  );
  const shipping = parseFloat(shippingFee) || 0;
  const hatWarn = items.some((li) => {
    const qty = lineQty(li);
    return catalog[li.item]?.isHeadwear && qty > 0 && qty < HAT_MIN;
  });

  const itemsJson = JSON.stringify(
    items.map((li) => {
      if (!li.needsRoster) {
        // Sizes-only mode -- no names to attach, just a qty per size.
        return {
          item: li.item,
          mods: li.mods,
          sizes: li.sizeQtys
            .filter((sz) => sz.label.trim() && (parseInt(sz.qty, 10) || 0) > 0)
            .map((sz) => ({
              label: sz.label.trim(),
              qty: parseInt(sz.qty, 10) || 0,
              names: [],
            })),
        };
      }
      // Each roster row is one piece; group by size label to get the
      // qty-per-size + names-per-size shape the rest of the app expects
      // (order_item_sizes / order_item_size_names).
      const bySize = new Map<
        string,
        { qty: number; names: { name: string; number: string }[] }
      >();
      for (const r of li.rows) {
        const label = r.size.trim();
        if (!label) continue;
        const entry = bySize.get(label) ?? { qty: 0, names: [] };
        entry.qty += 1;
        if (r.name.trim() || r.number.trim()) {
          entry.names.push({ name: r.name.trim(), number: r.number.trim() });
        }
        bySize.set(label, entry);
      }
      return {
        item: li.item,
        mods: li.mods,
        sizes: [...bySize.entries()].map(([label, { qty, names }]) => ({
          label,
          qty,
          names,
        })),
      };
    }),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const submitter = (e.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | null;
    const savingDraft = submitter?.value === "draft";

    if (savingDraft) {
      if (!teamName.trim()) {
        e.preventDefault();
        setClientError("At least a team name is needed to save a draft.");
        return;
      }
      setClientError("");
      return;
    }

    if (!teamName.trim() || !deadline) {
      e.preventDefault();
      setClientError("Team name and deadline are required.");
      return;
    }
    const clean = items.filter((li) => li.item && lineQty(li) > 0);
    if (clean.length === 0) {
      e.preventDefault();
      setClientError("Add at least one item with a size and quantity.");
      return;
    }
    setClientError("");
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="mt-4">
      <h2 className="mb-4 text-lg font-bold text-black">
        {isEdit ? "Edit order" : "New order"}
      </h2>

      {isEdit && orderId && <input type="hidden" name="orderId" value={orderId} />}

      {!isEdit && customers.length > 0 && (
        <div className="mb-4">
          <Field label="Load saved customer">
            <select
              defaultValue=""
              onChange={(e) => {
                loadCustomer(e.target.value);
                e.target.value = "";
              }}
              className={inputClass}
            >
              <option value="">— pick a past customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.team_name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <div className="space-y-4">
        <Field label="Team / Customer name" required>
          <input
            name="teamName"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onBlur={handleTeamNameBlur}
            placeholder="e.g. Katy Tigers 12U"
            className={inputClass}
          />
          {duplicateWarning && (
            <p className="mt-1.5 text-xs font-semibold text-amber-700">
              Heads up — {teamName} already has order #{duplicateWarning.orderNumber}{" "}
              submitted recently. Make sure this isn&apos;t a duplicate.
            </p>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact name">
            <input
              name="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Coach name"
              className={inputClass}
            />
          </Field>
          <Field label="Contact phone">
            <input
              name="contactPhone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="(281) 555-0100"
              type="tel"
              inputMode="tel"
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Shipping address">
          <textarea
            name="shippingAddress"
            value={shippingAddress}
            onChange={(e) => setShippingAddress(e.target.value)}
            rows={2}
            placeholder="Street, city, state, zip"
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sport">
            <select
              name="sport"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              className={inputClass}
            >
              {SPORTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Needed by" required>
            <input
              name="deadline"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              type="date"
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-black">
            Items
          </h3>
          <span className="font-mono text-xs text-neutral-500">
            {totalQty} pcs
          </span>
        </div>
        <div className="space-y-3">
          {items.map((li, idx) => {
            const cat = catalog[li.item];
            const qty = lineQty(li);
            const unit = unitPriceFor(catalog, li.item, li.mods);
            return (
              <div
                key={li.lineId}
                className="rounded-xl border border-neutral-200 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-500">
                    ITEM {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(li.lineId)}
                    disabled={items.length === 1}
                    className="text-xs font-semibold text-neutral-400 disabled:opacity-30"
                  >
                    Remove
                  </button>
                </div>

                <Field label="Item">
                  <select
                    value={li.item}
                    onChange={(e) =>
                      setItemField(li.lineId, {
                        item: e.target.value,
                        mods: defaultMods(catalog, e.target.value),
                        rows: [emptyRow(defaultSizeLabel(catalog, e.target.value))],
                        sizeQtys: [emptySizeQty(defaultSizeLabel(catalog, e.target.value))],
                      })
                    }
                    className={inputClass}
                  >
                    {itemNames.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>

                {cat && cat.modifiers.length > 0 && (() => {
                  const groupedMods = new Map<string, PriceModifier[]>();
                  const ungroupedMods: PriceModifier[] = [];
                  for (const m of cat.modifiers) {
                    if (m.groupKey) {
                      const arr = groupedMods.get(m.groupKey) ?? [];
                      arr.push(m);
                      groupedMods.set(m.groupKey, arr);
                    } else {
                      ungroupedMods.push(m);
                    }
                  }
                  return (
                    <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
                      <div className="mb-1 text-xs font-bold text-neutral-500">
                        Add-ons
                      </div>
                      {[...groupedMods.values()].map((groupMods) => (
                        <div
                          key={groupMods[0].groupKey}
                          className="flex flex-wrap gap-1.5"
                        >
                          {groupMods.map((m) => {
                            const selected = li.mods.includes(m.key);
                            return (
                              <button
                                key={m.key}
                                type="button"
                                onClick={() => toggleMod(li.lineId, m, groupMods)}
                                className="rounded-lg border px-3 py-1.5 text-sm"
                                style={{
                                  borderColor: selected ? "#111" : "#E5E5E5",
                                  background: selected ? "#111" : "#fff",
                                  color: selected ? "#fff" : "#111",
                                }}
                              >
                                {m.label}
                                {m.price > 0 ? ` +$${m.price}` : ""}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      {ungroupedMods.map((m) => {
                        const checked = li.mods.includes(m.key);
                        return (
                          <label
                            key={m.key}
                            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                            style={{
                              borderColor: checked ? "#111" : "#E5E5E5",
                              background: checked ? "#F5F5F5" : "#fff",
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleMod(li.lineId, m, ungroupedMods)}
                              />
                              {m.label}
                            </span>
                            <span className="font-mono text-neutral-500">
                              +${m.price}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}

                <div className="mt-3 border-t border-neutral-100 pt-3">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {li.needsRoster
                      ? "Names, numbers & sizes for this block"
                      : "Sizes & quantities for this block"}
                  </label>
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNeedsRoster(li.lineId, true)}
                      className="rounded-lg py-3 text-sm font-bold"
                      style={{
                        background: li.needsRoster ? "#111" : "#F5F5F5",
                        color: li.needsRoster ? "#fff" : "#666",
                      }}
                    >
                      Roster
                    </button>
                    <button
                      type="button"
                      onClick={() => setNeedsRoster(li.lineId, false)}
                      className="rounded-lg py-3 text-sm font-bold"
                      style={{
                        background: !li.needsRoster ? "#111" : "#F5F5F5",
                        color: !li.needsRoster ? "#fff" : "#666",
                      }}
                    >
                      Sizes only
                    </button>
                  </div>
                  {li.needsRoster ? (
                    <RosterEditor
                      rows={li.rows}
                      sizeOptions={SIZES_BY_GROUP[cat?.sizeGroup ?? "one_size"]}
                      allowCustomSize={cat?.sizeGroup === "bottoms"}
                      teamName={teamName}
                      onAdd={() => addRow(li.lineId)}
                      onChange={(rowId, patch) => setRowField(li.lineId, rowId, patch)}
                      onRemove={(rowId) => removeRow(li.lineId, rowId)}
                      onBulkAdd={(entries) => addRowsBulk(li.lineId, entries)}
                      onReplaceAll={(rows) => replaceRows(li.lineId, rows)}
                    />
                  ) : (
                    <SizeQtyEditor
                      sizeQtys={li.sizeQtys}
                      sizeOptions={SIZES_BY_GROUP[cat?.sizeGroup ?? "one_size"]}
                      allowCustomSize={cat?.sizeGroup === "bottoms"}
                      onAdd={() => addSizeQty(li.lineId)}
                      onChange={(sizeId, patch) => setSizeQtyField(li.lineId, sizeId, patch)}
                      onRemove={(sizeId) => removeSizeQty(li.lineId, sizeId)}
                    />
                  )}
                  <p className="mt-1.5 text-[11px] text-neutral-400">
                    {li.needsRoster
                      ? "Use this when players want a name/number on the back."
                      : "Use this for plain items -- nothing printed on the back, just sizes and how many."}
                  </p>
                </div>

                {cat?.isHeadwear && qty > 0 && qty < HAT_MIN && (
                  <div className="mt-2 text-[11px] text-amber-700">
                    Initial hat orders usually need a {HAT_MIN}-unit minimum.
                  </div>
                )}

                <div className="mt-3 border-t border-neutral-100 pt-3 text-right font-mono text-sm text-neutral-500">
                  Item price: {money(unit)}
                  {qty > 0 && (
                    <>
                      {" "}
                      · Block total ({qty} pcs):{" "}
                      <b className="text-black">{money(unit * qty)}</b>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addLine}
          className="mt-3 w-full rounded-xl border-2 border-dashed border-neutral-300 py-3 text-sm font-semibold text-black"
        >
          + Add another item
        </button>
      </div>

      {!isEdit && (
        <div className="mt-6 border-t border-neutral-100 pt-5">
          <Field label="Reference photos">
            <input
              name="referenceImages"
              type="file"
              accept="image/*"
              multiple
              onChange={handleReferenceFilesChange}
              className="w-full text-sm text-black file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-black"
            />
          </Field>
          {previewUrls.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {previewUrls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-neutral-200 object-cover"
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <Field label="Notes">
          <textarea
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Colors, logo placement, roster names/numbers..."
            className={`min-h-[70px] ${inputClass}`}
          />
        </Field>
        <Field label="Estimated shipping">
          <input
            name="shippingFee"
            value={shippingFee}
            onChange={(e) => setShippingFee(e.target.value)}
            type="number"
            min="0"
            step="1"
            placeholder="10–40, use best judgement"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="mt-5 space-y-1 border-t border-neutral-100 pt-4 text-sm">
        <div className="flex justify-between text-neutral-500">
          <span>Subtotal</span>
          <span className="font-mono">{money(subtotal)}</span>
        </div>
        <div className="flex justify-between text-neutral-500">
          <span>Shipping</span>
          <span className="font-mono">{money(shipping)}</span>
        </div>
        <div className="flex justify-between pt-1 text-base font-bold text-black">
          <span>Total</span>
          <span className="font-mono">{money(subtotal + shipping)}</span>
        </div>
      </div>

      {hatWarn && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Headwear under the {HAT_MIN}-unit initial-order minimum.
        </div>
      )}

      {(clientError || (state && !state.ok)) && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {clientError || state?.message}
        </div>
      )}

      <input type="hidden" name="itemsJson" value={itemsJson} readOnly />

      {showDraftOption && (
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={pending}
          className="mt-5 w-full rounded-xl border-2 border-neutral-300 py-3.5 text-base font-bold text-black disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save draft"}
        </button>
      )}
      <button
        type="submit"
        name="intent"
        value="submit"
        disabled={pending}
        className={`w-full rounded-xl bg-black px-4 py-3.5 text-base font-bold text-white transition-opacity disabled:opacity-50 ${showDraftOption ? "mt-2" : "mt-5"}`}
      >
        {pending ? "Saving…" : isEdit ? "Save changes" : "Submit order"}
      </button>
      {showDraftOption && (
        <p className="mt-2 text-center text-[11px] text-neutral-400">
          A draft is only visible to you until you submit it.
        </p>
      )}
      {isEdit && orderId && (
        <Link
          href={`/orders/${orderId}`}
          className="mt-2 block w-full rounded-xl border-2 border-neutral-300 py-3 text-center text-sm font-semibold text-black"
        >
          Cancel
        </Link>
      )}
    </form>
  );
}
