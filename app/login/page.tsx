import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

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
  searchParams: Promise<{ company?: string }>;
}) {
  const { company: companySlug } = await searchParams;
  const supabase = await createClient();

  const { data: staff } = companySlug
    ? await supabase.rpc("list_active_staff", { company_slug: companySlug })
    : { data: null };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-script mb-1 text-center text-5xl leading-tight text-black">
          Order Desk
        </h1>

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
      </div>
    </main>
  );
}
