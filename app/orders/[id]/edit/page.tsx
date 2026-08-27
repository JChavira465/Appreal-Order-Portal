import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCatalog } from "@/lib/catalog";
import { OrderForm, type OrderFormInitial } from "../../OrderForm";

export default async function EditOrderPage({
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

  const [{ data: order }, catalog, { data: customers }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, team_name, contact_name, contact_phone, sport, deadline,
         shipping_fee, shipping_address, notes, ref_notes, status, rep_id,
         order_items(item, mods, qty,
           order_item_sizes(size_label, qty,
             order_item_size_names(player_name, player_number, sort_order)))`,
      )
      .eq("id", id)
      .maybeSingle(),
    loadCatalog(supabase),
    supabase
      .from("customers")
      .select("id, team_name, contact_name, contact_phone, sport, shipping_address")
      .order("team_name"),
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

  const isOwnRep = order.rep_id === user.id;
  const canEdit = isManager
    ? order.status !== "cancelled"
    : isOwnRep && order.status === "submitted";

  if (!canEdit) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href={`/orders/${order.id}`} className="text-sm text-neutral-500">
          ← Back
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          This order can&apos;t be edited right now.
        </div>
      </main>
    );
  }

  const initial: OrderFormInitial = {
    teamName: order.team_name,
    contactName: order.contact_name ?? "",
    contactPhone: order.contact_phone ?? "",
    sport: order.sport ?? "",
    deadline: order.deadline ?? "",
    notes: order.notes ?? "",
    refNotes: order.ref_notes ?? "",
    shippingFee: order.shipping_fee != null ? String(order.shipping_fee) : "",
    shippingAddress: order.shipping_address ?? "",
    items: (order.order_items ?? []).map((li) => ({
      item: li.item,
      mods: li.mods ?? [],
      sizes: (li.order_item_sizes ?? []).map(
        (sz: {
          size_label: string;
          qty: number;
          order_item_size_names:
            | { player_name: string | null; player_number: string | null; sort_order: number }[]
            | null;
        }) => ({
          label: sz.size_label,
          qty: String(sz.qty),
          names: [...(sz.order_item_size_names ?? [])]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((n) => ({
              name: n.player_name ?? "",
              number: n.player_number ?? "",
            })),
        }),
      ),
    })),
  };

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href={`/orders/${order.id}`} className="text-xs text-neutral-400 underline">
        ← Back to order
      </Link>
      <OrderForm
        catalog={catalog}
        customers={customers ?? []}
        mode="edit"
        orderId={order.id}
        initial={initial}
      />
    </main>
  );
}
