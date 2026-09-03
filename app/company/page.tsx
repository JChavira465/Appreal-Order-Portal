import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/catalog";
import { AddPartnerForm, PartnerRow } from "./PartnerForm";
import { VendorBalanceRow } from "./VendorBalanceRow";

const ROLE_LABEL: Record<string, string> = {
  rep: "Rep",
  manager: "Manager",
  super_admin: "Super Admin",
};

// login_events/vendor_payments timestamps -- shown in Texas time
// regardless of what timezone the server happens to run in.
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}

export default async function CompanyPage() {
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

  if (profile?.role !== "super_admin") {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/home" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Only the account owner can view this.
        </div>
      </main>
    );
  }

  const [
    { data: partners },
    { data: vendors },
    { data: vendorPaymentRows },
    { data: priceItems },
    { data: itemCostRows },
    { data: orderCostRows },
    { data: orders },
    { data: staff },
    { data: loginRows },
  ] = await Promise.all([
    supabase
      .from("partner_splits")
      .select("id, name, percent, active")
      .order("sort_order"),
    supabase.from("vendors").select("id, name, kind").order("name"),
    supabase.from("vendor_payments").select("vendor_id, amount"),
    supabase.from("price_items").select("name, is_headwear"),
    supabase.from("order_item_costs").select("order_item_id, vendor_id, unit_cost"),
    supabase.from("order_costs").select("order_id, manufacturer_id, shipping_cost"),
    supabase
      .from("orders")
      .select(
        `id, status, shipping_fee, discount, rep_id,
         order_items(id, item, qty, line_total)`,
      ),
    supabase
      .from("profiles")
      .select("id, full_name, role, active")
      .order("full_name"),
    supabase.from("login_events").select("profile_id, created_at"),
  ]);

  const headwearByItem = new Map<string, boolean>();
  for (const row of priceItems ?? []) headwearByItem.set(row.name, row.is_headwear);

  const costByItemId = new Map<string, { vendor_id: string | null; unit_cost: number | null }>();
  for (const row of itemCostRows ?? []) {
    costByItemId.set(row.order_item_id, {
      vendor_id: row.vendor_id,
      unit_cost: row.unit_cost === null ? null : Number(row.unit_cost),
    });
  }

  const orderCostsByOrder = new Map<
    string,
    { manufacturer_id: string | null; shipping_cost: number | null }
  >();
  for (const row of orderCostRows ?? []) {
    orderCostsByOrder.set(row.order_id, {
      manufacturer_id: row.manufacturer_id,
      shipping_cost: row.shipping_cost === null ? null : Number(row.shipping_cost),
    });
  }

  // Total profit across every non-cancelled order, and how much of each
  // order's cost is attributed to which vendor -- headwear lines use
  // their own line-level vendor, everything else uses the order's
  // manufacturer (see supabase/migrations/0011 for why).
  let totalProfit = 0;
  const owedByVendor = new Map<string, number>();
  let ordersWithCost = 0;
  let ordersCounted = 0;

  for (const order of orders ?? []) {
    if (order.status === "cancelled") continue;
    ordersCounted += 1;
    const items = order.order_items ?? [];
    const subtotal = items.reduce((s, li) => s + Number(li.line_total ?? 0), 0);
    const total = subtotal + Number(order.shipping_fee ?? 0) - Number(order.discount ?? 0);
    const orderCosts = orderCostsByOrder.get(order.id);
    const shippingCost = orderCosts?.shipping_cost ?? 0;

    let lineCostSum = 0;
    let hasCost = shippingCost > 0;
    for (const li of items) {
      const cost = costByItemId.get(li.id);
      if (cost?.unit_cost == null) continue;
      hasCost = true;
      lineCostSum += cost.unit_cost * li.qty;
      const isHeadwear = headwearByItem.get(li.item) ?? false;
      const vendorId = isHeadwear ? cost.vendor_id : orderCosts?.manufacturer_id;
      if (vendorId) {
        owedByVendor.set(vendorId, (owedByVendor.get(vendorId) ?? 0) + cost.unit_cost * li.qty);
      }
    }
    if (hasCost) ordersWithCost += 1;
    totalProfit += total - lineCostSum - shippingCost;
  }

  const paidByVendor = new Map<string, number>();
  for (const row of vendorPaymentRows ?? []) {
    paidByVendor.set(row.vendor_id, (paidByVendor.get(row.vendor_id) ?? 0) + Number(row.amount));
  }

  const activePartners = (partners ?? []).filter((p) => p.active);
  const totalPercent = activePartners.reduce((s, p) => s + Number(p.percent), 0);

  // Orders created counts every order regardless of status -- it's an
  // activity signal, not a revenue one, unlike totalProfit above.
  const ordersByRep = new Map<string, number>();
  for (const order of orders ?? []) {
    if (!order.rep_id) continue;
    ordersByRep.set(order.rep_id, (ordersByRep.get(order.rep_id) ?? 0) + 1);
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const loginStatsByProfile = new Map<
    string,
    { last: string | null; count: number; count30d: number }
  >();
  for (const row of loginRows ?? []) {
    const existing = loginStatsByProfile.get(row.profile_id) ?? {
      last: null,
      count: 0,
      count30d: 0,
    };
    existing.count += 1;
    if (new Date(row.created_at).getTime() >= thirtyDaysAgo) existing.count30d += 1;
    if (!existing.last || row.created_at > existing.last) existing.last = row.created_at;
    loginStatsByProfile.set(row.profile_id, existing);
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/home" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Company</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Only visible to you -- not other managers.
      </p>

      <div className="mb-8">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-black">
          Profit split
        </h2>
        <div className="mb-3 rounded-xl border border-neutral-200 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-neutral-400">
            Total profit
          </div>
          <div className="font-mono text-2xl font-bold text-black">
            {money(totalProfit)}
          </div>
          <div className="mt-1 text-xs text-neutral-400">
            Across {ordersCounted} non-cancelled orders -- {ordersWithCost} have cost
            entered. Orders with no cost entered count as full profit until
            filled in.
          </div>
        </div>
        {activePartners.length > 0 && (
          <div className="mb-3 rounded-xl border border-neutral-200 px-4">
            {(partners ?? []).map((p) => (
              <PartnerRow
                key={p.id}
                id={p.id}
                name={p.name}
                percent={Number(p.percent)}
                active={p.active}
                share={(totalProfit * Number(p.percent)) / 100}
              />
            ))}
          </div>
        )}
        {activePartners.length > 0 && totalPercent !== 100 && (
          <p className="mb-3 text-xs text-amber-700">
            Active splits add up to {totalPercent}%, not 100%.
          </p>
        )}
        <AddPartnerForm />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-black">
          Vendor balances
        </h2>
        <p className="mb-3 text-xs text-neutral-400">
          Owed = cost entered on every non-cancelled order attributed to
          that vendor. Doesn&apos;t include shipping cost (what we pay to
          ship isn&apos;t necessarily owed to the manufacturer).
        </p>
        {vendors && vendors.length > 0 ? (
          <div className="rounded-xl border border-neutral-200 px-4">
            {vendors.map((v) => {
              const owed = owedByVendor.get(v.id) ?? 0;
              const paid = paidByVendor.get(v.id) ?? 0;
              return (
                <VendorBalanceRow
                  key={v.id}
                  vendorId={v.id}
                  name={v.name}
                  owed={owed}
                  paid={paid}
                  balance={owed - paid}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
            No vendors yet.
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-black">
          Team activity
        </h2>
        <p className="mb-3 text-xs text-neutral-400">
          Logins started being tracked when this was added — anyone who
          hasn&apos;t signed in since just shows &ldquo;Never logged in&rdquo;
          rather than something being wrong.
        </p>
        {staff && staff.length > 0 ? (
          <div className="rounded-xl border border-neutral-200 px-4">
            {staff.map((person) => {
              const stats = loginStatsByProfile.get(person.id);
              const orderCount = ordersByRep.get(person.id) ?? 0;
              return (
                <div
                  key={person.id}
                  className="flex items-center justify-between gap-2 border-b border-neutral-100 py-3 last:border-0"
                  style={{ opacity: person.active ? 1 : 0.5 }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-black">
                      {person.full_name ?? "—"}
                      {!person.active && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-red-600">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {ROLE_LABEL[person.role] ?? person.role} · {orderCount} order
                      {orderCount === 1 ? "" : "s"} created
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-neutral-600">
                      {stats?.last ? fmtDateTime(stats.last) : "Never logged in"}
                    </div>
                    {stats && stats.count > 0 && (
                      <div className="text-[11px] text-neutral-400">
                        {stats.count30d} login{stats.count30d === 1 ? "" : "s"} (30d) ·{" "}
                        {stats.count} all-time
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
            No accounts yet.
          </div>
        )}
      </div>
    </main>
  );
}
