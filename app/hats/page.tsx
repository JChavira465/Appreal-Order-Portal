import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCatalog, HAT_MIN } from "@/lib/catalog";

type VendorRef = { name: string } | { name: string }[] | null;
type ItemCostRef =
  | { vendor_id: string | null; vendors: VendorRef }
  | { vendor_id: string | null; vendors: VendorRef }[]
  | null;

type OrderItemRow = {
  item: string;
  qty: number;
  order_item_costs: ItemCostRef;
};
type PendingOrderRow = {
  id: string;
  order_number: number;
  team_name: string;
  status: string;
  order_items: OrderItemRow[] | null;
};

function one<T>(rel: T | T[] | null): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

// Orders still actually pending a vendor order -- shipped/cancelled/draft
// don't need any more hats bought, so they're excluded from the batch.
const PENDING_STATUSES = ["submitted", "mockup_pending", "mockup_approved", "in_production"];

export default async function HatsPage() {
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

  if (!isManager) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Only a manager can view this.
        </div>
      </main>
    );
  }

  const [{ data: orders }, catalog] = await Promise.all([
    supabase.from("orders").select(
      `id, order_number, team_name, status,
       order_items(item, qty, order_item_costs(vendor_id, vendors(name)))`,
    ),
    loadCatalog(supabase),
  ]);

  const pending = ((orders ?? []) as PendingOrderRow[]).filter((o) =>
    PENDING_STATUSES.includes(o.status),
  );

  type Group = {
    vendorName: string;
    item: string;
    qty: number;
    orders: { orderNumber: number; teamName: string; orderId: string }[];
  };
  const groups = new Map<string, Group>();

  for (const o of pending) {
    for (const li of o.order_items ?? []) {
      if (!catalog[li.item]?.isHeadwear) continue;
      const cost = one(li.order_item_costs);
      const vendorName = one(cost?.vendors ?? null)?.name ?? "No vendor assigned";
      const key = `${vendorName}::${li.item}`;
      const existing = groups.get(key);
      if (existing) {
        existing.qty += li.qty;
        existing.orders.push({ orderNumber: o.order_number, teamName: o.team_name, orderId: o.id });
      } else {
        groups.set(key, {
          vendorName,
          item: li.item,
          qty: li.qty,
          orders: [{ orderNumber: o.order_number, teamName: o.team_name, orderId: o.id }],
        });
      }
    }
  }

  const rows = Array.from(groups.values()).sort(
    (a, b) => a.vendorName.localeCompare(b.vendorName) || a.item.localeCompare(b.item),
  );

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Hat Orders</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Every headwear line across pending orders, grouped by vendor and
        style, so small orders from different teams can be combined into
        one vendor order instead of each falling short of the {HAT_MIN}-unit
        minimum on its own.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          No pending hat orders right now.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((g) => {
            const ready = g.qty >= HAT_MIN;
            return (
              <div key={`${g.vendorName}::${g.item}`} className="rounded-xl border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-black">{g.item}</div>
                    <div className="text-xs text-neutral-500">{g.vendorName}</div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                    style={{
                      background: ready ? "#ECFDF3" : "#FFF7ED",
                      color: ready ? "#15803D" : "#B45309",
                    }}
                  >
                    {g.qty} / {HAT_MIN} {ready ? "ready to order" : "needs more"}
                  </span>
                </div>
                <div className="mt-2 space-y-0.5">
                  {g.orders.map((o, i) => (
                    <Link
                      key={i}
                      href={`/orders/${o.orderId}`}
                      className="block text-xs text-neutral-500 underline"
                    >
                      #{o.orderNumber} {o.teamName}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
