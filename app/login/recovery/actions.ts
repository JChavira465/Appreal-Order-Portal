"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type SendMagicLinkResult = {
  ok: boolean;
  message: string;
};

// Where the emailed link points back to. Read from configuration, not
// from the request's own Origin header -- that header is set by whoever
// made the request, so taking it at face value meant an attacker could
// ask this endpoint to mail a sign-in link for someone else's address
// pointing at a host they control. Supabase's own redirect allowlist is
// the backstop, but a wildcard entry there (which preview deployments
// push people toward) is exactly the case where that backstop stops
// backstopping. The request origin stays as a local-development
// fallback, where NEXT_PUBLIC_SITE_URL usually isn't set.
function callbackUrl(requestOrigin: string | null): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = configured || requestOrigin || "";
  return `${base.replace(/\/+$/, "")}/auth/callback`;
}

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

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // This is account *recovery*, not sign-up. Left at its default of
      // true, signInWithOtp creates an auth user for any address typed
      // in here -- so an anonymous visitor could mint accounts on a
      // platform that has no public sign-up, and use the project's email
      // quota to send mail to arbitrary addresses while doing it.
      shouldCreateUser: false,
      emailRedirectTo: callbackUrl(requestHeaders.get("origin")),
    },
  });

  if (error) {
    console.error("sendMagicLink: signInWithOtp failed", error);
  }

  // Deliberately the same answer either way. With shouldCreateUser off,
  // reporting the real error would turn this unauthenticated form into a
  // "does this person have an account here?" oracle.
  return {
    ok: true,
    message: `If ${email} has an account, a sign-in link is on its way.`,
  };
}
