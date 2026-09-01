import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// `next` decides where the browser lands immediately AFTER the session
// cookie has been set, which makes an unchecked value a post-auth open
// redirect: "//evil.com" and "/\\evil.com" are both read by browsers as
// another origin once concatenated onto ours, handing a freshly
// authenticated user straight to an attacker's copy of this login page.
// Only a plain same-site path is allowed through; anything else falls
// back to the home page.
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // For /company's "Team activity" -- magic-link recovery is a real
      // login too, not just PIN sign-in.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error: loginEventError } = await supabase
          .from("login_events")
          .insert({ profile_id: user.id });
        // Not fatal to sign-in, but silently swallowing it hid a real
        // multi-tenant bug: a brand-new signup has no company_id yet, and
        // login_events.company_id is NOT NULL, so this insert fails for
        // every first-time magic-link login until a platform admin
        // assigns a company. Surface it instead of hiding it.
        if (loginEventError) {
          console.error("auth/callback: login_events insert failed", loginEventError);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("auth/callback: exchangeCodeForSession failed", error);
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
