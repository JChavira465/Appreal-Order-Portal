import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
};
type PaymentRow = { amount: number };
type ProfileRef = { full_name: string | null } | { full_name: string | null }[] | null;

function repName(profiles: ProfileRef): string {
  if (!profiles) return "—";
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return profile?.full_name ?? "—";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const isManager =
    profile?.role === "manager" || profile?.role === "super_admin";

  const [{ data: orders }, catalog] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, order_number, team_name, sport, contact_name, contact_phone,
         status, revision_requested, deadline, shipping_fee, shipping_address,
         discount, notes, ref_notes, created_at, updated_at,
         profiles(full_name),
         order_items(item, mods, qty, unit_price, line_total,
           order_item_sizes(size_label, qty,
             order_item_size_names(player_name, player_number))),
         payments(amount)`,
      )
      .order("created_at", { ascending: false }),
    loadCatalog(supabase),
  ]);

  const rows: OrderRow[] = (orders ?? []).map((o) => {
    const items = (o.order_items ?? []) as OrderItemRow[];
    const payments = (o.payments ?? []) as PaymentRow[];
    const subtotal = items.reduce((s, li) => s + Number(li.line_total ?? 0), 0);
    const total =
      subtotal + Number(o.shipping_fee ?? 0) - Number(o.discount ?? 0);
    const paid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);

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
      refNotes: o.ref_notes ?? "",
      notes: o.notes ?? "",
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      items: items.map((li) => ({
        item: li.item,
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
      {created && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Order #{created} submitted.
        </div>
      )}
      <OrderBoard orders={rows} isManager={isManager} />
    </main>
  );
}
