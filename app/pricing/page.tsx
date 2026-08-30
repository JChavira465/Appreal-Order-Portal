import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSizeGroup } from "@/lib/sizes";
import { AddPriceItemForm } from "./AddPriceItemForm";
import { PriceItemCard } from "./PriceItemCard";

export default async function PricingPage() {
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
          Only a manager can edit pricing.
        </div>
      </main>
    );
  }

  const [{ data: items }, { data: modifiers }] = await Promise.all([
    supabase
      .from("price_items")
      .select("name, base_price, is_headwear, size_group, category, active, sort_order")
      .order("sort_order"),
    supabase
      .from("price_modifiers")
      .select("item_name, key, label, price")
      .order("label"),
  ]);

  const modsByItem = new Map<string, { key: string; label: string; price: number }[]>();
  for (const m of modifiers ?? []) {
    const list = modsByItem.get(m.item_name) ?? [];
    list.push({ key: m.key, label: m.label, price: Number(m.price) });
    modsByItem.set(m.item_name, list);
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Pricing</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Changes apply to new orders only. Orders already submitted keep the
        price they were quoted at.
      </p>

      <datalist id="category-suggestions">
        <option value="JERSEY" />
        <option value="HOODIE" />
        <option value="BOTTOMS" />
        <option value="JACKET" />
        <option value="HAT" />
        <option value="GLOVES" />
        <option value="SPECIALTY" />
      </datalist>

      <div className="mb-6">
        <AddPriceItemForm />
      </div>

      <div className="space-y-3">
        {(items ?? []).map((item) => (
          <PriceItemCard
            key={item.name}
            name={item.name}
            basePrice={Number(item.base_price)}
            isHeadwear={item.is_headwear}
            category={item.category}
            active={item.active}
            sizeGroup={isSizeGroup(item.size_group) ? item.size_group : "one_size"}
            modifiers={modsByItem.get(item.name) ?? []}
          />
        ))}
      </div>
    </main>
  );
}
