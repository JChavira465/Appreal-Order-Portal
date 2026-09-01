import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ManagerContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  companyId: string;
  isAssisting: boolean;
};

// Resolves which company a manager-only page/action should operate on.
//
// Normal path: the signed-in manager/super_admin's own company_id, same
// as always -- RLS (company_id = current_company_id()) is the real gate.
//
// Assist path: a platform admin has no company_id of their own (they
// belong to none, by design), so is_platform_admin() bypassing RLS gets
// them nothing useful on its own -- a query with no company filter would
// either return nothing or, worse, every company's rows mixed together.
// asCompanySlug (carried through a page's ?company= param or a form's
// hidden field) is how the platform admin says which company they're
// currently assisting; every caller of this function must apply
// companyId as an explicit filter/value on its own queries, since there
// is no session-level scoping to fall back on for this account.
export async function requireManagerContext(
  asCompanySlug: string | null,
): Promise<ManagerContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id, platform_admin")
    .eq("id", user.id)
    .single();

  if (profile?.platform_admin === true) {
    if (!asCompanySlug) return null;
    const admin = createAdminClient();
    const { data: company } = await admin
      .from("companies")
      .select("id")
      .eq("slug", asCompanySlug)
      .single();
    if (!company) return null;
    return { supabase, companyId: company.id, isAssisting: true };
  }

  if (profile?.role !== "manager" && profile?.role !== "super_admin") {
    return null;
  }
  if (!profile.company_id) return null;
  return { supabase, companyId: profile.company_id, isAssisting: false };
}

// Same resolution, but for read access that any signed-in staff member
// has (not manager-only) -- e.g. viewing (not editing) an order. A
// platform admin still needs an explicit asCompanySlug; a normal rep or
// manager just gets their own company_id, same as any RLS-scoped query
// already would.
export async function requireViewerContext(
  asCompanySlug: string | null,
): Promise<ManagerContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, platform_admin")
    .eq("id", user.id)
    .single();

  if (profile?.platform_admin === true) {
    if (!asCompanySlug) return null;
    const admin = createAdminClient();
    const { data: company } = await admin
      .from("companies")
      .select("id")
      .eq("slug", asCompanySlug)
      .single();
    if (!company) return null;
    return { supabase, companyId: company.id, isAssisting: true };
  }

  if (!profile?.company_id) return null;
  return { supabase, companyId: profile.company_id, isAssisting: false };
}
