"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function reportIssue(
  description: string,
  pagePath: string,
): Promise<{ ok: boolean; message?: string }> {
  const trimmed = description.trim();
  if (!trimmed) {
    return { ok: false, message: "Describe what happened." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Not signed in." };
  }

  const { error } = await supabase.from("issue_reports").insert({
    reporter_id: user.id,
    description: trimmed,
    page_path: pagePath || null,
  });

  if (error) {
    console.error("reportIssue: insert failed", error);
    return { ok: false, message: `Could not submit: ${error.message}` };
  }

  return { ok: true };
}

export async function setIssueResolved(
  id: string,
  resolved: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();

  // RLS (is_platform_admin()) is the real gate; this just gets a clean
  // message back instead of a silent no-op update.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Not signed in." };
  }

  const { error } = await supabase
    .from("issue_reports")
    .update({ resolved })
    .eq("id", id);

  if (error) {
    console.error("setIssueResolved: update failed", error);
    return { ok: false, message: `Could not update: ${error.message}` };
  }

  revalidatePath("/issues");
  return { ok: true };
}
