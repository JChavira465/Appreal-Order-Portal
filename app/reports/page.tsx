import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCompanyPlan, planAllows } from "@/lib/companyPlan";
import { UpgradeNotice } from "../UpgradeNotice";
import { loadCatalog, money } from "@/lib/catalog";
import { ReportsExport } from "./ReportsExport";

type ReportOrderRow = {
  team_name: string;
  status: string;
  shipping_fee: number | null;
  discount: number | null;
  created_at: string;
  order_items: { item: string; qty: number; line_total: number | null }[] | null;
};

// lastOrderDate is a real timestamp -- shown in Texas time regardless of
// what timezone the server happens to run in.
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { timeZone: "America/Chicago" });
}

// created_at is a UTC timestamp string -- slicing it directly would put a
// late-evening Texas order in the wrong month right at a month boundary.
// en-CA renders as YYYY-MM, so this reads out the Texas-local month
// without ever constructing a shifted Date.
function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
  });
}

export default async function ReportsPage() {
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
    .select("role, company_id, platform_admin")
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
          Only a manager can view reports.
        </div>
      </main>
    );
  }

  // Plan gate. The database enforces this too (has_feature in 0037) --
  // that's what actually stops a request that never loads this page.
  // This is here so the shop gets an explanation of what they'd be
  // buying instead of a screen that silently comes back empty.
  const plan = await loadCompanyPlan(supabase, profile?.company_id ?? "");
  plan.isPlatformAdmin = profile?.platform_admin === true;
  if (!planAllows(plan, "costs")) {
    return (
      <UpgradeNotice
        feature="costs"
        isOwner={profile?.role === "super_admin"}
      />
    );
  }

  const [{ data: orders }, catalog] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `team_name, status, shipping_fee, discount, created_at,
         order_items(item, qty, line_total)`,
      ),
    loadCatalog(supabase, profile?.company_id ?? ""),
  ]);

  const active = ((orders ?? []) as ReportOrderRow[]).filter(
    (o) => o.status !== "draft" && o.status !== "cancelled",
  );

  const withTotals = active.map((o) => {
    const revenue =
      (o.order_items ?? []).reduce((s, li) => s + Number(li.line_total ?? 0), 0) +
      Number(o.shipping_fee ?? 0) -
      Number(o.discount ?? 0);
    const pieces = (o.order_items ?? []).reduce((s, li) => s + (li.qty ?? 0), 0);
    return { ...o, revenue, pieces };
  });

  const totalRevenue = withTotals.reduce((s, o) => s + o.revenue, 0);
  const totalOrders = withTotals.length;
  const totalPieces = withTotals.reduce((s, o) => s + o.pieces, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const avgPieces = totalOrders > 0 ? totalPieces / totalOrders : 0;

  const monthMap = new Map<
    string,
    { month: string; orderCount: number; revenue: number; pieces: number }
  >();
  withTotals.forEach((o) => {
    const month = monthKey(o.created_at);
    const existing = monthMap.get(month);
    if (existing) {
      existing.orderCount += 1;
      existing.revenue += o.revenue;
      existing.pieces += o.pieces;
    } else {
      monthMap.set(month, { month, orderCount: 1, revenue: o.revenue, pieces: o.pieces });
    }
  });
  const months = Array.from(monthMap.values()).sort((a, b) =>
    b.month.localeCompare(a.month),
  );

  const itemMap = new Map<string, { item: string; category: string; qty: number; revenue: number }>();
  withTotals.forEach((o) => {
    (o.order_items ?? []).forEach((li) => {
      const category = catalog[li.item]?.category ?? "Uncategorized";
      const existing = itemMap.get(li.item);
      if (existing) {
        existing.qty += li.qty ?? 0;
        existing.revenue += Number(li.line_total ?? 0);
      } else {
        itemMap.set(li.item, {
          item: li.item,
          category,
          qty: li.qty ?? 0,
          revenue: Number(li.line_total ?? 0),
        });
      }
    });
  });
  const items = Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty);

  const customerMap = new Map<
    string,
    { teamName: string; orderCount: number; totalSpent: number; lastOrderDate: string | null }
  >();
  withTotals.forEach((o) => {
    const existing = customerMap.get(o.team_name);
    if (existing) {
      existing.orderCount += 1;
      existing.totalSpent += o.revenue;
      if (!existing.lastOrderDate || o.created_at > existing.lastOrderDate) {
        existing.lastOrderDate = o.created_at;
      }
    } else {
      customerMap.set(o.team_name, {
        teamName: o.team_name,
        orderCount: 1,
        totalSpent: o.revenue,
        lastOrderDate: o.created_at,
      });
    }
  });
  const customers = Array.from(customerMap.values()).sort(
    (a, b) => b.totalSpent - a.totalSpent,
  );

  const summary = { totalRevenue, totalOrders, totalPieces, avgOrderValue, avgPieces };

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Reports</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Trends across every real order (drafts and cancelled orders excluded).
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            Total revenue
          </div>
          <div className="font-mono text-lg font-bold text-black">
            {money(totalRevenue)}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            Total orders
          </div>
          <div className="font-mono text-lg font-bold text-black">
            {totalOrders}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            Avg order value
          </div>
          <div className="font-mono text-lg font-bold text-black">
            {money(avgOrderValue)}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            Avg pieces / order
          </div>
          <div className="font-mono text-lg font-bold text-black">
            {avgPieces.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="mb-5">
        <ReportsExport summary={summary} months={months} items={items} customers={customers} />
      </div>

      {months.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-black">By month</h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            {months.map((m, i) => (
              <div
                key={m.month}
                className={`flex items-center justify-between px-3 py-2 text-sm ${i > 0 ? "border-t border-neutral-100" : ""}`}
              >
                <span className="font-medium text-black">{m.month}</span>
                <span className="text-xs text-neutral-500">
                  {m.orderCount} order{m.orderCount === 1 ? "" : "s"} ·{" "}
                  {m.pieces} pcs
                </span>
                <span className="font-mono font-semibold text-black">
                  {money(m.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-black">
            Top items by quantity
          </h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            {items.slice(0, 15).map((it, i) => (
              <div
                key={it.item}
                className={`flex items-center justify-between px-3 py-2 text-sm ${i > 0 ? "border-t border-neutral-100" : ""}`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-black">{it.item}</div>
                  <div className="text-[11px] text-neutral-400">{it.category}</div>
                </div>
                <span className="font-mono font-semibold text-black">
                  {it.qty} sold
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {customers.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-black">
            Top customers by spend
          </h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            {customers.slice(0, 10).map((c, i) => (
              <Link
                key={c.teamName}
                href={`/orders?q=${encodeURIComponent(c.teamName)}`}
                className={`flex items-center justify-between px-3 py-2 text-sm ${i > 0 ? "border-t border-neutral-100" : ""}`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-black">{c.teamName}</div>
                  <div className="text-[11px] text-neutral-400">
                    {c.orderCount} order{c.orderCount === 1 ? "" : "s"} · last{" "}
                    {fmtDate(c.lastOrderDate)}
                  </div>
                </div>
                <span className="font-mono font-semibold text-black">
                  {money(c.totalSpent)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
