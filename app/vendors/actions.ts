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

export async function addVendor(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await requireManager();
  if (!supabase) return { ok: false, message: "Only a manager can add vendors." };

  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "apparel");
  const kind = kindRaw === "hat" ? "hat" : "apparel";
  if (!name) return { ok: false, message: "Enter a vendor name." };

  const { data: existing } = await supabase
    .from("vendors")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (existing) return { ok: false, message: "That vendor already exists." };

  const { error } = await supabase.from("vendors").insert({ name, kind });
  if (error) return { ok: false, message: "Could not add vendor." };

  revalidatePath("/vendors");
  return { ok: true, message: `${name} added.` };
}

export async function setVendorActive(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await requireManager();
  if (!supabase) return { ok: false, message: "Only a manager can edit vendors." };

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("vendors").update({ active }).eq("id", id);
  if (error) return { ok: false, message: "Could not update vendor." };

  revalidatePath("/vendors");
  return { ok: true, message: active ? "Vendor reactivated." : "Vendor removed." };
}
