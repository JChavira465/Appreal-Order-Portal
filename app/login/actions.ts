"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinToPassword } from "@/lib/pin";
import {
  LAST_COMPANY_COOKIE,
  LAST_COMPANY_MAX_AGE,
  isValidSlug,
} from "@/lib/lastCompany";

export type AuthResult = { ok: boolean; message: string } | null;

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function signIn(
  _prevState: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const userId = String(formData.get("userId") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();

  if (!userId || !pin) {
    return { ok: false, message: "Pick your name and enter your PIN." };
  }

  // The visitor isn't signed in yet, so we need the admin client to look up
  // who this is and resolve their real (manager) or synthetic (rep) email --
  // RLS would otherwise hide that from an anonymous visitor, correctly. The
  // same admin client tracks failed attempts below -- a locked-out visitor
  // has no session yet, so they have no other way to touch those columns
  // themselves (see supabase/migrations/0013_pin_lockout.sql).
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, failed_pin_attempts, pin_locked_until")
    .eq("id", userId)
    .eq("active", true)
    .single();

  if (!profile) {
    return { ok: false, message: "Name or PIN incorrect." };
  }

  if (profile.pin_locked_until && new Date(profile.pin_locked_until) > new Date()) {
    const minutesLeft = Math.ceil(
      (new Date(profile.pin_locked_until).getTime() - Date.now()) / 60000,
    );
    return {
      ok: false,
      message: `Too many wrong PINs. Try again in ${minutesLeft}m.`,
    };
  }

  const { data: authUser, error: lookupError } =
    await admin.auth.admin.getUserById(userId);

  if (lookupError || !authUser?.user?.email) {
    return { ok: false, message: "Name or PIN incorrect." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: authUser.user.email,
    password: pinToPassword(pin),
  });

  if (error) {
    const attempts = (profile.failed_pin_attempts ?? 0) + 1;
    const lockedOut = attempts >= MAX_FAILED_ATTEMPTS;
    await admin
      .from("profiles")
      .update({
        failed_pin_attempts: lockedOut ? 0 : attempts,
        pin_locked_until: lockedOut
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString()
          : null,
      })
      .eq("id", userId);

    return lockedOut
      ? {
          ok: false,
          message: `Too many wrong PINs. Try again in ${LOCKOUT_MINUTES}m.`,
        }
      : { ok: false, message: "Name or PIN incorrect." };
  }

  if (profile.failed_pin_attempts || profile.pin_locked_until) {
    await admin
      .from("profiles")
      .update({ failed_pin_attempts: 0, pin_locked_until: null })
      .eq("id", userId);
  }

  // Remember which company's sign-in screen this was, so signing out or
  // a session expiring doesn't strand them on "No company specified".
  const { data: signedIn } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single();

  const { data: company } = signedIn?.company_id
    ? await admin
        .from("companies")
        .select("slug")
        .eq("id", signedIn.company_id)
        .maybeSingle()
    : { data: null };

  if (isValidSlug(company?.slug)) {
    const jar = await cookies();
    // Only ever read server-side (app/login/page.tsx), so there is no
    // reason for script to reach it. httpOnly costs nothing here and
    // takes it off the table for anything that manages to run JS on the
    // page; secure keeps it off plaintext connections in production.
    jar.set(LAST_COMPANY_COOKIE, company.slug, {
      maxAge: LAST_COMPANY_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  // For /company's "Team activity" -- insert as the now-authenticated
  // user (RLS only lets a user log their own login).
  await supabase.from("login_events").insert({ profile_id: userId });

  redirect("/");
}
