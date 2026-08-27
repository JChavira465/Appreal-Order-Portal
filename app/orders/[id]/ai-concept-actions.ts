"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
