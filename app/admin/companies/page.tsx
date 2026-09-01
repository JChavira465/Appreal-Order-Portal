import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreateCompanyForm } from "./CreateCompanyForm";
import { DeleteCompanyButton } from "./DeleteCompanyButton";
import { SuspendCompanyButton } from "./SuspendCompanyButton";

export default async function AdminCompaniesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Not signed in.
        </div>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_admin")
    .eq("id", user.id)
    .single();

  if (profile?.platform_admin !== true) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Only the platform admin can manage companies.
        </div>
      </main>
    );
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug, active, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Companies</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Create a new company and its first owner account together -- no SQL
        editor needed. The owner can add their own managers and reps from
        there.
      </p>

      <div className="rounded-xl border border-neutral-200 p-4">
        <CreateCompanyForm />
      </div>

      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-black">Existing companies</h2>
        <a href="/admin/backup" className="text-xs text-black underline">
          Back up everything
        </a>
      </div>
      <p className="mb-2 mt-1 text-xs text-neutral-500">
        Exports rows only — not sign-in accounts or uploaded images. Keep
        Supabase&apos;s own project backups on for real recovery.
      </p>
      {companies && companies.length > 0 ? (
        <div className="space-y-2">
          {companies.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-neutral-200 px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-black">
                  {c.name}
                </span>
                {!c.active && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Suspended
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                /login?company={c.slug}
              </div>
              <div className="mt-2 flex gap-3 text-xs">
                <Link href={`/pricing?company=${c.slug}`} className="text-black underline">
                  Pricing
                </Link>
                <Link href={`/orders?company=${c.slug}`} className="text-black underline">
                  Orders
                </Link>
                <a href={`/admin/backup?company=${c.slug}`} className="text-black underline">
                  Backup
                </a>
              </div>
              <SuspendCompanyButton
                companyId={c.id}
                companyName={c.name}
                active={c.active}
              />
              <DeleteCompanyButton companyId={c.id} companyName={c.name} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400">
          No companies yet.
        </div>
      )}
    </main>
  );
}
