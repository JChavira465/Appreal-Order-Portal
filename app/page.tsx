import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./logout/actions";
import { PinForm } from "./PinForm";
import { AddRepForm } from "./AddRepForm";
import { AddManagerForm } from "./AddManagerForm";
import { StaffRow } from "./StaffRow";

const ROLE_LABEL: Record<string, string> = {
  rep: "Rep",
  manager: "Manager",
  super_admin: "Super Admin",
};

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const isManager = profile?.role === "manager" || profile?.role === "super_admin";
  const isSuperAdmin = profile?.role === "super_admin";
  const displayName = profile?.full_name || user.email;
  const roleLabel = profile?.role
    ? (ROLE_LABEL[profile.role] ?? profile.role)
    : "Pending";

  const { data: staff } = isManager
    ? await supabase
        .from("profiles")
        .select("id, full_name, role, active")
        .neq("role", "rep")
        .order("full_name")
    : { data: null };

  const { data: reps } = isManager
    ? await supabase
        .from("profiles")
        .select("id, full_name, active")
        .eq("role", "rep")
        .order("full_name")
    : { data: null };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-script mb-8 text-4xl text-black">Acme Apparel Co.</h1>

        <div className="rounded-xl border border-neutral-200 px-6 py-8">
          <p className="text-sm text-neutral-500">Signed in as</p>
          <p className="mt-1 text-xl font-medium text-black">{displayName}</p>
          <span className="mt-3 inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
            {roleLabel}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link
            href="/orders/new"
            className="rounded-lg bg-black px-4 py-3 text-center text-sm font-medium text-white"
          >
            New Order
          </Link>
          <Link
            href="/orders"
            className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
          >
            {isManager ? "All Orders" : "My Orders"}
          </Link>
        </div>

        {isManager && (
          <Link
            href="/pricing"
            className="mt-3 block rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
          >
            Pricing
          </Link>
        )}

        {isManager && (
          <Link
            href="/vendors"
            className="mt-3 block rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
          >
            Vendors
          </Link>
        )}

        {isSuperAdmin && (
          <Link
            href="/company"
            className="mt-3 block rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
          >
            Company
          </Link>
        )}

        <div className="mt-6 rounded-xl border border-neutral-200 px-6 py-6 text-left">
          <PinForm />
        </div>

        {isManager && (
          <div className="mt-6 rounded-xl border border-neutral-200 px-6 py-6 text-left">
            <AddRepForm />

            {reps && reps.length > 0 && (
              <div className="mt-6 border-t border-neutral-200 pt-4">
                <p className="mb-2 text-sm font-medium text-black">Reps</p>
                <ul>
                  {reps.map((rep) => (
                    <StaffRow
                      key={rep.id}
                      id={rep.id}
                      fullName={rep.full_name}
                      active={rep.active}
                      roleLabel="Rep"
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {isSuperAdmin && (
          <div className="mt-6 rounded-xl border border-neutral-200 px-6 py-6 text-left">
            <AddManagerForm />

            {staff && staff.length > 0 && (
              <div className="mt-6 border-t border-neutral-200 pt-4">
                <p className="mb-2 text-sm font-medium text-black">
                  Managers &amp; admins
                </p>
                <ul>
                  {staff.map((person) => (
                    <StaffRow
                      key={person.id}
                      id={person.id}
                      fullName={person.full_name}
                      active={person.active}
                      roleLabel={ROLE_LABEL[person.role] ?? person.role}
                      locked={person.role === "super_admin"}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
