"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinToPassword } from "@/lib/pin";
import { TRIAL_DAYS } from "@/lib/plans";
import { sendEmail } from "@/lib/email";

export type SignupResult = { ok: boolean; message: string; slug?: string } | null;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}

// Public sign-up. Everything here runs for strangers, so it is written
// to a different standard than the platform-admin version of the same
// flow in app/admin/companies/actions.ts:
//
//   * The caller chooses nothing that matters. Tier, billing status,
//     trial length, role and platform_admin are all set here from
//     constants -- not one of them is read from the form. A shop cannot
//     sign itself up onto Unlimited, or as a platform admin.
//   * The slug is derived, then de-duplicated by suffix rather than by
//     failing, because "that name is taken" is a terrible first
//     experience and there is no reason two shops can't share a name.
//   * A half-finished signup leaves no company behind. If the owner
//     account can't be created, the company row is removed again.
export async function signUpCompany(
  _prevState: SignupResult,
  formData: FormData,
): Promise<SignupResult> {
  const companyName = String(formData.get("companyName") ?? "").trim().slice(0, 120);
  const ownerName = String(formData.get("ownerName") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const pin = String(formData.get("pin") ?? "").trim();

  if (!companyName) return { ok: false, message: "Enter your shop's name." };
  if (!ownerName) return { ok: false, message: "Enter your name." };
  if (!email.includes("@") || email.length < 5) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, message: "Pick a 4-digit PIN — it's how you'll sign in." };
  }

  const admin = createAdminClient();

  // One account per email. Checked before anything is created so a
  // repeat visitor gets told to sign in rather than getting a second
  // shop they didn't want.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("signup_email", email)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      message: "There's already an account with that email. Try signing in instead.",
    };
  }

  // Derive a free slug. A collision is expected, not exceptional --
  // plenty of shops are called the same thing.
  const base = slugify(companyName) || "shop";
  let slug = base;
  for (let attempt = 2; attempt <= 25; attempt++) {
    const { data: taken } = await admin
      .from("companies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!taken) break;
    slug = `${base}-${attempt}`;
  }

  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({
      name: companyName,
      slug,
      tier: "starter",
      billing_status: "trialing",
      trial_ends_at: trialEnds,
    })
    .select("id, slug")
    .single();

  if (companyError || !company) {
    console.error("signUpCompany: company insert failed", companyError);
    return { ok: false, message: "Could not create your shop. Try again." };
  }

  const loginEmail = `super_admin-${slugify(ownerName) || "owner"}-${randomUUID().slice(0, 8)}@staff.internal`;

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: loginEmail,
    password: pinToPassword(pin),
    email_confirm: true,
    user_metadata: { full_name: ownerName },
  });

  if (userError || !created?.user) {
    console.error("signUpCompany: owner account failed", userError);
    // Roll the company back. An orphaned shop with no owner can never be
    // signed into and would sit in the platform admin's list forever.
    await admin.from("companies").delete().eq("id", company.id);
    return { ok: false, message: "Could not finish setting up your shop. Try again." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: ownerName,
      role: "super_admin",
      company_id: company.id,
      signup_email: email,
    })
    .eq("id", created.user.id);

  if (profileError) {
    console.error("signUpCompany: profile update failed", profileError);
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from("companies").delete().eq("id", company.id);
    return { ok: false, message: "Could not finish setting up your shop. Try again." };
  }

  // Their sign-in link is the one thing they cannot recover on their own
  // -- it carries the slug, and without it /login has nothing to show.
  await sendEmail({
    to: email,
    subject: `${companyName} is set up on Order Desk`,
    body:
      `Your shop is ready, ${ownerName}.\n\n` +
      `Sign in with your name and the 4-digit PIN you just chose. Save this link — it's how you and your team get back in.\n\n` +
      `You're on a ${TRIAL_DAYS}-day free trial. No card needed until it ends.`,
    action: { label: "Sign in", path: `/login?company=${company.slug}` },
  });

  // Sign them straight in rather than making them find the link they
  // were just emailed.
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({
    email: loginEmail,
    password: pinToPassword(pin),
  });

  return { ok: true, message: "Your shop is ready.", slug: company.slug };
}
