import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCatalog } from "@/lib/catalog";
import { OrderForm, type OrderFormInitial } from "../OrderForm";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ reorder?: string }>;
}) {
  const { reorder } = await searchParams;
  const supabase = await createClient();

  const [catalog, { data: customers }, { data: sourceOrder }] = await Promise.all([
    loadCatalog(supabase),
    supabase
      .from("customers")
      .select("id, team_name, contact_name, contact_phone, sport, shipping_address")
      .order("team_name"),
    reorder
      ? supabase
          .from("orders")
          .select(
            `team_name, contact_name, contact_phone, sport, shipping_address,
             order_items(item, mods, order_item_sizes(size_label, qty))`,
          )
          .eq("id", reorder)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // RLS already scopes the reorder source to an order this rep owns (or
  // any order for a manager) -- a stale/foreign/missing id just means no
  // prefill, not an error, so the form falls back to a blank order.
  const initial: OrderFormInitial | undefined = sourceOrder
    ? {
        teamName: sourceOrder.team_name,
        contactName: sourceOrder.contact_name ?? "",
        contactPhone: sourceOrder.contact_phone ?? "",
        sport: sourceOrder.sport ?? "",
        deadline: "",
        notes: "",
        shippingFee: "",
        shippingAddress: sourceOrder.shipping_address ?? "",
        items: (sourceOrder.order_items ?? []).map((li) => ({
          item: li.item,
          mods: li.mods ?? [],
          sizes: (li.order_item_sizes ?? []).map(
            (sz: { size_label: string; qty: number }) => ({
              label: sz.size_label,
              qty: String(sz.qty),
            }),
          ),
        })),
      }
    : undefined;

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      {initial && (
        <p className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          Reordering <b className="text-black">{initial.teamName}</b> — items
          and sizes carried over. Pick a new deadline below before submitting.
        </p>
      )}
      <OrderForm catalog={catalog} customers={customers ?? []} initial={initial} />
    </main>
  );
}
