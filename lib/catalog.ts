import type { SupabaseClient } from "@supabase/supabase-js";
import { type SizeGroup, isSizeGroup } from "./sizes";

export type PriceModifier = {
  key: string;
  label: string;
  price: number;
  groupKey: string | null;
  isDefault: boolean;
};

export type PriceItem = {
  name: string;
  basePrice: number;
  isHeadwear: boolean;
  category: string | null;
  sizeGroup: SizeGroup;
  modifiers: PriceModifier[];
};

export type Catalog = Record<string, PriceItem>;

export const HAT_MIN = 10;

export async function loadCatalog(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Catalog> {
  // is_platform_admin() bypasses RLS entirely, so a query with no explicit
  // company filter would return every company's catalog mixed together
  // for that account -- the .eq() below is load-bearing for that case,
  // not just a redundant belt-and-suspenders on top of RLS.
  const [
    { data: items, error: itemsError },
    { data: mods, error: modsError },
  ] = await Promise.all([
    supabase
      .from("price_items")
      .select("name, base_price, is_headwear, category, size_group, sort_order")
      .eq("active", true)
      .eq("company_id", companyId)
      .order("sort_order"),
    supabase
      .from("price_modifiers")
      .select("item_name, key, label, price, group_key, is_default")
      .eq("company_id", companyId),
  ]);

  // A silently-empty catalog looks like "no items exist" everywhere it's
  // used (New Order's item dropdown shows "No Options" with no other
  // sign anything's wrong) -- surface the real error instead so a
  // missing migration/column shows up immediately, not as a mystery.
  if (itemsError) console.error("loadCatalog: price_items query failed", itemsError);
  if (modsError) console.error("loadCatalog: price_modifiers query failed", modsError);

  const catalog: Catalog = {};
  for (const item of items ?? []) {
    catalog[item.name] = {
      name: item.name,
      basePrice: Number(item.base_price),
      isHeadwear: item.is_headwear,
      category: item.category ?? null,
      sizeGroup: isSizeGroup(item.size_group) ? item.size_group : "one_size",
      modifiers: [],
    };
  }
  for (const mod of mods ?? []) {
    catalog[mod.item_name]?.modifiers.push({
      key: mod.key,
      label: mod.label,
      price: Number(mod.price),
      groupKey: mod.group_key,
      isDefault: mod.is_default,
    });
  }
  return catalog;
}

export function unitPriceFor(
  catalog: Catalog,
  itemName: string,
  modKeys: string[],
): number {
  const item = catalog[itemName];
  if (!item) return 0;
  return (
    item.basePrice +
    item.modifiers
      .filter((m) => modKeys.includes(m.key))
      .reduce((sum, m) => sum + m.price, 0)
  );
}

export function money(n: number): string {
  return `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`;
}
