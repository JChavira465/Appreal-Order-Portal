import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money, loadCatalog } from "@/lib/catalog";
import { signedUrlsFor } from "@/lib/order-images";
import {
  MockupManagerForm,
  MockupRepActions,
  AddReferenceImageForm,
} from "./MockupSection";
import { PaymentsManagerForm } from "./PaymentsSection";
import { AdvanceButton, CancelButton, ReopenButton } from "./StatusActions";
import { LineCostForm, OrderCostForm } from "./CostSection";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-methods";
import { VenmoPayLink } from "./VenmoPayLink";
import { VENMO_COLLECTORS } from "@/lib/venmo";
import { AiConceptForm } from "./AiConceptSection";
import { DeleteImageButton } from "./DeleteImageButton";
import { BuildOrderExport } from "./BuildOrderExport";
import type { BuildOrderLine } from "@/lib/exportOrders";

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

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Slash-free on purpose -- used in the Venmo note (see VENMO_COLLECTORS
// below), where "/" characters have caused the deep link to fail to open.
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusPill({
  status,
  revisionRequested,
}: {
  status: string;
  revisionRequested: boolean;
}) {
  let bg = "#FFF7ED";
  let fg = "#B45309";
  let label = STAGES[STAGE_INDEX[status]]?.label ?? status;
  if (status === "cancelled") {
    bg = "#F4F4F5";
    fg = "#71717A";
    label = "Cancelled";
  } else if (revisionRequested) {
    bg = "#FDECEA";
    fg = "#B42318";
    label = "Revision requested";
  } else if (["mockup_approved", "in_production", "shipped"].includes(status)) {
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

function StageSteps({
  status,
  revisionRequested,
}: {
  status: string;
  revisionRequested: boolean;
}) {
  const idx = STAGE_INDEX[status] ?? 0;
  if (status === "cancelled") {
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
              revisionRequested && i === idx
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

function DeadlineFlag({
  status,
  deadline,
}: {
  status: string;
  deadline: string | null;
}) {
  if (status === "shipped" || status === "cancelled") return null;
  const d = daysUntil(deadline);
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className="text-sm text-black">{value}</div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
      {text}
    </h3>
  );
}

function ImageGallery({
  images,
  urls,
  orderId,
  canDelete,
}: {
  images: { id: string; storage_path: string }[];
  urls: Record<string, string>;
  orderId: string;
  canDelete: boolean;
}) {
  if (images.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {images.map((img) => {
        const url = urls[img.storage_path];
        if (!url) return null;
        return (
          <div key={img.id} className="relative">
            <a href={url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-20 w-20 rounded-lg border border-neutral-200 object-cover"
              />
            </a>
            {canDelete && (
              <DeleteImageButton
                orderId={orderId}
                imageId={img.id}
                storagePath={img.storage_path}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

type OrderItem = {
  id: string;
  item: string;
  mods: string[];
  qty: number;
  unit_price: number | null;
  line_total: number | null;
  order_item_sizes: {
    size_label: string;
    qty: number;
    order_item_size_names: { player_name: string | null; player_number: string | null }[];
  }[];
};
type Payment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  created_at: string;
};
type ActivityEntry = {
  id: string;
  actor_name: string | null;
  text: string;
  created_at: string;
};
type OrderImage = {
  id: string;
  storage_path: string;
  kind: "reference" | "mockup" | "ai_concept";
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Not signed in.
        </div>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isManager =
    profile?.role === "manager" || profile?.role === "super_admin";

  const [{ data: order }, catalog] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, order_number, team_name, contact_name, contact_phone, sport, status,
         revision_requested, deadline, shipping_fee, shipping_address, discount,
         notes, ref_notes, mockup_notes, created_at, updated_at, rep_id,
         profiles(full_name),
         order_items(id, item, mods, qty, unit_price, line_total,
           order_item_sizes(size_label, qty,
             order_item_size_names(player_name, player_number))),
         payments(id, amount, method, note, created_at),
         activity_log(id, actor_name, text, created_at),
         order_images(id, storage_path, kind)`,
      )
      .eq("id", id)
      .maybeSingle(),
    loadCatalog(supabase),
  ]);

  if (!order) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/orders" className="text-sm text-neutral-500">
          ← Back
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Order not found.
        </div>
      </main>
    );
  }

  const items = (order.order_items ?? []) as OrderItem[];
  const modLabelsFor = (li: OrderItem): string =>
    li.mods
      .map((key) => catalog[li.item]?.modifiers.find((m) => m.key === key)?.label ?? key)
      .join(", ");
  const payments = (order.payments ?? []) as Payment[];
  const activity = [...((order.activity_log ?? []) as ActivityEntry[])].sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );
  const allImages = (order.order_images ?? []) as OrderImage[];
  const referenceImages = allImages.filter((img) => img.kind === "reference");
  const mockupImages = allImages.filter((img) => img.kind === "mockup");
  const aiConceptImages = allImages.filter((img) => img.kind === "ai_concept");
  const imageUrls = await signedUrlsFor(
    supabase,
    allImages.map((img) => img.storage_path),
  );
  const repProfile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles;
  const repName: string = repProfile?.full_name ?? "—";

  const subtotal = items.reduce((s, li) => s + Number(li.line_total ?? 0), 0);
  const total = subtotal + Number(order.shipping_fee ?? 0) - Number(order.discount ?? 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const balanceDue = total - paid;
  const qty = items.reduce((s, li) => s + (li.qty ?? 0), 0);

  let apparelVendors: { id: string; name: string }[] = [];
  let hatVendors: { id: string; name: string }[] = [];
  const costsByItemId = new Map<
    string,
    { vendor_id: string | null; unit_cost: number | null }
  >();
  const vendorItemCosts: Record<string, Record<string, number>> = {};
  const headwearByItem = new Map<string, boolean>();
  let manufacturerId: string | null = null;
  let shippingCostValue: number | null = null;
  let totalCost = 0;
  let hasAnyCost = false;

  if (isManager) {
    const itemIds = items.map((li) => li.id);
    const [
      { data: vendorRows },
      { data: itemCostRows },
      { data: orderCostRow },
      { data: priceItemRows },
      { data: vendorPriceRows },
    ] = await Promise.all([
      supabase.from("vendors").select("id, name, kind").eq("active", true).order("name"),
      itemIds.length > 0
        ? supabase
            .from("order_item_costs")
            .select("order_item_id, vendor_id, unit_cost")
            .in("order_item_id", itemIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("order_costs")
        .select("manufacturer_id, shipping_cost")
        .eq("order_id", order.id)
        .maybeSingle(),
      supabase.from("price_items").select("name, is_headwear"),
      supabase.from("vendor_item_costs").select("vendor_id, item, unit_cost"),
    ]);

    apparelVendors = (vendorRows ?? []).filter((v) => v.kind !== "hat");
    hatVendors = (vendorRows ?? []).filter((v) => v.kind === "hat");
    for (const row of (itemCostRows ?? []) as {
      order_item_id: string;
      vendor_id: string | null;
      unit_cost: number | null;
    }[]) {
      costsByItemId.set(row.order_item_id, {
        vendor_id: row.vendor_id,
        unit_cost: row.unit_cost === null ? null : Number(row.unit_cost),
      });
    }
    for (const row of priceItemRows ?? []) {
      headwearByItem.set(row.name, row.is_headwear);
    }
    for (const row of vendorPriceRows ?? []) {
      const byItem = vendorItemCosts[row.vendor_id] ?? {};
      byItem[row.item] = Number(row.unit_cost);
      vendorItemCosts[row.vendor_id] = byItem;
    }
    manufacturerId = orderCostRow?.manufacturer_id ?? null;
    shippingCostValue =
      orderCostRow?.shipping_cost == null ? null : Number(orderCostRow.shipping_cost);
    hasAnyCost =
      [...costsByItemId.values()].some((c) => c.unit_cost !== null) ||
      shippingCostValue !== null;
    totalCost =
      items.reduce((s, li) => {
        const c = costsByItemId.get(li.id);
        return c?.unit_cost != null ? s + c.unit_cost * li.qty : s;
      }, 0) + (shippingCostValue ?? 0);
  }
  const profit = total - totalCost;

  const buildOrderLines: BuildOrderLine[] = items.flatMap((li) =>
    li.order_item_sizes.map((sz) => ({
      item: li.item,
      description: modLabelsFor(li),
      size: sz.size_label,
      count: sz.qty,
      unitCost: costsByItemId.get(li.id)?.unit_cost ?? null,
    })),
  );

  const cancelled = order.status === "cancelled";
  const isOwnRep = order.rep_id === user.id;
  const repCanEdit = !isManager && isOwnRep && order.status === "submitted";
  const canEdit = isManager ? !cancelled : repCanEdit;
  const canApproveRevise =
    !isManager && isOwnRep && order.status === "mockup_pending";
  const canCancel = !cancelled && (isManager || repCanEdit);
  const canReopen = isManager && cancelled;
  const canAdvance = isManager && !cancelled && order.status !== "shipped";
  const nextLabel = canAdvance
    ? STAGES[Math.min(STAGE_INDEX[order.status] + 1, STAGES.length - 1)].label
    : "";

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/orders" className="text-sm text-neutral-500">
        ← Back
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-neutral-400">
            #{order.order_number}
          </div>
          <h1 className="text-xl font-bold leading-tight text-black">
            {order.team_name}
          </h1>
        </div>
        <StatusPill
          status={order.status}
          revisionRequested={order.revision_requested}
        />
      </div>
      <div className="mt-1 text-sm text-neutral-500">
        {order.sport ?? "—"} · {qty} pcs · {money(total)}
      </div>
      <div className="mt-2">
        <DeadlineFlag status={order.status} deadline={order.deadline} />
      </div>
      <div className="mt-3">
        <StageSteps
          status={order.status}
          revisionRequested={order.revision_requested}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Row label="Rep" value={repName} />
        <Row label="Contact" value={order.contact_name || "—"} />
        <Row label="Phone" value={order.contact_phone || "—"} />
        <Row label="Needed by" value={order.deadline || "—"} />
      </div>

      <div className="mt-5">
        <SectionLabel text="Shipping address" />
        {order.shipping_address ? (
          <div className="whitespace-pre-line rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-black">
            {order.shipping_address}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">Not set yet.</p>
        )}
      </div>

      <div className="mt-5">
        <SectionLabel text="Items" />
        <div className="divide-y divide-neutral-100 rounded-t-xl border border-neutral-200">
          {items.map((li) => (
            <div key={li.id} className="flex items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-black">{li.item}</div>
                {li.mods.length > 0 && (
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {modLabelsFor(li)}
                  </div>
                )}
                <div className="mt-0.5 text-xs text-neutral-400">
                  {li.order_item_sizes.length > 0
                    ? li.order_item_sizes
                        .map((sz) => `${sz.size_label} x${sz.qty}`)
                        .join(", ")
                    : "no sizes"}
                </div>
                {li.order_item_sizes.some(
                  (sz) => sz.order_item_size_names.length > 0,
                ) && (
                  <div className="mt-1 text-xs text-neutral-500">
                    {li.order_item_sizes
                      .filter((sz) => sz.order_item_size_names.length > 0)
                      .map(
                        (sz) =>
                          `${sz.size_label}: ${sz.order_item_size_names
                            .map(
                              (n) =>
                                `${n.player_name || "—"}${n.player_number ? ` #${n.player_number}` : ""}`,
                            )
                            .join(", ")}`,
                      )
                      .join(" · ")}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right font-mono text-sm">
                <div className="text-neutral-500">
                  {li.qty} × {money(Number(li.unit_price ?? 0))}
                </div>
                <div className="font-bold text-black">
                  {money(Number(li.line_total ?? 0))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1 rounded-b-xl border border-t-0 border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
          <div className="flex justify-between text-neutral-500">
            <span>Subtotal</span>
            <span className="font-mono">{money(subtotal)}</span>
          </div>
          <div className="flex justify-between text-neutral-500">
            <span>Shipping</span>
            <span className="font-mono">{money(Number(order.shipping_fee ?? 0))}</span>
          </div>
          {Number(order.discount ?? 0) > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Discount</span>
              <span className="font-mono">−{money(Number(order.discount))}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-black">
            <span>Total</span>
            <span className="font-mono">{money(total)}</span>
          </div>
        </div>
      </div>

      {isManager && (
        <div className="mt-6 border-t border-neutral-100 pt-5">
          <SectionLabel text="Cost & vendor" />
          <div className="space-y-2">
            {items.map((li) => {
              const c = costsByItemId.get(li.id);
              return (
                <LineCostForm
                  key={li.id}
                  orderId={order.id}
                  orderItemId={li.id}
                  itemLabel={li.item}
                  itemName={li.item}
                  isHeadwear={headwearByItem.get(li.item) ?? false}
                  hatVendors={hatVendors}
                  manufacturerId={manufacturerId}
                  vendorItemCosts={vendorItemCosts}
                  vendorId={c?.vendor_id ?? null}
                  unitCost={c?.unit_cost ?? null}
                  qty={li.qty}
                  lineTotal={Number(li.line_total ?? 0)}
                />
              );
            })}
          </div>
          <OrderCostForm
            orderId={order.id}
            manufacturerId={manufacturerId}
            shippingCost={shippingCostValue}
            apparelVendors={apparelVendors}
          />
          <div className="mt-3 flex justify-between border-t border-neutral-100 pt-3 text-sm font-bold">
            <span className="text-black">Profit</span>
            {hasAnyCost ? (
              <span
                className="font-mono"
                style={{ color: profit >= 0 ? "#15803D" : "#B42318" }}
              >
                {money(profit)}
              </span>
            ) : (
              <span className="text-xs font-normal text-neutral-400">
                — enter costs above
              </span>
            )}
          </div>
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <BuildOrderExport
              orderNumber={order.order_number}
              teamName={order.team_name}
              lines={buildOrderLines}
            />
          </div>
        </div>
      )}

      {order.notes && (
        <div className="mt-5">
          <SectionLabel text="Notes" />
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-black">
            {order.notes}
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-neutral-100 pt-5">
        <SectionLabel text="Payments" />
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-neutral-500">Paid</span>
          <span className="font-mono text-black">{money(paid)}</span>
        </div>
        <div className="mb-3 flex justify-between text-sm font-bold">
          <span className="text-black">Balance due</span>
          <span
            className="font-mono"
            style={{ color: balanceDue > 0 ? "#B45309" : "#15803D" }}
          >
            {money(balanceDue)}
          </span>
        </div>
        {balanceDue > 0 && !cancelled && (
          <div className="mb-1">
            <p className="mb-2 text-xs text-neutral-400">
              Pick whichever collector this payment should go to:
            </p>
            {VENMO_COLLECTORS.map((collector) => (
              <VenmoPayLink
                key={collector.name}
                collector={collector}
                amount={balanceDue}
                note={`${order.team_name} - ${fmtDate(order.created_at)}`}
              />
            ))}
          </div>
        )}
        {payments.length > 0 && (
          <div className="mb-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between px-3 py-2 text-sm">
                <div>
                  <div className="font-mono text-black">
                    {money(Number(p.amount))}{" "}
                    <span className="font-sans text-xs font-normal text-neutral-400">
                      {PAYMENT_METHOD_LABELS[p.method] ?? "Other"}
                    </span>
                  </div>
                  {p.note && <div className="text-xs text-neutral-400">{p.note}</div>}
                </div>
                <div className="text-xs text-neutral-400">{timeAgo(p.created_at)}</div>
              </div>
            ))}
          </div>
        )}
        {isManager && !cancelled ? (
          <PaymentsManagerForm orderId={order.id} discount={Number(order.discount ?? 0)} />
        ) : (
          <p className="text-xs text-neutral-400">
            Only the manager can record payments.
          </p>
        )}
      </div>

      {(order.ref_notes || referenceImages.length > 0 || isOwnRep) && (
        <div className="mt-6 border-t border-neutral-100 pt-5">
          <SectionLabel text="Design reference from rep" />
          {order.ref_notes && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-black">
              {order.ref_notes}
            </div>
          )}
          <ImageGallery images={referenceImages} urls={imageUrls} orderId={order.id} canDelete={isManager} />
          {isOwnRep && !isManager && <AddReferenceImageForm orderId={order.id} />}
        </div>
      )}

      {(aiConceptImages.length > 0 || (isOwnRep && !isManager && !cancelled)) && (
        <div className="mt-6 border-t border-neutral-100 pt-5">
          <SectionLabel text="AI concept ideas (not official)" />
          <p className="mb-2 text-xs text-neutral-400">
            Rough AI-generated ideas from the rep, for early feedback before
            the real mockup below.
          </p>
          <ImageGallery images={aiConceptImages} urls={imageUrls} orderId={order.id} canDelete={isManager} />
          {isOwnRep && !isManager && !cancelled && (
            <AiConceptForm orderId={order.id} />
          )}
        </div>
      )}

      <div className="mt-6 border-t border-neutral-100 pt-5">
        <SectionLabel text="Mockup" />
        {isManager && !cancelled ? (
          <MockupManagerForm orderId={order.id} mockupNotes={order.mockup_notes ?? ""} />
        ) : order.mockup_notes ? (
          <p className="text-sm text-black">{order.mockup_notes}</p>
        ) : (
          <p className="text-sm text-neutral-400">No mockup posted yet.</p>
        )}
        <ImageGallery images={mockupImages} urls={imageUrls} orderId={order.id} canDelete={isManager} />
        {canApproveRevise && (
          <div className="mt-3">
            <MockupRepActions orderId={order.id} />
          </div>
        )}
      </div>

      <div className="mt-6 space-y-2 border-t border-neutral-100 pt-5">
        <div className="mb-1 text-xs text-neutral-400">
          Updated {timeAgo(order.updated_at)}
        </div>

        {canAdvance && <AdvanceButton orderId={order.id} nextLabel={nextLabel} />}
        {!isManager && !cancelled && (
          <p className="text-xs text-neutral-400">
            Order status is managed by the office.
          </p>
        )}

        {canEdit && (
          <Link
            href={`/orders/${order.id}/edit`}
            className="block w-full rounded-xl border-2 border-neutral-300 py-3 text-center text-sm font-semibold text-black"
          >
            Edit order
          </Link>
        )}
        {!isManager && !repCanEdit && !canApproveRevise && !cancelled && (
          <p className="text-xs text-neutral-400">
            Locked for edits once the office starts the mockup — ask the
            office to make changes.
          </p>
        )}

        {canCancel && <CancelButton orderId={order.id} />}
        {canReopen && <ReopenButton orderId={order.id} />}

        {(isOwnRep || isManager) && (
          <Link
            href={`/orders/new?reorder=${order.id}`}
            className="block w-full rounded-xl border-2 border-neutral-300 py-3 text-center text-sm font-semibold text-black"
          >
            Reorder
          </Link>
        )}
      </div>

      {activity.length > 0 && (
        <div className="mt-6 border-t border-neutral-100 pt-5">
          <SectionLabel text="Activity" />
          <div className="space-y-2">
            {activity.map((a) => (
              <div key={a.id} className="flex justify-between gap-3 text-xs text-neutral-500">
                <span>
                  <b className="text-black">{a.actor_name ?? "Someone"}</b> {a.text}
                </span>
                <span className="shrink-0 text-neutral-300">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
