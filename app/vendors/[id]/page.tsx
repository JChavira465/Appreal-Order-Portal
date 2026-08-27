import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VendorItemCostRow } from "./VendorItemCostRow";

const KIND_LABEL: Record<string, string> = {
  apparel: "Apparel manufacturer",
  hat: "Hat vendor",
};

export default async function VendorDetailPage({
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

  if (!isManager) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/vendors" className="text-xs text-neutral-400 underline">
          ← Vendors
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Only a manager can view vendor pricing.
        </div>
      </main>
    );
  }

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id, name, kind")
    .eq("id", id)
    .maybeSingle();

  if (!vendor) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/vendors" className="text-xs text-neutral-400 underline">
          ← Vendors
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Vendor not found.
        </div>
      </main>
    );
  }

  // Apparel manufacturers price non-headwear items; hat vendors price
  // headwear items only -- matches the order-level manufacturer + per-line
  // hat vendor split (see supabase/migrations/0011).
  const [{ data: items }, { data: costs }] = await Promise.all([
    supabase
      .from("price_items")
      .select("name, is_headwear")
      .eq("active", true)
      .eq("is_headwear", vendor.kind === "hat")
      .order("sort_order"),
    supabase
      .from("vendor_item_costs")
      .select("item, unit_cost")
      .eq("vendor_id", vendor.id),
  ]);

  const costByItem = new Map<string, number>();
  for (const c of costs ?? []) {
    costByItem.set(c.item, Number(c.unit_cost));
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/vendors" className="text-xs text-neutral-400 underline">
        ← Vendors
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-bold text-black">{vendor.name}</h1>
      <p className="mb-5 text-sm text-neutral-500">
        {KIND_LABEL[vendor.kind] ?? vendor.kind} — set what this vendor
        charges per item. Prices here just pre-fill an order&rsquo;s line
        cost; they&rsquo;re always editable per order for a one-off discount.
      </p>

      {items && items.length > 0 ? (
        <div className="rounded-xl border border-neutral-200 px-4">
          {items.map((it) => (
            <VendorItemCostRow
              key={it.name}
              vendorId={vendor.id}
              item={it.name}
              unitCost={costByItem.get(it.name) ?? null}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          No {vendor.kind === "hat" ? "headwear" : "apparel"} items in the
          price list yet.
        </div>
      )}
    </main>
  );
}
