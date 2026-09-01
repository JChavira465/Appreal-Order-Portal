"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OrderLinkResult = { ok: boolean; message: string; token?: string };

// Creates (once) the caller's own customer order link. One per rep,
// enforced by a unique index in 0034 -- calling this again just returns
// the existing token rather than minting a second one, so a rep can't
// end up with two links floating around pointing at the same thing.
export async function ensureOrderLink(): Promise<OrderLinkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) {
    return { ok: false, message: "Your account isn't assigned to a company." };
  }

  const { data: existing } = await supabase
    .from("order_links")
    .select("token")
    .eq("rep_id", user.id)
    .maybeSingle();

  if (existing) {
    return { ok: true, message: "Link ready.", token: existing.token };
  }

  const { data: created, error } = await supabase
    .from("order_links")
    .insert({ company_id: profile.company_id, rep_id: user.id })
    .select("token")
    .single();

  if (error || !created) {
    console.error("ensureOrderLink: insert failed", error);
    return { ok: false, message: "Could not create your link. Try again." };
  }

  revalidatePath("/");
  return { ok: true, message: "Link created.", token: created.token };
}
