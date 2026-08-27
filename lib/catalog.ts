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
  sizeGroup: SizeGroup;
  modifiers: PriceModifier[];
};

export type Catalog = Record<string, PriceItem>;

export const HAT_MIN = 10;

export async function loadCatalog(supabase: SupabaseClient): Promise<Catalog> {
  const [{ data: items }, { data: mods }] = await Promise.all([
    supabase
      .from("price_items")
      .select("name, base_price, is_headwear, size_group, sort_order")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("price_modifiers")
      .select("item_name, key, label, price, group_key, is_default"),
  ]);

  const catalog: Catalog = {};
  for (const item of items ?? []) {
    catalog[item.name] = {
      name: item.name,
      basePrice: Number(item.base_price),
      isHeadwear: item.is_headwear,
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
