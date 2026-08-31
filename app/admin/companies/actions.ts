"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinToPassword } from "@/lib/pin";

export type CreateCompanyResult = { ok: boolean; message: string } | null;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, isPlatformAdmin: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_admin")
    .eq("id", user.id)
    .single();

  return { supabase, isPlatformAdmin: profile?.platform_admin === true };
}

// Creates a company and its first owner account in one step -- the SQL
// editor path this replaces was: insert into companies, sign the owner
// in once via magic link to create their auth user, then a second SQL
// statement to set their role/company_id. Same three writes, just done
// here as one trusted, platform-admin-only server action instead.
export async function createCompany(
  _prevState: CreateCompanyResult,
  formData: FormData,
): Promise<CreateCompanyResult> {
  const { supabase, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) {
    return { ok: false, message: "Only the platform admin can do this." };
  }

  const companyName = String(formData.get("companyName") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();

  if (!companyName) {
    return { ok: false, message: "Enter a company name." };
  }
  const slug = slugify(slugInput || companyName);
  if (!slug) {
    return { ok: false, message: "Enter a valid slug (letters, numbers, dashes)." };
  }
  if (!ownerName) {
    return { ok: false, message: "Enter the owner's name." };
  }
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, message: "Owner PIN must be 4 digits." };
  }

  // Runs through the normal session client, not the admin client --
  // RLS's companies_insert policy (is_platform_admin() only) is the real
  // gate here, this call just exercises it rather than bypassing it.
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({ name: companyName, slug })
    .select("id, slug")
    .single();

  if (companyError || !company) {
    if (companyError?.code === "23505") {
      return { ok: false, message: `"${slug}" is already taken -- pick another slug.` };
    }
    return { ok: false, message: "Could not create the company. Try again." };
  }

  const ownerSlug = slugify(ownerName) || "owner";
  const loginEmail = `super_admin-${ownerSlug}-${randomUUID().slice(0, 8)}@staff.internal`;

  const admin = createAdminClient();
  const { data: created, error: createUserError } =
    await admin.auth.admin.createUser({
      email: loginEmail,
      password: pinToPassword(pin),
      email_confirm: true,
      user_metadata: { full_name: ownerName },
    });

  if (createUserError || !created?.user) {
    // The company row is already committed at this point. Not rolled
    // back automatically -- rare enough (createUser failing) that
    // retrying "add the owner" by hand for this same company is fine,
    // and safer than adding transactional machinery for a one-admin tool.
    return {
      ok: false,
      message: `Company created, but the owner account failed: ${createUserError?.message ?? "unknown error"}. Try adding the owner again.`,
    };
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      full_name: ownerName,
      role: "super_admin",
      company_id: company.id,
    })
    .eq("id", created.user.id);

  if (updateError) {
    return {
      ok: false,
      message: "Company and owner account created, but setup was incomplete. Check the SQL editor.",
    };
  }

  revalidatePath("/admin/companies");
  return {
    ok: true,
    message: `${companyName} created. ${ownerName} signs in at /login?company=${company.slug} with their PIN.`,
  };
}

export type SetCompanyActiveResult = { ok: boolean; message: string };

// Suspending is the "debt isn't settled yet" lever -- unlike delete, it's
// instant and fully reversible. current_company_id() (0032) returns null
// for every one of this company's members the moment active is false,
// which every RLS policy in the app compares company_id against -- so
// this one row flip locks out every operational table immediately,
// without touching any of those policies individually. Existing sessions
// aren't revoked (staff stay "signed in"), they just can't see or touch
// any of their company's data anymore until reactivated.
export async function setCompanyActive(
  companyId: string,
  active: boolean,
): Promise<SetCompanyActiveResult> {
  const { supabase, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) {
    return { ok: false, message: "Only the platform admin can do this." };
  }

  const { error } = await supabase
    .from("companies")
    .update({ active })
    .eq("id", companyId);

  if (error) {
    return { ok: false, message: "Could not update the company." };
  }

  revalidatePath("/admin/companies");
  return { ok: true, message: active ? "Reactivated." : "Suspended." };
}

export type DeleteCompanyResult = { ok: boolean; message: string };

// Deliberately not a full cascading delete. Every tenant table's
// company_id foreign key (orders, vendors, customers, price_items,
// etc.) has no ON DELETE behavior specified, so it defaults to blocking
// the company delete outright if any of that data still exists -- that
// safety net is intentional, not a bug, and this action never overrides
// it. Wiping a company that already has real order/customer history is
// a much bigger, more deliberate action than a single button should be
// -- if that's ever actually needed, it wants its own explicit
// conversation, not a UI shortcut here.
//
// Staff accounts are the one exception: a company created through this
// same UI always has at least its owner's profile attached, so without
// removing staff first, "delete a company I just made by mistake" could
// never succeed even for a company with zero real business data. Staff
// (auth.users, which cascades to their profiles row per 0001) are
// removed here before the company row -- if that still leaves orders/
// vendors/customers behind, the delete correctly fails below.
export async function deleteCompany(
  companyId: string,
): Promise<DeleteCompanyResult> {
  const { supabase, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) {
    return { ok: false, message: "Only the platform admin can do this." };
  }

  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", companyId);

  for (const person of staff ?? []) {
    await admin.auth.admin.deleteUser(person.id);
  }

  const { error } = await supabase
    .from("companies")
    .delete()
    .eq("id", companyId);

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        message:
          "This company still has orders, vendors, or other business data attached -- that needs a deliberate cleanup, not a quick delete.",
      };
    }
    return { ok: false, message: "Could not delete the company." };
  }

  revalidatePath("/admin/companies");
  return { ok: true, message: "Company deleted." };
}
