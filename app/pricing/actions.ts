"use server";

import { revalidatePath } from "next/cache";
import { requireManagerContext } from "@/lib/adminAssist";
import { isSizeGroup } from "@/lib/sizes";

export type ActionResult = { ok: boolean; message: string } | null;

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "")
    .slice(0, 30);
}

function pricingPath(asCompany: string | null): string {
  return asCompany ? `/pricing?company=${asCompany}` : "/pricing";
}

export async function addPriceItem(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const asCompany = String(formData.get("asCompany") ?? "") || null;
  const ctx = await requireManagerContext(asCompany);
  if (!ctx) return { ok: false, message: "Only a manager can edit pricing." };
  const { supabase, companyId } = ctx;

  const name = String(formData.get("name") ?? "").trim();
  const basePrice = Number(formData.get("basePrice"));
  const isHeadwear = formData.get("isHeadwear") === "on";
  const sizeGroupRaw = String(formData.get("sizeGroup") ?? "one_size");
  const sizeGroup = isSizeGroup(sizeGroupRaw) ? sizeGroupRaw : "one_size";
  const category = String(formData.get("category") ?? "").trim().toUpperCase();

  if (!name) return { ok: false, message: "Enter an item name." };
  if (isNaN(basePrice) || basePrice < 0) {
    return { ok: false, message: "Enter a valid base price." };
  }

  // "Remove" is a soft delete (active = false) so past orders that
  // reference the item still price and display correctly. That means a
  // removed item still occupies its name -- re-adding it should bring it
  // back with whatever was just typed, not refuse because a row nobody
  // can see is technically still there.
  const { data: existing } = await supabase
    .from("price_items")
    .select("name, active")
    .eq("name", name)
    .eq("company_id", companyId)
    .maybeSingle();

  if (existing?.active) {
    return { ok: false, message: "That item already exists." };
  }

  if (existing) {
    const { error: restoreError } = await supabase
      .from("price_items")
      .update({
        base_price: basePrice,
        is_headwear: isHeadwear,
        size_group: sizeGroup,
        category: category || null,
        active: true,
      })
      .eq("name", name)
      .eq("company_id", companyId);
    if (restoreError) return { ok: false, message: "Could not add item." };

    revalidatePath(pricingPath(asCompany));
    return { ok: true, message: `${name} added back.` };
  }

  const { data: maxRow } = await supabase
    .from("price_items")
    .select("sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxRow?.sort_order ?? 0) + 10;

  const { error } = await supabase.from("price_items").insert({
    name,
    base_price: basePrice,
    is_headwear: isHeadwear,
    size_group: sizeGroup,
    category: category || null,
    sort_order: sortOrder,
    company_id: companyId,
  });
  if (error) return { ok: false, message: "Could not add item." };

  revalidatePath(pricingPath(asCompany));
  return { ok: true, message: `${name} added.` };
}

export async function updatePriceItemBase(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const asCompany = String(formData.get("asCompany") ?? "") || null;
  const ctx = await requireManagerContext(asCompany);
  if (!ctx) return { ok: false, message: "Only a manager can edit pricing." };
  const { supabase, companyId } = ctx;

  const name = String(formData.get("name") ?? "");
  const basePrice = Number(formData.get("basePrice"));
  if (isNaN(basePrice) || basePrice < 0) {
    return { ok: false, message: "Enter a valid price." };
  }

  const { error } = await supabase
    .from("price_items")
    .update({ base_price: basePrice })
    .eq("name", name)
    .eq("company_id", companyId);
  if (error) return { ok: false, message: "Could not update price." };

  revalidatePath(pricingPath(asCompany));
  return { ok: true, message: "Price updated." };
}

export async function setPriceItemActive(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const asCompany = String(formData.get("asCompany") ?? "") || null;
  const ctx = await requireManagerContext(asCompany);
  if (!ctx) return { ok: false, message: "Only a manager can edit pricing." };
  const { supabase, companyId } = ctx;

  const name = String(formData.get("name") ?? "");
  const active = formData.get("active") === "true";

  const { error } = await supabase
    .from("price_items")
    .update({ active })
    .eq("name", name)
    .eq("company_id", companyId);
  if (error) return { ok: false, message: "Could not update item." };

  revalidatePath(pricingPath(asCompany));
  return { ok: true, message: active ? "Item reactivated." : "Item removed." };
}

export async function updatePriceItemCategory(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const asCompany = String(formData.get("asCompany") ?? "") || null;
  const ctx = await requireManagerContext(asCompany);
  if (!ctx) return { ok: false, message: "Only a manager can edit pricing." };
  const { supabase, companyId } = ctx;

  const name = String(formData.get("name") ?? "");
  const category = String(formData.get("category") ?? "").trim().toUpperCase();

  const { error } = await supabase
    .from("price_items")
    .update({ category: category || null })
    .eq("name", name)
    .eq("company_id", companyId);
  if (error) return { ok: false, message: "Could not update category." };

  revalidatePath(pricingPath(asCompany));
  return { ok: true, message: "Category updated." };
}

export async function updatePriceItemSizeGroup(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const asCompany = String(formData.get("asCompany") ?? "") || null;
  const ctx = await requireManagerContext(asCompany);
  if (!ctx) return { ok: false, message: "Only a manager can edit pricing." };
  const { supabase, companyId } = ctx;

  const name = String(formData.get("name") ?? "");
  const sizeGroupRaw = String(formData.get("sizeGroup") ?? "");
  if (!isSizeGroup(sizeGroupRaw)) {
    return { ok: false, message: "Invalid size group." };
  }

  const { error } = await supabase
    .from("price_items")
    .update({ size_group: sizeGroupRaw })
    .eq("name", name)
    .eq("company_id", companyId);
  if (error) return { ok: false, message: "Could not update size group." };

  revalidatePath(pricingPath(asCompany));
  return { ok: true, message: "Size group updated." };
}

export async function addModifier(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const asCompany = String(formData.get("asCompany") ?? "") || null;
  const ctx = await requireManagerContext(asCompany);
  if (!ctx) return { ok: false, message: "Only a manager can edit pricing." };
  const { supabase, companyId } = ctx;

  const itemName = String(formData.get("itemName") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const price = Number(formData.get("price"));

  if (!label) return { ok: false, message: "Enter an add-on name." };
  if (isNaN(price) || price < 0) return { ok: false, message: "Enter a valid price." };

  const key = slugify(label) || crypto.randomUUID().slice(0, 8);

  const { error } = await supabase
    .from("price_modifiers")
    .insert({ item_name: itemName, key, label, price, company_id: companyId });
  if (error) return { ok: false, message: "Could not add add-on (maybe it already exists)." };

  revalidatePath(pricingPath(asCompany));
  return { ok: true, message: "Add-on added." };
}

export async function updateModifierPrice(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const asCompany = String(formData.get("asCompany") ?? "") || null;
  const ctx = await requireManagerContext(asCompany);
  if (!ctx) return { ok: false, message: "Only a manager can edit pricing." };
  const { supabase, companyId } = ctx;

  const itemName = String(formData.get("itemName") ?? "");
  const key = String(formData.get("key") ?? "");
  const price = Number(formData.get("price"));
  if (isNaN(price) || price < 0) return { ok: false, message: "Enter a valid price." };

  const { error } = await supabase
    .from("price_modifiers")
    .update({ price })
    .eq("item_name", itemName)
    .eq("key", key)
    .eq("company_id", companyId);
  if (error) return { ok: false, message: "Could not update add-on." };

  revalidatePath(pricingPath(asCompany));
  return { ok: true, message: "Add-on updated." };
}

export async function removeModifier(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const asCompany = String(formData.get("asCompany") ?? "") || null;
  const ctx = await requireManagerContext(asCompany);
  if (!ctx) return { ok: false, message: "Only a manager can edit pricing." };
  const { supabase, companyId } = ctx;

  const itemName = String(formData.get("itemName") ?? "");
  const key = String(formData.get("key") ?? "");

  const { error } = await supabase
    .from("price_modifiers")
    .delete()
    .eq("item_name", itemName)
    .eq("key", key)
    .eq("company_id", companyId);
  if (error) return { ok: false, message: "Could not remove add-on." };

  revalidatePath(pricingPath(asCompany));
  return { ok: true, message: "Add-on removed." };
}
