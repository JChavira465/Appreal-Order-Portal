import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AssistSwitcher, type SwitcherCompany } from "./AssistSwitcher";

// Renders nothing at all for anyone who isn't the platform admin -- this
// sits in the root layout, so it runs on every page for every user, and
// the cheapest possible answer for the 99% case matters.
//
// The company list comes back through the normal session client:
// companies_select already restricts it to is_platform_admin() (0031), so
// there is no separate access check to get wrong here, and no reason to
// reach for the service-role client.
export async function AssistBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_admin")
    .eq("id", user.id)
    .single();

  if (profile?.platform_admin !== true) return null;

  const { data: companies } = await supabase
    .from("companies")
    .select("slug, name, active")
    .order("name");

  if (!companies || companies.length === 0) return null;

  return (
    // useSearchParams() in the switcher needs a Suspense boundary, or
    // every page underneath this layout gets forced into client-side
    // rendering at build time.
    <Suspense fallback={null}>
      <AssistSwitcher companies={companies as SwitcherCompany[]} />
    </Suspense>
  );
}
