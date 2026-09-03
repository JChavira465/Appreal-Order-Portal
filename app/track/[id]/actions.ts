"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCustomerDecision } from "@/lib/notify";

export type TrackActionResult = { ok: boolean; message: string } | null;

// Public, no-login actions -- callable by anyone with the order's own
// link (see PUBLIC_PATHS in lib/supabase/middleware.ts and the comment
// atop page.tsx for the trust model). There's no authenticated session to
// run these through RLS as, so both go through the admin client -- safety
// comes from each update being scoped to exactly one order id AND gated
// to only fire from the mockup_pending stage, same two-part guarantee the
// page's own read relies on.

export async function customerApproveMockup(
  _prevState: TrackActionResult,
  formData: FormData,
): Promise<TrackActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, message: "Missing order." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .update({
      status: "mockup_approved",
      revision_requested: false,
      revision_note: null,
    })
    .eq("id", orderId)
    .eq("status", "mockup_pending")
    .select("id, company_id, rep_id, order_number, team_name")
    .maybeSingle();

  if (error) {
    console.error("customerApproveMockup: update failed", error);
    return { ok: false, message: "Could not approve. Try again." };
  }
  if (!data) {
    return { ok: false, message: "This mockup isn't waiting on approval anymore." };
  }

  await admin.from("activity_log").insert({
    order_id: orderId,
    actor_id: null,
    actor_name: "Customer",
    text: "approved the mockup",
  });

  await notifyCustomerDecision({
    companyId: data.company_id as string,
    repId: data.rep_id as string,
    orderId,
    orderNumber: data.order_number,
    teamName: data.team_name,
    approved: true,
    note: null,
  });

  revalidatePath(`/track/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Thanks — the shop's been notified you approved it." };
}

export async function customerRequestRevision(
  _prevState: TrackActionResult,
  formData: FormData,
): Promise<TrackActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, message: "Missing order." };

  // Optional on purpose. Making it required would push someone who just
  // wants to say "not quite" back into a text message, which is the
  // behaviour we're trying to replace. Capped because this is an
  // unauthenticated write.
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .update({ revision_requested: true, revision_note: reason || null })
    .eq("id", orderId)
    .eq("status", "mockup_pending")
    .select("id, company_id, rep_id, order_number, team_name")
    .maybeSingle();

  if (error) {
    console.error("customerRequestRevision: update failed", error);
    return { ok: false, message: "Could not submit. Try again." };
  }
  if (!data) {
    return { ok: false, message: "This mockup isn't waiting on approval anymore." };
  }

  await admin.from("activity_log").insert({
    order_id: orderId,
    actor_id: null,
    actor_name: "Customer",
    // The reason goes into the activity feed as well as onto the order,
    // so round three can still see what round two asked for.
    text: reason
      ? `requested changes to the mockup: ${reason}`
      : "requested changes to the mockup",
  });

  await notifyCustomerDecision({
    companyId: data.company_id as string,
    repId: data.rep_id as string,
    orderId,
    orderNumber: data.order_number,
    teamName: data.team_name,
    approved: false,
    note: reason || null,
  });

  revalidatePath(`/track/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Got it — the shop's been notified you'd like changes." };
}
