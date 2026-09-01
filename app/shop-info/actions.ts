"use server";

import { revalidatePath } from "next/cache";
import { requireManagerContext } from "@/lib/adminAssist";

export type ShopInfoResult = { ok: boolean; message: string } | null;

// Long enough for a real policy paragraph, short enough that this can't
// be used to park arbitrary volumes of text on a customer-facing page.
const MAX_FIELD_LENGTH = 500;

function clean(formData: FormData, field: string): string | null {
  const value = String(formData.get(field) ?? "").trim();
  return value ? value.slice(0, MAX_FIELD_LENGTH) : null;
}

export async function saveShopInfo(
  _prevState: ShopInfoResult,
  formData: FormData,
): Promise<ShopInfoResult> {
  const asCompany = String(formData.get("asCompany") ?? "") || null;
  const ctx = await requireManagerContext(asCompany);
  if (!ctx) return { ok: false, message: "Only a manager can edit shop info." };
  const { supabase, companyId } = ctx;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // company_id is set explicitly rather than left to its column default:
  // the default is current_company_id(), which is null for the platform
  // admin assisting a company, so relying on it would fail exactly in
  // the assist case this whole helper exists to support.
  const { error } = await supabase
    .from("company_settings")
    .upsert(
      {
        company_id: companyId,
        payment_terms: clean(formData, "paymentTerms"),
        turnaround_time: clean(formData, "turnaroundTime"),
        tax_shipping_note: clean(formData, "taxShippingNote"),
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      },
      { onConflict: "company_id" },
    );

  if (error) {
    console.error("saveShopInfo: upsert failed", error);
    return { ok: false, message: "Could not save. Try again." };
  }

  revalidatePath(asCompany ? `/shop-info?company=${asCompany}` : "/shop-info");
  return { ok: true, message: "Saved — customers will see this on their order." };
}
