import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

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
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
