"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type SendMagicLinkResult = {
  ok: boolean;
  message: string;
};

export async function sendMagicLink(
  _prevState: SendMagicLinkResult | null,
  formData: FormData,
): Promise<SendMagicLinkResult> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    // TODO: revert to a generic message once recovery login is confirmed working.
    return { ok: false, message: `Error: ${error.message}` };
  }

  return { ok: true, message: `Check ${email} for a sign-in link.` };
}
