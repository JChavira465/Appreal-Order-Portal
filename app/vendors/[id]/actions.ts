"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string } | null;

async function requireManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "manager" && profile?.role !== "super_admin") {
    return null;
  }
  return supabase;
}

export async function setVendorItemCost(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await requireManager();
  if (!supabase) return { ok: false, message: "Only a manager can set prices." };

  const vendorId = String(formData.get("vendorId") ?? "");
  const item = String(formData.get("item") ?? "");
  const unitCostRaw = String(formData.get("unitCost") ?? "").trim();

  if (unitCostRaw === "") {
    const { error } = await supabase
      .from("vendor_item_costs")
      .delete()
      .eq("vendor_id", vendorId)
      .eq("item", item);
    if (error) return { ok: false, message: "Could not clear price." };
    revalidatePath(`/vendors/${vendorId}`);
    return { ok: true, message: "Cleared." };
  }

  const unitCost = Number(unitCostRaw);
  if (isNaN(unitCost) || unitCost < 0) {
    return { ok: false, message: "Enter a valid price." };
  }

  const { error } = await supabase
    .from("vendor_item_costs")
    .upsert({ vendor_id: vendorId, item, unit_cost: unitCost });
  if (error) return { ok: false, message: "Could not save price." };

  revalidatePath(`/vendors/${vendorId}`);
  return { ok: true, message: "Saved." };
}
