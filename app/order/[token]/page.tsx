import { createAdminClient } from "@/lib/supabase/admin";
import { SIZES_BY_GROUP, isSizeGroup } from "@/lib/sizes";
import { loadShopInfo } from "@/lib/shopInfo";
import { ShopInfoBlock } from "@/app/ShopInfoBlock";
import { CustomerOrderForm, type CustomerCatalogItem } from "./CustomerOrderForm";

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Resolved with the service-role client -- whoever opens this link has
  // no account and no session, so there's no RLS context to read by.
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("order_links")
    .select("company_id, active")
    .eq("token", token)
    .maybeSingle();

  const { data: company } = link
    ? await admin
        .from("companies")
        .select("name, active")
        .eq("id", link.company_id)
        .single()
    : { data: null };

  if (!link || !link.active || !company?.active) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12 text-center">
        <div className="w-full max-w-sm">
          <h1 className="font-script mb-3 text-4xl text-black">Order Desk</h1>
          <p className="text-sm text-neutral-500">
            This order link isn&apos;t active anymore. Ask whoever sent it to
            you for a new one.
          </p>
        </div>
      </main>
    );
  }

  // Shown above the form, not below it: payment terms and turnaround are
  // what a customer wants to know BEFORE filling anything out, and this
  // shop's own price sheet leads with them.
  const shopInfo = await loadShopInfo(admin, link.company_id);

  const [{ data: items }, { data: mods }] = await Promise.all([
    admin
      .from("price_items")
      .select("name, base_price, size_group, sort_order")
      .eq("company_id", link.company_id)
      .eq("active", true)
      .order("sort_order"),
    admin
      .from("price_modifiers")
      .select("item_name, key, label, price")
      .eq("company_id", link.company_id)
      .order("label"),
  ]);

  const catalog: CustomerCatalogItem[] = (items ?? []).map((item) => {
    const group = isSizeGroup(item.size_group) ? item.size_group : "one_size";
    return {
      name: item.name,
      basePrice: Number(item.base_price),
      sizes: SIZES_BY_GROUP[group],
      addOns: (mods ?? [])
        .filter((m) => m.item_name === item.name)
        .map((m) => ({ key: m.key, label: m.label, price: Number(m.price) })),
    };
  });

  return (
    <main className="mx-auto max-w-lg px-5 py-8">
      <div className="mb-6 text-center">
        <h1 className="font-script text-4xl leading-tight text-black">
          {company.name}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Start your team order</p>
      </div>

      <ShopInfoBlock info={shopInfo} className="mb-6" />

      {catalog.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          This shop hasn&apos;t set up their item list yet. Check back soon.
        </div>
      ) : (
        <CustomerOrderForm token={token} catalog={catalog} />
      )}
    </main>
  );
}
