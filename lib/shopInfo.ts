import type { SupabaseClient } from "@supabase/supabase-js";

export type ShopInfo = {
  paymentTerms: string | null;
  turnaroundTime: string | null;
  taxShippingNote: string | null;
};

export const EMPTY_SHOP_INFO: ShopInfo = {
  paymentTerms: null,
  turnaroundTime: null,
  taxShippingNote: null,
};

export function hasShopInfo(info: ShopInfo): boolean {
  return Boolean(
    info.paymentTerms || info.turnaroundTime || info.taxShippingNote,
  );
}

// Same reasoning as loadCatalog: the platform admin bypasses RLS
// entirely, so the explicit company filter is load-bearing for that
// account rather than a redundant belt on top of the policy.
export async function loadShopInfo(
  supabase: SupabaseClient,
  companyId: string,
): Promise<ShopInfo> {
  if (!companyId) return EMPTY_SHOP_INFO;

  const { data, error } = await supabase
    .from("company_settings")
    .select("payment_terms, turnaround_time, tax_shipping_note")
    .eq("company_id", companyId)
    .maybeSingle();

  // A shop that simply hasn't filled this in yet is the normal case, not
  // an error -- but a missing migration or column looks identical from
  // here (empty block, no explanation), so say so out loud.
  if (error) console.error("loadShopInfo: query failed", error);

  return {
    paymentTerms: data?.payment_terms ?? null,
    turnaroundTime: data?.turnaround_time ?? null,
    taxShippingNote: data?.tax_shipping_note ?? null,
  };
}
