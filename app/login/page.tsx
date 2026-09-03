import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LAST_COMPANY_COOKIE, isValidSlug } from "@/lib/lastCompany";
import { LoginForm } from "./LoginForm";

const ERROR_MESSAGES: Record<string, string> = {
  link_invalid:
    "That sign-in link didn't work -- it may have already been used or expired. Request a new one.",
  missing_code: "That sign-in link was incomplete. Request a new one.",
  default: "Sign-in failed. Try again, or request a new sign-in link.",
};

// Which company's staff list this login page shows is resolved from the
// URL (?company=<slug>), since there's no session yet to derive it from.
// This is a stopgap, not the final design -- a real per-company login URL
// (a subdomain, or a /c/{slug}/login path) is an app-routing decision for
// the next phase, not something this page settles on its own. Without a
// slug, this shows a "no company specified" state rather than guessing --
// falling back to some default company would recreate exactly the
// cross-company leak list_active_staff() was scoped to prevent.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; error?: string }>;
}) {
  const { company: companyParam, error } = await searchParams;

  // Fall back to the last company this browser signed into. Covers every
  // way of arriving here without the link: a bookmark of bare /login, the
  // middleware bouncing an expired session, or someone tapping back.
  // The URL always wins when it says something.
  const remembered = (await cookies()).get(LAST_COMPANY_COOKIE)?.value;
  const companySlug = isValidSlug(companyParam)
    ? companyParam
    : isValidSlug(remembered)
      ? remembered
      : null;
  // Mapped to a fixed set rather than rendered as-is. React escapes the
  // value so this was never an XSS, but ?error= is attacker-controlled
  // and anything echoed here reads to the user as if the app said it --
  // "Sign-in failed: call 555-0100 to restore your account" on the real
  // sign-in page is a convincing phishing lure for free.
  const errorMessage = ERROR_MESSAGES[error ?? ""] ?? (error ? ERROR_MESSAGES.default : null);
  const supabase = await createClient();

  const { data: staff } = companySlug
    ? await supabase.rpc("list_active_staff", { company_slug: companySlug })
    : { data: null };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-script mb-1 text-center text-5xl leading-tight text-black">
          Apparel Logic
        </h1>

        {errorMessage && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-700">
            {errorMessage}
          </p>
        )}

        {companySlug ? (
          <>
            <p className="mb-10 text-center text-sm text-neutral-500">
              Sign in
            </p>
            <LoginForm staff={staff ?? []} />
          </>
        ) : (
          <p className="mb-10 text-center text-sm text-neutral-500">
            No company specified. Use the sign-in link your company gave you.
          </p>
        )}

        <p className="mt-8 text-center text-xs text-neutral-400">
          <Link href="/login/recovery" className="underline">
            Trouble signing in?
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-neutral-400">
          <Link href="/signup" className="underline">
            Set up a new shop
          </Link>
        </p>
      </div>
    </main>
  );
}
