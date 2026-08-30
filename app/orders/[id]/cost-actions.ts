"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string } | null;

// Cost/vendor data is manager-only (see supabase/migrations/0008_vendors_and_costs.sql)
// and deliberately never touches activity_log, which reps can read for their
// own orders -- logging a cost change there would leak that costs exist even
// without showing the amount.
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

export async function setLineCost(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await requireManager();
  if (!supabase) return { ok: false, message: "Only a manager can set cost." };

  const orderId = String(formData.get("orderId") ?? "");
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const vendorId = String(formData.get("vendorId") ?? "").trim();
  const unitCostRaw = String(formData.get("unitCost") ?? "").trim();
  const unitCost = unitCostRaw === "" ? null : Number(unitCostRaw);

  if (unitCost !== null && (isNaN(unitCost) || unitCost < 0)) {
    return { ok: false, message: "Enter a valid unit cost." };
  }

  const { error } = await supabase.from("order_item_costs").upsert({
    order_item_id: orderItemId,
    vendor_id: vendorId || null,
    unit_cost: unitCost,
  });
  if (error) return { ok: false, message: "Could not save cost." };

  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Cost saved." };
}

// Covers both order_costs columns in one save -- the whole order goes to
// one apparel manufacturer (hat lines use their own vendor via
// setLineCost instead), and shipping is a single per-order estimate.
export async function setOrderCosts(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await requireManager();
  if (!supabase) return { ok: false, message: "Only a manager can set cost." };

  const orderId = String(formData.get("orderId") ?? "");
  const manufacturerId = String(formData.get("manufacturerId") ?? "").trim();
  const shippingCostRaw = String(formData.get("shippingCost") ?? "").trim();
  const shippingCost = shippingCostRaw === "" ? null : Number(shippingCostRaw);
  const suppliesCostRaw = String(formData.get("suppliesCost") ?? "").trim();
  const suppliesCost = suppliesCostRaw === "" ? null : Number(suppliesCostRaw);
  const vendorReadyBy = String(formData.get("vendorReadyBy") ?? "").trim();

  if (shippingCost !== null && (isNaN(shippingCost) || shippingCost < 0)) {
    return { ok: false, message: "Enter a valid shipping cost." };
  }
  if (suppliesCost !== null && (isNaN(suppliesCost) || suppliesCost < 0)) {
    return { ok: false, message: "Enter a valid supplies cost." };
  }

  const { error } = await supabase.from("order_costs").upsert({
    order_id: orderId,
    manufacturer_id: manufacturerId || null,
    shipping_cost: shippingCost,
    supplies_cost: suppliesCost,
    vendor_ready_by: vendorReadyBy || null,
  });
  if (error) return { ok: false, message: "Could not save order costs." };

  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Saved." };
}
