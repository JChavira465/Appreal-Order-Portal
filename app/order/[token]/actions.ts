"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLike } from "@/lib/like";

export type CustomerOrderResult = { ok: boolean; message: string } | null;

type FormItem = {
  item: string;
  mods: string[];
  sizes: { label: string; qty: number }[];
};

// Everything here runs as the service-role client on purpose: the person
// filling this form has no account and no session, so RLS has nothing to
// scope by. The token is the entire authorization story -- it resolves to
// exactly one company and one rep, and every write below is pinned to
// those two values. Nothing the customer submits is allowed to choose a
// company, a rep, a price, or a status.
export async function submitCustomerOrder(
  _prevState: CustomerOrderResult,
  formData: FormData,
): Promise<CustomerOrderResult> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { ok: false, message: "This order link is missing its code." };

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("order_links")
    .select("company_id, rep_id, active")
    .eq("token", token)
    .maybeSingle();

  if (!link || !link.active) {
    return { ok: false, message: "This order link is no longer active." };
  }

  const { data: company } = await admin
    .from("companies")
    .select("active")
    .eq("id", link.company_id)
    .single();
  if (!company?.active) {
    return { ok: false, message: "This shop isn't accepting orders right now." };
  }

  const teamName = String(formData.get("teamName") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const sport = String(formData.get("sport") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const shippingAddress = String(formData.get("shippingAddress") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const itemsJson = String(formData.get("itemsJson") ?? "[]");

  if (!teamName) return { ok: false, message: "Enter your team or group name." };
  if (!contactName) return { ok: false, message: "Enter a contact name." };
  if (!contactPhone) return { ok: false, message: "Enter a phone number." };

  let items: FormItem[];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    return { ok: false, message: "Something went wrong with your item list." };
  }

  const cleanItems = items.filter(
    (li) => li.item && li.sizes.some((sz) => sz.qty > 0),
  );
  if (cleanItems.length === 0) {
    return { ok: false, message: "Add at least one item with a size and quantity." };
  }

  // Only items that actually belong to this company's catalog -- the
  // form posts item names back as strings, so this is what stops a
  // hand-edited submission from referencing another shop's catalog.
  const { data: validItems } = await admin
    .from("price_items")
    .select("name")
    .eq("company_id", link.company_id)
    .eq("active", true);
  const validNames = new Set((validItems ?? []).map((i) => i.name));
  if (cleanItems.some((li) => !validNames.has(li.item))) {
    return { ok: false, message: "One of those items isn't available anymore." };
  }

  // Reuse an existing customer for this company by team name, same
  // loose matching the rep-facing order form already uses.
  let customerId: string | null = null;
  const { data: existingCustomer } = await admin
    .from("customers")
    .select("id")
    .eq("company_id", link.company_id)
    .ilike("team_name", escapeLike(teamName))
    .limit(1)
    .maybeSingle();

  if (existingCustomer) {
    customerId = existingCustomer.id;
    await admin
      .from("customers")
      .update({
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        sport: sport || null,
        shipping_address: shippingAddress || null,
      })
      .eq("id", customerId);
  } else {
    const { data: newCustomer } = await admin
      .from("customers")
      .insert({
        company_id: link.company_id,
        team_name: teamName,
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        sport: sport || null,
        shipping_address: shippingAddress || null,
      })
      .select("id")
      .single();
    customerId = newCustomer?.id ?? null;
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      company_id: link.company_id,
      rep_id: link.rep_id,
      customer_id: customerId,
      team_name: teamName,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      sport: sport || null,
      deadline: deadline || null,
      shipping_address: shippingAddress || null,
      notes: notes || null,
      status: "submitted",
      customer_submitted: true,
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    console.error("submitCustomerOrder: orders insert failed", orderError);
    return { ok: false, message: "Could not submit your order. Try again." };
  }

  const { data: insertedItems, error: itemsError } = await admin
    .from("order_items")
    .insert(
      cleanItems.map((li) => ({
        order_id: order.id,
        item: li.item,
        mods: li.mods,
        qty: li.sizes.reduce((s, sz) => s + sz.qty, 0),
      })),
    )
    .select("id");

  if (itemsError || !insertedItems || insertedItems.length !== cleanItems.length) {
    console.error("submitCustomerOrder: order_items insert failed", itemsError);
    await admin.from("orders").delete().eq("id", order.id);
    return { ok: false, message: "Could not save your items. Try again." };
  }

  const sizeRows = cleanItems.flatMap((li, idx) =>
    li.sizes
      .filter((sz) => sz.qty > 0)
      .map((sz) => ({
        order_item_id: insertedItems[idx].id,
        size_label: sz.label,
        qty: sz.qty,
      })),
  );

  if (sizeRows.length > 0) {
    const { error: sizesError } = await admin
      .from("order_item_sizes")
      .insert(sizeRows);
    if (sizesError) {
      console.error("submitCustomerOrder: order_item_sizes insert failed", sizesError);
      await admin.from("orders").delete().eq("id", order.id);
      return { ok: false, message: "Could not save your sizes. Try again." };
    }
  }

  await admin.from("activity_log").insert({
    order_id: order.id,
    actor_id: null,
    actor_name: contactName || teamName,
    text: "submitted this order from a customer link",
  });

  return {
    ok: true,
    message: `Order #${order.order_number} sent. They'll follow up with you about the design and total.`,
  };
}
