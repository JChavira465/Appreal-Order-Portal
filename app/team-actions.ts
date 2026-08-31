"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinToPassword } from "@/lib/pin";

export type AddStaffResult = { ok: boolean; message: string } | null;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, userId: null, role: null, companyId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  return {
    supabase,
    userId: user.id,
    role: profile?.role ?? null,
    companyId: profile?.company_id ?? null,
  };
}

// A regular manager may only touch reps; super_admin may touch anyone.
// RLS (is_manager()) is the floor for both, but doesn't distinguish
// manager from super_admin, so this finer-grained rule lives here.
function canManage(actingRole: string | null, targetRole: string): boolean {
  if (actingRole === "super_admin") return true;
  if (actingRole === "manager") return targetRole === "rep";
  return false;
}

async function createStaffAccount(
  fullName: string,
  pin: string,
  role: "rep" | "manager",
  companyId: string | null,
): Promise<AddStaffResult> {
  if (!fullName) {
    return { ok: false, message: "Enter a name." };
  }
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, message: "PIN must be 4 digits." };
  }
  if (!companyId) {
    return { ok: false, message: "Your own account isn't assigned to a company." };
  }

  const slug = slugify(fullName);
  if (!slug) {
    return { ok: false, message: "Enter a valid name." };
  }
  const loginEmail = `${role}-${slug}-${randomUUID().slice(0, 8)}@staff.internal`;

  const admin = createAdminClient();
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: loginEmail,
      password: pinToPassword(pin),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

  if (createError || !created?.user) {
    return { ok: false, message: "Could not create account. Try a different name." };
  }

  // handle_new_user() (0001) only sets full_name from signup metadata --
  // it has no way to know which company is doing the inviting, so every
  // new account needs company_id (and, for a manager, role) filled in
  // here as a follow-up update, using the *inviting* user's own company,
  // never anything client-supplied.
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      company_id: companyId,
      ...(role === "manager" ? { role: "manager" } : {}),
    })
    .eq("id", created.user.id);

  if (updateError) {
    return {
      ok: false,
      message: "Account created but setup was incomplete. Try again.",
    };
  }

  revalidatePath("/");
  return { ok: true, message: `${fullName} can now sign in with their PIN.` };
}

export async function addRep(
  _prevState: AddStaffResult,
  formData: FormData,
): Promise<AddStaffResult> {
  const { role, companyId } = await currentUser();
  if (role !== "manager" && role !== "super_admin") {
    return { ok: false, message: "Only a manager can add reps." };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  return createStaffAccount(fullName, pin, "rep", companyId);
}

export async function addManager(
  _prevState: AddStaffResult,
  formData: FormData,
): Promise<AddStaffResult> {
  const { role, companyId } = await currentUser();
  if (role !== "super_admin") {
    return { ok: false, message: "Only the super admin can add managers." };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  return createStaffAccount(fullName, pin, "manager", companyId);
}

export type UpdateStaffResult = { ok: boolean; message: string } | null;

export async function renameStaff(
  _prevState: UpdateStaffResult,
  formData: FormData,
): Promise<UpdateStaffResult> {
  const targetId = String(formData.get("id") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!targetId || !fullName) {
    return { ok: false, message: "Enter a name." };
  }

  const { supabase, userId, role, companyId } = await currentUser();
  if (!userId) {
    return { ok: false, message: "Not signed in." };
  }

  // The admin client bypasses RLS for this lookup, so the company check
  // has to happen explicitly here -- canManage only knows about role
  // hierarchy, nothing about which company a target belongs to.
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("role, company_id")
    .eq("id", targetId)
    .single();

  if (
    !target ||
    target.company_id !== companyId ||
    !canManage(role, target.role)
  ) {
    return { ok: false, message: "Not allowed." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", targetId);

  if (error) {
    return { ok: false, message: "Could not update name." };
  }

  revalidatePath("/");
  return { ok: true, message: "Name updated." };
}

export async function setStaffActive(
  _prevState: UpdateStaffResult,
  formData: FormData,
): Promise<UpdateStaffResult> {
  const targetId = String(formData.get("id") ?? "").trim();
  const active = formData.get("active") === "true";

  if (!targetId) {
    return { ok: false, message: "Missing id." };
  }

  const { supabase, userId, role, companyId } = await currentUser();
  if (!userId) {
    return { ok: false, message: "Not signed in." };
  }
  if (targetId === userId) {
    return { ok: false, message: "You can't deactivate yourself." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("role, company_id")
    .eq("id", targetId)
    .single();

  if (!target || target.company_id !== companyId) {
    return { ok: false, message: "Not found." };
  }
  if (target.role === "super_admin") {
    return { ok: false, message: "Can't deactivate the super admin." };
  }
  if (!canManage(role, target.role)) {
    return { ok: false, message: "Not allowed." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", targetId);

  if (error) {
    return { ok: false, message: "Could not update status." };
  }

  revalidatePath("/");
  return { ok: true, message: active ? "Reactivated." : "Deactivated." };
}
