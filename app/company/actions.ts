"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string } | null;

async function requireSuperAdmin() {
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

  if (profile?.role !== "super_admin") return null;
  return { supabase, userId: user.id };
}

export async function addPartner(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  if (!actor) return { ok: false, message: "Only the account owner can do this." };

  const name = String(formData.get("name") ?? "").trim();
  const percentRaw = String(formData.get("percent") ?? "").trim();
  const percent = Number(percentRaw);
  if (!name) return { ok: false, message: "Enter a name." };
  if (isNaN(percent) || percent < 0 || percent > 100) {
    return { ok: false, message: "Enter a percent between 0 and 100." };
  }

  const { error } = await actor.supabase.from("partner_splits").insert({ name, percent });
  if (error) return { ok: false, message: "Could not add partner." };

  revalidatePath("/company");
  return { ok: true, message: `${name} added.` };
}

export async function updatePartner(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  if (!actor) return { ok: false, message: "Only the account owner can do this." };

  const id = String(formData.get("id") ?? "");
  const percentRaw = String(formData.get("percent") ?? "").trim();
  const percent = Number(percentRaw);
  if (isNaN(percent) || percent < 0 || percent > 100) {
    return { ok: false, message: "Enter a percent between 0 and 100." };
  }

  const { error } = await actor.supabase
    .from("partner_splits")
    .update({ percent })
    .eq("id", id);
  if (error) return { ok: false, message: "Could not save." };

  revalidatePath("/company");
  return { ok: true, message: "Saved." };
}

export async function setPartnerActive(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  if (!actor) return { ok: false, message: "Only the account owner can do this." };

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";

  const { error } = await actor.supabase
    .from("partner_splits")
    .update({ active })
    .eq("id", id);
  if (error) return { ok: false, message: "Could not update." };

  revalidatePath("/company");
  return { ok: true, message: active ? "Restored." : "Removed." };
}

export async function recordVendorPayment(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  if (!actor) return { ok: false, message: "Only the account owner can do this." };

  const vendorId = String(formData.get("vendorId") ?? "");
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();
  if (!amount || amount <= 0) {
    return { ok: false, message: "Enter a payment amount." };
  }

  const { error } = await actor.supabase.from("vendor_payments").insert({
    vendor_id: vendorId,
    amount,
    note: note || null,
    recorded_by: actor.userId,
  });
  if (error) return { ok: false, message: "Could not record payment." };

  revalidatePath("/company");
  return { ok: true, message: "Payment recorded." };
}
