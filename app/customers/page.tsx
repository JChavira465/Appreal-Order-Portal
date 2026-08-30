import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/catalog";

type CustomerOrderRow = {
  status: string;
  shipping_fee: number | null;
  discount: number | null;
  created_at: string;
  order_items: { line_total: number | null }[] | null;
};

type CustomerRow = {
  id: string;
  team_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  sport: string | null;
  orders: CustomerOrderRow[] | null;
};

// lastOrderDate is a real timestamp (an order's created_at) -- shown in
// Texas time regardless of what timezone the server happens to run in.
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { timeZone: "America/Chicago" });
}

// A team that hasn't ordered in ~6 months is worth a follow-up call, not
// just a stat -- this turns the last-order date already tracked here into
// an actual win-back list.
const INACTIVE_DAYS = 180;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export default async function CustomersPage() {
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
          Only a manager can view customers.
        </div>
      </main>
    );
  }

  const { data: customers } = await supabase
    .from("customers")
    .select(
      `id, team_name, contact_name, contact_phone, sport,
       orders(status, shipping_fee, discount, created_at,
         order_items(line_total))`,
    )
    .order("team_name");

  const rows = ((customers ?? []) as CustomerRow[])
    .map((c) => {
      const activeOrders = (c.orders ?? []).filter(
        (o) => o.status !== "draft" && o.status !== "cancelled",
      );
      const totalSpent = activeOrders.reduce((sum, o) => {
        const subtotal = (o.order_items ?? []).reduce(
          (s, li) => s + Number(li.line_total ?? 0),
          0,
        );
        return (
          sum + subtotal + Number(o.shipping_fee ?? 0) - Number(o.discount ?? 0)
        );
      }, 0);
      const lastOrderDate = (c.orders ?? []).reduce<string | null>(
        (latest, o) =>
          !latest || o.created_at > latest ? o.created_at : latest,
        null,
      );
      return {
        id: c.id,
        teamName: c.team_name,
        contactName: c.contact_name ?? "",
        contactPhone: c.contact_phone ?? "",
        sport: c.sport ?? "",
        orderCount: activeOrders.length,
        totalSpent,
        lastOrderDate,
      };
    })
    .filter((c) => c.orderCount > 0)
    .sort((a, b) => b.totalSpent - a.totalSpent);

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Customers</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Every team that has a real order on file, ranked by total spend.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          No customers yet.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/orders?q=${encodeURIComponent(c.teamName)}`}
              className="block rounded-xl border border-neutral-200 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-bold text-black">
                    {c.teamName}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {c.sport || "—"}
                    {c.contactName && ` · ${c.contactName}`}
                    {c.contactPhone && ` · ${c.contactPhone}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-bold text-black">
                    {money(c.totalSpent)}
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    {c.orderCount} order{c.orderCount === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-400">
                <span>Last order {fmtDate(c.lastOrderDate)}</span>
                {(daysSince(c.lastOrderDate) ?? 0) >= INACTIVE_DAYS && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold uppercase tracking-wide text-amber-700">
                    No order in {Math.floor((daysSince(c.lastOrderDate) ?? 0) / 30)}mo
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
