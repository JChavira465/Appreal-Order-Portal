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
        await supabase.from("login_events").insert({ profile_id: user.id });
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
