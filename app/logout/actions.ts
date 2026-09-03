"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Signing out used to send everyone to bare /login, which shows "No
// company specified" -- so a rep who signed out could not sign back in
// without digging up the original link their shop sent them. Look up
// which company they belong to BEFORE ending the session, and send them
// to that company's own sign-in screen.
export async function signOut() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let target = "/login";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, platform_admin")
      .eq("id", user.id)
      .single();

    if (profile?.platform_admin === true) {
      // The platform admin has no company and signs in with an email and
      // password, so the company-scoped screen is useless to them.
      target = "/login/admin";
    } else if (profile?.company_id) {
      // Read with the admin client: companies_select would refuse this
      // for a suspended or lapsed company, and those are exactly the
      // people most likely to be signing out and back in.
      const admin = createAdminClient();
      const { data: company } = await admin
        .from("companies")
        .select("slug")
        .eq("id", profile.company_id)
        .single();
      if (company?.slug) target = `/login?company=${company.slug}`;
    }
  }

  await supabase.auth.signOut();
  redirect(target);
}
