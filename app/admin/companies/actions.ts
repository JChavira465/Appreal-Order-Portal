"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinToPassword } from "@/lib/pin";
import { isFeature, isTier } from "@/lib/plans";

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
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();

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
      // Their notification address. They still sign in with a PIN.
      signup_email: ownerEmail || null,
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

export type SetTierResult = { ok: boolean; message: string };

// The manual override on top of Stripe. Two cases this exists for that
// billing alone can't cover: comping a beta tester onto Unlimited, and
// fixing a company whose webhook didn't land. Deliberately does NOT
// touch stripe_subscription_id or billing_status -- whatever they're
// actually paying stays whatever they're actually paying, and the next
// webhook is still free to correct the tier. This changes what they can
// use, not what they owe.
export async function setCompanyTier(
  companyId: string,
  tier: string,
): Promise<SetTierResult> {
  const { supabase, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) {
    return { ok: false, message: "Only the platform admin can do this." };
  }
  if (!isTier(tier)) return { ok: false, message: "Unknown plan." };

  const { error } = await supabase
    .from("companies")
    .update({ tier })
    .eq("id", companyId);

  if (error) {
    console.error("setCompanyTier: update failed", error);
    return { ok: false, message: "Could not change the plan." };
  }

  // Both paths: the tier control lives on the detail page now, but the
  // list shows the plan name too, and revalidating a parent route does
  // not cover its dynamic children.
  revalidatePath("/admin/companies");
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: true, message: "Plan updated." };
}

export type SetFeatureResult = { ok: boolean; message: string };

// Per-company feature override (0038). Three states, and the third is
// the important one: "tier default" isn't a value, it's the ABSENCE of a
// row -- so clearing an override deletes it rather than writing some
// neutral value, and the company goes back to following its tier
// automatically if you later move them up or down.
export async function setCompanyFeature(
  companyId: string,
  feature: string,
  state: "on" | "off" | "default",
  note: string,
): Promise<SetFeatureResult> {
  const { supabase, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) {
    return { ok: false, message: "Only the platform admin can do this." };
  }
  if (!isFeature(feature)) return { ok: false, message: "Unknown feature." };

  if (state === "default") {
    const { error } = await supabase
      .from("company_features")
      .delete()
      .eq("company_id", companyId)
      .eq("feature", feature);
    if (error) {
      console.error("setCompanyFeature: delete failed", error);
      return { ok: false, message: `Could not clear: ${error.message}` };
    }
    revalidatePath(`/admin/companies/${companyId}`);
    return { ok: true, message: "Back to the plan default." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("company_features").upsert(
    {
      company_id: companyId,
      feature,
      enabled: state === "on",
      note: note.trim().slice(0, 300) || null,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    },
    { onConflict: "company_id,feature" },
  );

  if (error) {
    console.error("setCompanyFeature: upsert failed", error);
    return { ok: false, message: `Could not save: ${error.message}` };
  }

  revalidatePath(`/admin/companies/${companyId}`);
  return {
    ok: true,
    message: state === "on" ? "Turned on for this company." : "Turned off for this company.",
  };
}


export type SetTrialResult = { ok: boolean; message: string };

// Move, extend or remove a company's trial deadline. Since 0039 this is
// a real lever, not a display value: past the date, current_company_id()
// stops resolving and the shop loses access to everything until they pay
// or the date moves. Clearing it entirely (empty input) means the trial
// never expires -- the right answer for a design partner you've agreed
// to carry, and the reason a null date is treated as "never" rather than
// "already gone".
export async function setCompanyTrialEnd(
  companyId: string,
  date: string,
): Promise<SetTrialResult> {
  const { supabase, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) {
    return { ok: false, message: "Only the platform admin can do this." };
  }

  let value: string | null = null;
  const trimmed = date.trim();
  if (trimmed) {
    // A date input gives YYYY-MM-DD. Land on the end of that day so a
    // trial "ending on the 17th" covers the whole of the 17th, which is
    // what anyone typing that date means.
    const parsed = new Date(`${trimmed}T23:59:59Z`);
    if (isNaN(parsed.getTime())) {
      return { ok: false, message: "That date didn't look right." };
    }
    value = parsed.toISOString();
  }

  const { error } = await supabase
    .from("companies")
    .update({ trial_ends_at: value })
    .eq("id", companyId);

  if (error) {
    console.error("setCompanyTrialEnd: update failed", error);
    return { ok: false, message: `Could not save: ${error.message}` };
  }

  revalidatePath(`/admin/companies/${companyId}`);
  return {
    ok: true,
    message: value ? "Trial date updated." : "Trial no longer expires.",
  };
}
