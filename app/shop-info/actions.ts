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

    // "Could not save. Try again." is the wrong answer to every cause
    // this actually has -- retrying a missing table forever is not a
    // recovery path. The overwhelmingly common one is 0036 not having
    // been run yet, which Postgres reports as an undefined table
    // (42P01) or, through PostgREST's schema cache, PGRST205. Name it,
    // because the fix is a migration and no amount of retrying is.
    //
    // This is a manager-only internal screen, so the raw message is
    // safe to show here and is the difference between a five-second
    // diagnosis and a support round-trip -- the exact swallowed-error
    // trap CLAUDE.md warns about.
    const missingTable =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /company_settings/i.test(error.message);

    return {
      ok: false,
      message: missingTable
        ? "Shop info isn't set up in the database yet — migration 0036 still needs to be run in Supabase."
        : `Could not save: ${error.message}`,
    };
  }

  revalidatePath(asCompany ? `/shop-info?company=${asCompany}` : "/shop-info");
  return { ok: true, message: "Saved — customers will see this on their order." };
}
