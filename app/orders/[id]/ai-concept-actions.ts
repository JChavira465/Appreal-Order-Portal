"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/companyPlan";
import { uploadGeneratedOrderImage } from "@/lib/order-images";
import { generateMockupImage } from "@/lib/ai-mockup";

export type ActionResult = { ok: boolean; message: string } | null;

const MAX_AI_CONCEPTS_PER_ORDER = 4;

export async function generateAiConcept(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!prompt) return { ok: false, message: "Describe the idea first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  // Checked before anything else, because every generation past this
  // line costs real money at the image API -- an unpaid plan must never
  // be able to spend it. Same reasoning as the order-visibility check
  // below, one step earlier in the same chain.
  if (!(await requireFeature("ai_concepts"))) {
    return {
      ok: false,
      message: "AI design concepts are on the Unlimited plan.",
    };
  }

  // Confirm the caller can actually see this order BEFORE spending money
  // on a generation. RLS already stops the image from being saved to an
  // order that isn't theirs, but that check happens after the paid API
  // call -- and the per-order cap below is counted from order_images,
  // which returns 0 for any order id the caller can't read. Together
  // that made an unrecognized order id an unlimited generation budget:
  // post a random UUID, the cap reads 0, the image gets generated and
  // billed, and only the final insert fails.
  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, message: "Order not found." };

  const { count } = await supabase
    .from("order_images")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("kind", "ai_concept");
  if ((count ?? 0) >= MAX_AI_CONCEPTS_PER_ORDER) {
    return {
      ok: false,
      message: `Limit of ${MAX_AI_CONCEPTS_PER_ORDER} AI concepts per order.`,
    };
  }

  const generated = await generateMockupImage(prompt);
  if ("error" in generated) return { ok: false, message: generated.error };

  const upload = await uploadGeneratedOrderImage(
    supabase,
    orderId,
    "ai_concept",
    generated.bytes,
    "image/png",
  );
  if ("error" in upload) return { ok: false, message: upload.error };

  const { error } = await supabase.from("order_images").insert({
    order_id: orderId,
    storage_path: upload.path,
    kind: "ai_concept",
    uploaded_by: user.id,
  });
  if (error) return { ok: false, message: "Could not save the image." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  await supabase.from("activity_log").insert({
    order_id: orderId,
    actor_id: user.id,
    actor_name: profile?.full_name ?? user.email ?? "Someone",
    text: "generated an AI concept image",
  });

  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Concept generated." };
}
