"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminSignInResult = { ok: boolean; message: string } | null;

// Email+password sign-in for the platform admin only. There is no UI
// path to this for company staff -- they use PIN login (company-scoped)
// or magic-link recovery. A platform admin belongs to no company (see
// 0030's profiles_platform_admin_no_company constraint), so the
// company-scoped PIN flow can never list them, and this is the only
// account type meant to ever have a real password set on it (via
// Supabase's dashboard "Add user", not through this app).
export async function adminSignIn(
  _prevState: AdminSignInResult,
  formData: FormData,
): Promise<AdminSignInResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, message: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { ok: false, message: "Email or password incorrect." };
  }

  redirect("/home");
}
