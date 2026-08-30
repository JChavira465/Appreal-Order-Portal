"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadOrderImage, IMAGE_BUCKET } from "@/lib/order-images";
import { isPaymentMethod, PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";
import { detectCarrier, isCarrier } from "@/lib/tracking";

export type ActionResult = { ok: boolean; message: string } | null;

const STAGE_LABEL: Record<string, string> = {
  submitted: "Submitted",
  mockup_pending: "Mockup Sent",
  mockup_approved: "Mockup Approved",
  in_production: "In Production",
  shipped: "Shipped",
};
const STAGE_ORDER = Object.keys(STAGE_LABEL);

async function currentActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return {
    supabase,
    id: user.id,
    name: profile?.full_name ?? user.email ?? "Someone",
  };
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function logActivity(
  supabase: SupabaseServerClient,
  orderId: string,
  actorId: string,
  actorName: string,
  text: string,
) {
  await supabase
    .from("activity_log")
    .insert({ order_id: orderId, actor_id: actorId, actor_name: actorName, text });
}

// RLS silently filters (0 rows, no error) when the row/transition isn't
// allowed; the protect_order_fields trigger raises a real error message
// when a specific field is the problem. Prefer the trigger's message when
// present, otherwise fall back to a generic explanation.
function friendlyError(error: { message: string } | null): string {
  return error?.message || "That action isn't allowed.";
}

export async function saveMockup(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const mockupNotes = String(formData.get("mockupNotes") ?? "").trim();
  const mockupImage = formData.get("mockupImage");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };

  const { data, error } = await actor.supabase
    .from("orders")
    .update({
      status: "mockup_pending",
      revision_requested: false,
      mockup_notes: mockupNotes || null,
    })
    .eq("id", orderId)
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: friendlyError(error) };

  if (mockupImage instanceof File && mockupImage.size > 0) {
    const result = await uploadOrderImage(actor.supabase, orderId, "mockup", mockupImage);
    if ("path" in result) {
      await actor.supabase.from("order_images").insert({
        order_id: orderId,
        storage_path: result.path,
        kind: "mockup",
        uploaded_by: actor.id,
      });
    }
  }

  await logActivity(actor.supabase, orderId, actor.id, actor.name, "sent mockup to customer");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Mockup saved." };
}

export async function addReferenceImage(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const file = formData.get("referenceImage");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a photo first." };
  }

  const result = await uploadOrderImage(actor.supabase, orderId, "reference", file);
  if ("error" in result) return { ok: false, message: result.error };

  const { error } = await actor.supabase.from("order_images").insert({
    order_id: orderId,
    storage_path: result.path,
    kind: "reference",
    uploaded_by: actor.id,
  });
  if (error) return { ok: false, message: friendlyError(error) };

  await logActivity(actor.supabase, orderId, actor.id, actor.name, "added a reference photo");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Photo added." };
}

// Manager-only via RLS (order_images_delete / order_images_bucket_delete
// both require is_manager()) -- no client-side role check needed here,
// same as recordPayment relying on payments_insert's RLS.
export async function deleteOrderImage(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const storagePath = String(formData.get("storagePath") ?? "");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };

  await actor.supabase.storage.from(IMAGE_BUCKET).remove([storagePath]);

  const { error } = await actor.supabase
    .from("order_images")
    .delete()
    .eq("id", imageId);
  if (error) return { ok: false, message: friendlyError(error) };

  await logActivity(actor.supabase, orderId, actor.id, actor.name, "removed a photo");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Photo removed." };
}

// Manager-only via RLS (order_tracking_numbers_insert requires is_manager()).
export async function addTrackingNumber(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim();
  const carrierInput = String(formData.get("carrier") ?? "auto");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };
  if (!trackingNumber) return { ok: false, message: "Enter a tracking number." };

  const carrier =
    carrierInput !== "auto" && isCarrier(carrierInput)
      ? carrierInput
      : detectCarrier(trackingNumber);

  const { error } = await actor.supabase.from("order_tracking_numbers").insert({
    order_id: orderId,
    carrier,
    tracking_number: trackingNumber,
  });
  if (error) return { ok: false, message: friendlyError(error) };

  await logActivity(actor.supabase, orderId, actor.id, actor.name, "added a tracking number");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Tracking number added." };
}

export async function removeTrackingNumber(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const id = String(formData.get("id") ?? "");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };

  const { error } = await actor.supabase
    .from("order_tracking_numbers")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, message: friendlyError(error) };

  await logActivity(actor.supabase, orderId, actor.id, actor.name, "removed a tracking number");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Tracking number removed." };
}

export async function approveMockup(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };

  const { data, error } = await actor.supabase
    .from("orders")
    .update({ status: "mockup_approved", revision_requested: false })
    .eq("id", orderId)
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: friendlyError(error) };

  await logActivity(actor.supabase, orderId, actor.id, actor.name, "customer approved mockup");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Mockup approved." };
}

export async function requestRevision(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };

  const { data, error } = await actor.supabase
    .from("orders")
    .update({ revision_requested: true })
    .eq("id", orderId)
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: friendlyError(error) };

  await logActivity(actor.supabase, orderId, actor.id, actor.name, "customer requested a revision");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Revision requested." };
}

export async function advanceStatus(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };

  const { data: order } = await actor.supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (!order) return { ok: false, message: "Order not found." };

  const idx = STAGE_ORDER.indexOf(order.status);
  const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];

  const { data, error } = await actor.supabase
    .from("orders")
    .update({ status: next, revision_requested: false })
    .eq("id", orderId)
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: friendlyError(error) };

  await logActivity(actor.supabase, orderId, actor.id, actor.name, `moved to ${STAGE_LABEL[next]}`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: `Moved to ${STAGE_LABEL[next]}.` };
}

export async function cancelOrder(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };

  const { data, error } = await actor.supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: friendlyError(error) };

  await logActivity(actor.supabase, orderId, actor.id, actor.name, "cancelled the order");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true, message: "Order cancelled." };
}

export async function reopenOrder(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };

  const { data, error } = await actor.supabase
    .from("orders")
    .update({ status: "submitted" })
    .eq("id", orderId)
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: friendlyError(error) };

  await logActivity(actor.supabase, orderId, actor.id, actor.name, "reopened the order");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true, message: "Order reopened." };
}

// Deletes a draft outright rather than cancelling it -- it never became
// a real order in anyone's queue, so there's nothing worth keeping a
// cancelled-history row for. RLS only allows this while status is still
// 'draft' (for the owning rep) or always (for a manager), so an
// already-submitted order can't be deleted this way.
export async function discardDraft(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };

  const { error } = await actor.supabase.from("orders").delete().eq("id", orderId);
  if (error) return { ok: false, message: friendlyError(error) };

  revalidatePath("/orders");
  redirect("/orders");
}

export async function recordPayment(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();
  const methodRaw = String(formData.get("method") ?? "other");
  const method = isPaymentMethod(methodRaw) ? methodRaw : "other";
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };
  if (!amount || amount <= 0) {
    return { ok: false, message: "Enter a payment amount." };
  }

  const { data, error } = await actor.supabase
    .from("payments")
    .insert({ order_id: orderId, amount, method, note: note || null, recorded_by: actor.id })
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: friendlyError(error) };

  await logActivity(
    actor.supabase,
    orderId,
    actor.id,
    actor.name,
    `recorded a payment (${PAYMENT_METHOD_LABELS[method]})`,
  );
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Payment recorded." };
}

export async function applyDiscount(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const discount = Number(formData.get("discount"));
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };
  if (isNaN(discount) || discount < 0) {
    return { ok: false, message: "Enter a valid discount." };
  }

  const { data, error } = await actor.supabase
    .from("orders")
    .update({ discount })
    .eq("id", orderId)
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: friendlyError(error) };

  await logActivity(actor.supabase, orderId, actor.id, actor.name, "set a discount");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Discount saved." };
}

type FormItem = {
  item: string;
  mods: string[];
  sizes: {
    label: string;
    qty: number;
    names?: { name: string; number: string }[];
  }[];
};

export async function updateOrder(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Not signed in." };

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

  if (!orderId) return { ok: false, message: "Missing order." };

  // "Save draft" only means something if the order is still a draft --
  // an already-submitted order has no draft state to fall back into.
  // The current status is looked up server-side rather than trusted
  // from the client, since it decides validation and what "intent"
  // is even allowed to do.
  const { data: current } = await actor.supabase
    .from("orders")
    .select("status, order_number")
    .eq("id", orderId)
    .single();
  const savingDraft = intent === "draft" && current?.status === "draft";

  if (!teamName) {
    return {
      ok: false,
      message: savingDraft
        ? "At least a team name is needed to save a draft."
        : "Team name and deadline are required.",
    };
  }
  if (!savingDraft && !deadline) {
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
  if (!savingDraft && cleanItems.length === 0) {
    return { ok: false, message: "Add at least one item with a size and quantity." };
  }

  const { data: updated, error: orderError } = await actor.supabase
    .from("orders")
    .update({
      team_name: teamName,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      sport: sport || null,
      deadline: deadline || null,
      shipping_fee: shippingFee,
      shipping_address: shippingAddress || null,
      notes: notes || null,
      ...(current?.status === "draft" ? { status: savingDraft ? "draft" : "submitted" } : {}),
    })
    .eq("id", orderId)
    .select("id")
    .single();

  if (orderError || !updated) {
    console.error("updateOrder: orders update failed", orderError);
    return { ok: false, message: friendlyError(orderError) };
  }

  // Replace the line items wholesale with the edited set -- simpler and
  // less error-prone than diffing which lines changed, and matches how
  // the prototype's edit mode already worked. Deleting order_items
  // cascades to order_item_sizes, so no separate cleanup needed there.
  const { error: deleteError } = await actor.supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);
  if (deleteError) {
    return { ok: false, message: "Could not update items. Try again." };
  }

  // A draft is allowed to have zero items.
  const insertedItems: { id: string }[] = [];
  if (cleanItems.length > 0) {
    const { data, error: itemsError } = await actor.supabase
      .from("order_items")
      .insert(
        cleanItems.map((li) => ({
          order_id: orderId,
          item: li.item,
          mods: li.mods,
          qty: li.sizes.reduce((s, sz) => s + sz.qty, 0),
        })),
      )
      .select("id");
    if (itemsError || !data || data.length !== cleanItems.length) {
      console.error("updateOrder: order_items insert failed", itemsError);
      return { ok: false, message: friendlyError(itemsError) };
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
    const { data: insertedSizes, error: sizesError } = await actor.supabase
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
      console.error("updateOrder: order_item_sizes insert failed", sizesError);
      return { ok: false, message: friendlyError(sizesError) };
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
      await actor.supabase.from("order_item_size_names").insert(nameRows);
    }
  }

  await logActivity(
    actor.supabase,
    orderId,
    actor.id,
    actor.name,
    savingDraft
      ? "updated draft"
      : current?.status === "draft"
        ? "submitted order"
        : "edited order details",
  );
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(
    savingDraft ? `/orders?draft=${current?.order_number}` : `/orders/${orderId}`,
  );
}
