import Link from "next/link";
import { requireViewerContext } from "@/lib/adminAssist";
import { isSizeGroup } from "@/lib/sizes";
import { AddPriceItemForm } from "./AddPriceItemForm";
import { PriceItemCard } from "./PriceItemCard";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company: asCompany } = await searchParams;
  const ctx = await requireViewerContext(asCompany ?? null);

  if (!ctx) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/home" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Not signed in, or no company to show pricing for.
        </div>
      </main>
    );
  }
  const { supabase, companyId, isAssisting } = ctx;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  const isManager =
    isAssisting ||
    profile?.role === "manager" ||
    profile?.role === "super_admin";

  if (!isManager) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/home" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Only a manager can edit pricing.
        </div>
      </main>
    );
  }

  const [{ data: company }, { data: items }, { data: modifiers }] =
    await Promise.all([
      isAssisting
        ? supabase.from("companies").select("name").eq("id", companyId).single()
        : Promise.resolve({ data: null }),
      supabase
        .from("price_items")
        .select("name, base_price, is_headwear, size_group, category, active, sort_order")
        .eq("company_id", companyId)
        .order("sort_order"),
      supabase
        .from("price_modifiers")
        .select("item_name, key, label, price")
        .eq("company_id", companyId)
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
      <Link href="/home" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>

      {isAssisting && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>Assisting: {company?.name ?? asCompany}</span>
          <Link href="/admin/companies" className="underline">
            Exit
          </Link>
        </div>
      )}

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
        <AddPriceItemForm asCompany={asCompany ?? null} />
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
            asCompany={asCompany ?? null}
          />
        ))}
      </div>
    </main>
  );
}
