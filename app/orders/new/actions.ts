"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { uploadOrderImage } from "@/lib/order-images";

export type CreateOrderResult = { ok: boolean; message: string } | null;

type FormItem = {
  item: string;
  mods: string[];
  sizes: {
    label: string;
    qty: number;
    names?: { name: string; number: string }[];
  }[];
};

export async function createOrder(
  _prevState: CreateOrderResult,
  formData: FormData,
): Promise<CreateOrderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Not signed in." };
  }

  const intent = String(formData.get("intent") ?? "submit") === "draft" ? "draft" : "submit";
  const teamName = String(formData.get("teamName") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const sport = String(formData.get("sport") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const shippingAddress = String(formData.get("shippingAddress") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const shippingFeeRaw = String(formData.get("shippingFee") ?? "").trim();
  const shippingFee = shippingFeeRaw === "" ? 0 : Number(shippingFeeRaw);
  const itemsJson = String(formData.get("itemsJson") ?? "[]");

  if (!teamName) {
    return {
      ok: false,
      message:
        intent === "draft"
          ? "At least a team name is needed to save a draft."
          : "Team name and deadline are required.",
    };
  }
  if (intent === "submit" && !deadline) {
    return { ok: false, message: "Team name and deadline are required." };
  }

  let items: FormItem[];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    return { ok: false, message: "Something went wrong with the item list." };
  }

  const cleanItems = items.filter(
    (li) => li.item && li.sizes.some((sz) => sz.qty > 0),
  );
  if (intent === "submit" && cleanItems.length === 0) {
    return { ok: false, message: "Add at least one item with a size and quantity." };
  }

  // Reuse an existing customer with a matching team name, or create one.
  let customerId: string | null = null;
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .ilike("team_name", teamName)
    .limit(1)
    .maybeSingle();

  if (existingCustomer) {
    customerId = existingCustomer.id;
    await supabase
      .from("customers")
      .update({
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        sport: sport || null,
        shipping_address: shippingAddress || null,
      })
      .eq("id", customerId);
  } else {
    const { data: newCustomer } = await supabase
      .from("customers")
      .insert({
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

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      rep_id: user.id,
      customer_id: customerId,
      team_name: teamName,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      sport: sport || null,
      deadline: deadline || null,
      shipping_fee: shippingFee,
      shipping_address: shippingAddress || null,
      notes: notes || null,
      status: intent === "draft" ? "draft" : "submitted",
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    console.error("createOrder: orders insert failed", orderError);
    return {
      ok: false,
      message: orderError
        ? `Could not create the order: ${orderError.message}`
        : "Could not create the order. Try again.",
    };
  }

  // A draft is allowed to have zero items -- nothing to insert yet, and
  // an empty insert() call is its own edge case to avoid.
  const insertedItems: { id: string }[] = [];
  if (cleanItems.length > 0) {
    const { data, error: itemsError } = await supabase
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

    if (itemsError || !data || data.length !== cleanItems.length) {
      console.error("createOrder: order_items insert failed", itemsError);
      // Order shell exists but the items failed -- clean it up rather
      // than leave an empty order behind. RLS lets the rep delete their
      // own still-draft order; a manager can delete any order.
      await supabase.from("orders").delete().eq("id", order.id);
      return {
        ok: false,
        message: itemsError
          ? `Could not save the items: ${itemsError.message}`
          : "Could not save the items. Try again.",
      };
    }
    insertedItems.push(...data);
  }

  const sizeEntries = cleanItems.flatMap((li, idx) =>
    li.sizes
      .filter((sz) => sz.qty > 0)
      .map((sz) => ({
        order_item_id: insertedItems[idx].id,
        size_label: sz.label,
        qty: sz.qty,
        names: (sz.names ?? []).filter((n) => n.name.trim() || n.number.trim()),
      })),
  );

  if (sizeEntries.length > 0) {
    const { data: insertedSizes, error: sizesError } = await supabase
      .from("order_item_sizes")
      .insert(
        sizeEntries.map((sz) => ({
          order_item_id: sz.order_item_id,
          size_label: sz.size_label,
          qty: sz.qty,
        })),
      )
      .select("id");
    if (sizesError || !insertedSizes || insertedSizes.length !== sizeEntries.length) {
      console.error("createOrder: order_item_sizes insert failed", sizesError);
      await supabase.from("orders").delete().eq("id", order.id);
      return {
        ok: false,
        message: sizesError
          ? `Could not save item sizes: ${sizesError.message}`
          : "Could not save item sizes. Try again.",
      };
    }

    const nameRows = sizeEntries.flatMap((sz, idx) =>
      sz.names.map((n, i) => ({
        order_item_size_id: insertedSizes[idx].id,
        player_name: n.name || null,
        player_number: n.number || null,
        sort_order: i,
      })),
    );
    if (nameRows.length > 0) {
      await supabase.from("order_item_size_names").insert(nameRows);
      // Not fatal if this fails -- names/numbers are a nice-to-have on top
      // of the order that's already valid; don't roll back a real order
      // over a roster detail.
    }
  }

  const referenceImages = formData
    .getAll("referenceImages")
    .filter((f): f is File => f instanceof File && f.size > 0);

  for (const file of referenceImages) {
    const result = await uploadOrderImage(supabase, order.id, "reference", file);
    if ("path" in result) {
      await supabase.from("order_images").insert({
        order_id: order.id,
        storage_path: result.path,
        kind: "reference",
        uploaded_by: user.id,
      });
    }
    // A failed photo upload shouldn't block the order itself -- the order
    // and its pricing are the critical part; skip and move on.
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  await supabase.from("activity_log").insert({
    order_id: order.id,
    actor_id: user.id,
    actor_name: profile?.full_name ?? user.email,
    text: intent === "draft" ? "saved as draft" : "submitted order",
  });

  redirect(
    intent === "draft"
      ? `/orders?draft=${order.order_number}`
      : `/orders?created=${order.order_number}`,
  );
}
