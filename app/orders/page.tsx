import Link from "next/link";
import { requireViewerContext } from "@/lib/adminAssist";
import { loadCatalog } from "@/lib/catalog";
import { OrderBoard, type OrderRow } from "./OrderBoard";

type OrderItemRow = {
  item: string;
  mods: string[] | null;
  qty: number;
  unit_price: number | null;
  line_total: number | null;
  order_item_sizes:
    | {
        size_label: string;
        qty: number;
        order_item_size_names:
          | { player_name: string | null; player_number: string | null }[]
          | null;
      }[]
    | null;
  order_item_costs:
    | { unit_cost: number | null; vendors: VendorRef }
    | { unit_cost: number | null; vendors: VendorRef }[]
    | null;
};
type PaymentRow = { amount: number };
type VendorRef = { name: string } | { name: string }[] | null;
type OrderCostRow = {
  shipping_cost: number | null;
  supplies_cost: number | null;
  vendors: VendorRef;
};

// order_item_costs is a one-to-one relation (order_item_id is its primary
// key) but PostgREST still returns embedded one-to-ones as either a
// single object or a one-element array depending on version/query shape
// -- normalize both to a single value here rather than at every call site.
function one<T>(rel: T | T[] | null): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}
type ProfileRef = { full_name: string | null } | { full_name: string | null }[] | null;

function repName(profiles: ProfileRef): string {
  if (!profiles) return "—";
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return profile?.full_name ?? "—";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; draft?: string; q?: string; company?: string }>;
}) {
  const { created, draft, q, company: asCompany } = await searchParams;
  const ctx = await requireViewerContext(asCompany ?? null);

  if (!ctx) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Not signed in, or no company to show orders for.
        </div>
      </main>
    );
  }
  const { supabase, companyId, isAssisting } = ctx;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = !isAssisting
    ? await supabase.from("profiles").select("role").eq("id", user!.id).single()
    : { data: null };
  const isManager = isAssisting || profile?.role === "manager" || profile?.role === "super_admin";

  const { data: assistingCompany } = isAssisting
    ? await supabase.from("companies").select("name").eq("id", companyId).single()
    : { data: null };

  // Visiting the board is "I've seen what's here" -- bumps orders_viewed_at
  // so the home page's "N new orders" banner clears. Serverless functions
  // can get torn down right after the response ships, so this is awaited
  // (alongside the orders query, not blocking on it) rather than fired and
  // forgotten. Skipped while assisting -- that field belongs to the
  // platform admin's own profile, which has no company of its own to have
  // "viewed" anything for.
  const [{ data: orders }, catalog] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, order_number, team_name, sport, contact_name, contact_phone,
         status, revision_requested, deadline, shipping_fee, shipping_address,
         discount, notes, created_at, updated_at,
         profiles(full_name),
         order_items(item, mods, qty, unit_price, line_total,
           order_item_sizes(size_label, qty,
             order_item_size_names(player_name, player_number)),
           order_item_costs(unit_cost, vendors(name))),
         order_costs(shipping_cost, supplies_cost, vendors(name)),
         payments(amount)`,
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    loadCatalog(supabase, companyId),
    isManager && user && !isAssisting
      ? supabase
          .from("profiles")
          .update({ orders_viewed_at: new Date().toISOString() })
          .eq("id", user.id)
      : Promise.resolve(null),
  ]);

  // Cost/vendor data only ever comes back non-empty for a manager -- RLS
  // on order_item_costs/order_costs is manager-only, so a rep's embedded
  // relations here are just always empty, same as if we hadn't asked.
  const rows: OrderRow[] = (orders ?? []).map((o) => {
    const items = (o.order_items ?? []) as OrderItemRow[];
    const payments = (o.payments ?? []) as PaymentRow[];
    const subtotal = items.reduce((s, li) => s + Number(li.line_total ?? 0), 0);
    const total =
      subtotal + Number(o.shipping_fee ?? 0) - Number(o.discount ?? 0);
    const paid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);

    const orderCost = one(o.order_costs as OrderCostRow | OrderCostRow[] | null);
    const shippingCost =
      orderCost?.shipping_cost != null ? Number(orderCost.shipping_cost) : null;
    const suppliesCost =
      orderCost?.supplies_cost != null ? Number(orderCost.supplies_cost) : null;
    const orderVendorName = one(orderCost?.vendors ?? null)?.name ?? null;

    const itemCosts = items.map((li) => {
      const cost = one(li.order_item_costs);
      const unitCost = cost?.unit_cost != null ? Number(cost.unit_cost) : null;
      const isHeadwear = catalog[li.item]?.isHeadwear ?? false;
      const lineVendorName = one(cost?.vendors ?? null)?.name ?? null;
      const vendorName = lineVendorName ?? (isHeadwear ? null : orderVendorName);
      return { unitCost, vendorName };
    });
    const hasAnyCost =
      itemCosts.some((c) => c.unitCost != null) ||
      shippingCost != null ||
      suppliesCost != null;
    const totalCost =
      items.reduce((s, li, i) => {
        const c = itemCosts[i].unitCost;
        return c != null ? s + c * li.qty : s;
      }, 0) +
      (shippingCost ?? 0) +
      (suppliesCost ?? 0);

    return {
      id: o.id,
      orderNumber: o.order_number,
      teamName: o.team_name,
      sport: o.sport ?? "",
      contactName: o.contact_name ?? "",
      contactPhone: o.contact_phone ?? "",
      status: o.status,
      revisionRequested: o.revision_requested,
      deadline: o.deadline,
      shippingAddress: o.shipping_address ?? "",
      repName: repName(o.profiles as ProfileRef),
      itemNames: items.map((li) => li.item),
      qty: items.reduce((s, li) => s + (li.qty ?? 0), 0),
      subtotal,
      shippingFee: Number(o.shipping_fee ?? 0),
      discount: Number(o.discount ?? 0),
      total,
      paid,
      balanceDue: total - paid,
      notes: o.notes ?? "",
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      shippingCost,
      suppliesCost,
      totalCost: hasAnyCost ? totalCost : null,
      profit: hasAnyCost ? total - totalCost : null,
      items: items.map((li, i) => ({
        item: li.item,
        vendorName: itemCosts[i].vendorName,
        unitCost: itemCosts[i].unitCost,
        lineCost: itemCosts[i].unitCost != null ? itemCosts[i].unitCost! * li.qty : null,
        lineProfit:
          itemCosts[i].unitCost != null
            ? Number(li.line_total ?? 0) - itemCosts[i].unitCost! * li.qty
            : null,
        modLabels: (li.mods ?? []).map(
          (key) =>
            catalog[li.item]?.modifiers.find((m) => m.key === key)?.label ?? key,
        ),
        sizes: (li.order_item_sizes ?? []).map((sz) => ({
          label: sz.size_label,
          qty: sz.qty,
          names: (sz.order_item_size_names ?? []).map((n) => ({
            name: n.player_name ?? "",
            number: n.player_number ?? "",
          })),
        })),
        qty: li.qty,
        unitPrice: Number(li.unit_price ?? 0),
        lineTotal: Number(li.line_total ?? 0),
      })),
    };
  });

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      {isAssisting && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>Assisting: {assistingCompany?.name ?? asCompany}</span>
          <Link href="/admin/companies" className="underline">
            Exit
          </Link>
        </div>
      )}
      {created && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Order #{created} submitted.
        </div>
      )}
      {draft && (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          Order #{draft} saved as a draft — only you can see it until you submit it.
        </div>
      )}
      <OrderBoard
        orders={rows}
        isManager={isManager}
        initialQuery={q ?? ""}
        asCompany={asCompany ?? null}
      />
    </main>
  );
}
