import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddVendorForm } from "./AddVendorForm";
import { VendorRow } from "./VendorRow";

export default async function VendorsPage() {
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
    .select("role")
    .eq("id", user.id)
    .single();
  const isManager =
    profile?.role === "manager" || profile?.role === "super_admin";

  if (!isManager) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Only a manager can view vendors.
        </div>
      </main>
    );
  }

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, kind, active")
    .order("name");

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Vendors</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Manufacturers and hat vendors you assign to order line items to track
        cost and profit.
      </p>

      <div className="mb-6">
        <AddVendorForm />
      </div>

      {vendors && vendors.length > 0 ? (
        <ul className="rounded-xl border border-neutral-200 px-4">
          {vendors.map((v) => (
            <VendorRow key={v.id} id={v.id} name={v.name} kind={v.kind} active={v.active} />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          No vendors yet.
        </div>
      )}
    </main>
  );
}
