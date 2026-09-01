"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { money } from "@/lib/catalog";
import type { ExportOrderRow } from "@/lib/exportOrders";

export type OrderRow = {
  id: string;
  orderNumber: number;
  teamName: string;
  sport: string;
  contactName: string;
  contactPhone: string;
  status: string;
  revisionRequested: boolean;
  deadline: string | null;
  shippingAddress: string;
  repName: string;
  itemNames: string[];
  qty: number;
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  paid: number;
  balanceDue: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // Manager-only -- RLS on order_item_costs/order_costs means these are
  // always null for a rep, same as if the data had never been fetched.
  shippingCost: number | null;
  suppliesCost: number | null;
  totalCost: number | null;
  profit: number | null;
  items: {
    item: string;
    modLabels: string[];
    sizes: {
      label: string;
      qty: number;
      names: { name: string; number: string }[];
    }[];
    qty: number;
    unitPrice: number;
    lineTotal: number;
    vendorName: string | null;
    unitCost: number | null;
    lineCost: number | null;
    lineProfit: number | null;
  }[];
};

const STAGES = [
  { key: "submitted", label: "Submitted" },
  { key: "mockup_pending", label: "Mockup Sent" },
  { key: "mockup_approved", label: "Mockup Approved" },
  { key: "in_production", label: "In Production" },
  { key: "shipped", label: "Shipped" },
];
const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  STAGES.map((s, i) => [s.key, i]),
);

function itemSummary(items: string[]): string {
  if (items.length === 0) return "—";
  if (items.length === 1) return items[0];
  return `${items[0]} +${items.length - 1} more`;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// createdAt is a UTC timestamp string -- slicing it directly for the
// month filter would put a late-evening Texas order in the wrong month
// right at a month boundary. en-CA renders as YYYY-MM, so this reads out
// the Texas-local month without ever constructing a shifted Date.
function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
  });
}

function StatusPill({ order }: { order: OrderRow }) {
  let bg = "#FFF7ED";
  let fg = "#B45309";
  let label: string = STAGES[STAGE_INDEX[order.status]]?.label ?? order.status;
  if (order.status === "draft") {
    bg = "#F4F4F5";
    fg = "#52525B";
    label = "Draft";
  } else if (order.status === "cancelled") {
    bg = "#F4F4F5";
    fg = "#71717A";
    label = "Cancelled";
  } else if (order.revisionRequested) {
    bg = "#FDECEA";
    fg = "#B42318";
    label = "Revision requested";
  } else if (
    ["mockup_approved", "in_production", "shipped"].includes(order.status)
  ) {
    bg = "#ECFDF3";
    fg = "#15803D";
  }
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

function StageSteps({ order }: { order: OrderRow }) {
  const idx = STAGE_INDEX[order.status] ?? 0;
  if (order.status === "cancelled" || order.status === "draft") {
    return <div className="h-1.5 rounded-full bg-neutral-200" />;
  }
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, i) => (
        <div
          key={s.key}
          title={s.label}
          className="h-1.5 flex-1 rounded-full"
          style={{
            background:
              order.revisionRequested && i === idx
                ? "#DC2626"
                : i <= idx
                  ? "#111111"
                  : "#E5E5E5",
          }}
        />
      ))}
    </div>
  );
}

function DeadlineFlag({ order }: { order: OrderRow }) {
  if (["shipped", "cancelled", "draft"].includes(order.status)) return null;
  const d = daysUntil(order.deadline);
  if (d === null) return null;
  if (d < 0) {
    return (
      <span className="text-[11px] font-bold text-red-700">
        {Math.abs(d)}d overdue
      </span>
    );
  }
  if (d <= 7) {
    return (
      <span className="text-[11px] font-bold text-amber-700">
        due in {d}d
      </span>
    );
  }
  return null;
}

export function OrderBoard({
  orders,
  isManager,
  initialQuery,
  asCompany,
}: {
  orders: OrderRow[];
  isManager: boolean;
  initialQuery?: string;
  asCompany?: string | null;
}) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [sort, setSort] = useState<"deadline" | "newest" | "total">(
    "deadline",
  );
  const [rep, setRep] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [exportFailed, setExportFailed] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const reps = useMemo(
    () => Array.from(new Set(orders.map((o) => o.repName))).sort(),
    [orders],
  );

  const list = useMemo(() => {
    let l = orders.filter((o) =>
      showCancelled ? true : o.status !== "cancelled",
    );
    if (isManager && rep) l = l.filter((o) => o.repName === rep);
    if (fromMonth) l = l.filter((o) => monthKey(o.createdAt) >= fromMonth);
    if (toMonth) l = l.filter((o) => monthKey(o.createdAt) <= toMonth);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      l = l.filter(
        (o) =>
          o.teamName.toLowerCase().includes(s) ||
          String(o.orderNumber).includes(s) ||
          o.repName.toLowerCase().includes(s),
      );
    }
    const sorted = [...l];
    if (sort === "deadline") {
      sorted.sort((a, b) =>
        (a.deadline || "9999-99-99").localeCompare(b.deadline || "9999-99-99"),
      );
    } else if (sort === "newest") {
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sort === "total") {
      sorted.sort((a, b) => b.total - a.total);
    }
    return sorted;
  }, [orders, q, sort, rep, showCancelled, isManager, fromMonth, toMonth]);

  const openTotal = list
    .filter((o) => o.status !== "cancelled" && o.status !== "draft")
    .reduce((s, o) => s + o.total, 0);
  const dueTotal = list
    .filter((o) => o.status !== "cancelled" && o.status !== "draft")
    .reduce((s, o) => s + o.balanceDue, 0);
  const overdueCount = list.filter(
    (o) =>
      o.status !== "cancelled" &&
      o.status !== "draft" &&
      o.status !== "shipped" &&
      (daysUntil(o.deadline) ?? 0) < 0,
  ).length;

  const toExportRows = (rows: OrderRow[]): ExportOrderRow[] =>
    rows.map((o) => ({
      orderNumber: o.orderNumber,
      teamName: o.teamName,
      sport: o.sport,
      repName: o.repName,
      contactName: o.contactName,
      contactPhone: o.contactPhone,
      status: o.status,
      statusLabel:
        o.status === "cancelled"
          ? "Cancelled"
          : (STAGES[STAGE_INDEX[o.status]]?.label ?? o.status),
      revisionRequested: o.revisionRequested,
      deadline: o.deadline,
      shippingAddress: o.shippingAddress,
      qty: o.qty,
      subtotal: o.subtotal,
      shippingFee: o.shippingFee,
      discount: o.discount,
      total: o.total,
      paid: o.paid,
      balanceDue: o.balanceDue,
      notes: o.notes,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      shippingCost: o.shippingCost,
      suppliesCost: o.suppliesCost,
      totalCost: o.totalCost,
      profit: o.profit,
      items: o.items,
    }));

  const handleExport = async () => {
    if (list.length === 0) {
      setExportMessage("Nothing to export");
      return;
    }
    try {
      const { exportToExcel } = await import("@/lib/exportOrders");
      await exportToExcel(toExportRows(list));
      setExportFailed(false);
      setExportMessage("Excel file downloaded");
    } catch {
      setExportFailed(true);
      setExportMessage("Download blocked — use copy instead");
    }
  };

  const handleCopyTSV = async () => {
    try {
      const { ordersToTSV } = await import("@/lib/exportOrders");
      await navigator.clipboard.writeText(ordersToTSV(toExportRows(list)));
      setExportMessage("Copied — paste into Excel");
    } catch {
      setExportMessage("Couldn't copy");
    }
  };

  return (
    <div className="mt-4">
      <h2 className="mb-3 text-lg font-bold text-black">
        {isManager ? "All orders" : "My orders"}
      </h2>

      {isManager && orders.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-neutral-200 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              Order value
            </div>
            <div className="font-mono text-lg font-bold text-black">
              {money(openTotal)}
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              Balance due
            </div>
            <div className="font-mono text-lg font-bold text-black">
              {money(dueTotal)}
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              Overdue
            </div>
            <div
              className="font-mono text-lg font-bold"
              style={{ color: overdueCount > 0 ? "#B42318" : "#111111" }}
            >
              {overdueCount}
            </div>
          </div>
        </div>
      )}

      {isManager && orders.length > 0 && (
        <div className="mb-4">
          <button
            type="button"
            onClick={handleExport}
            className="w-full rounded-lg border-2 border-neutral-300 py-2.5 text-sm font-semibold text-black"
          >
            Export {list.length} order{list.length === 1 ? "" : "s"} to Excel
          </button>
          {exportFailed && (
            <button
              type="button"
              onClick={handleCopyTSV}
              className="mt-2 w-full rounded-lg border-2 border-neutral-300 py-2 text-sm font-semibold text-black"
            >
              Download blocked — copy for Excel instead
            </button>
          )}
          {exportMessage && (
            <p className="mt-1.5 text-center text-[11px] text-neutral-400">
              {exportMessage}
            </p>
          )}
          <p className="mt-1.5 text-center text-[11px] text-neutral-400">
            Exports what&apos;s currently filtered. Two tabs: order summary +
            line items.
          </p>
        </div>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search team, order #, rep…"
        className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="flex-1 rounded-lg border border-neutral-300 px-2 py-2 text-xs text-black"
        >
          <option value="deadline">Soonest deadline</option>
          <option value="newest">Newest first</option>
          <option value="total">Largest total</option>
        </select>
        {isManager && reps.length > 1 && (
          <select
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 px-2 py-2 text-xs text-black"
          >
            <option value="">All reps</option>
            {reps.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setShowCancelled((v) => !v)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold"
          style={{
            background: showCancelled ? "#F4F4F5" : "#fff",
            color: showCancelled ? "#111" : "#9CA3AF",
          }}
        >
          Cancelled
        </button>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
          Date range (by submitted month)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={fromMonth}
            onChange={(e) => setFromMonth(e.target.value)}
            aria-label="From month"
            className="flex-1 rounded-lg border border-neutral-300 px-2 py-2 text-xs text-black"
          />
          <span className="text-xs text-neutral-400">to</span>
          <input
            type="month"
            value={toMonth}
            onChange={(e) => setToMonth(e.target.value)}
            aria-label="To month"
            className="flex-1 rounded-lg border border-neutral-300 px-2 py-2 text-xs text-black"
          />
          {(fromMonth || toMonth) && (
            <button
              type="button"
              onClick={() => {
                setFromMonth("");
                setToMonth("");
              }}
              className="shrink-0 text-xs font-semibold text-neutral-400 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          {orders.length === 0
            ? "No orders yet."
            : "Nothing matches that search."}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((o) => (
            <Link
              key={o.id}
              href={asCompany ? `/orders/${o.id}?company=${asCompany}` : `/orders/${o.id}`}
              className="block rounded-xl border border-neutral-200 p-4"
              style={{ opacity: o.status === "cancelled" ? 0.55 : 1 }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-bold text-black">
                    {o.teamName}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    #{o.orderNumber} · {itemSummary(o.itemNames)} · {o.qty} pcs
                    {isManager && ` · ${o.repName}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-bold text-black">
                    {money(o.total)}
                  </div>
                  {o.balanceDue > 0 && o.status !== "cancelled" && (
                    <div className="text-[11px] font-semibold text-amber-700">
                      {money(o.balanceDue)} due
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <StatusPill order={o} />
                <DeadlineFlag order={o} />
              </div>
              <div className="mt-2">
                <StageSteps order={o} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
