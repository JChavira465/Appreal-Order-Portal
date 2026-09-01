import Link from "next/link";
import { requireManagerContext } from "@/lib/adminAssist";
import { hasShopInfo, loadShopInfo } from "@/lib/shopInfo";
import { ShopInfoBlock } from "../ShopInfoBlock";
import { ShopInfoForm } from "./ShopInfoForm";

export default async function ShopInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company: asCompany } = await searchParams;
  const ctx = await requireManagerContext(asCompany ?? null);

  if (!ctx) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Only a manager can edit shop info.
        </div>
      </main>
    );
  }

  const { supabase, companyId, isAssisting } = ctx;

  const [{ data: company }, info] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).single(),
    loadShopInfo(supabase, companyId),
  ]);

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>

      {isAssisting && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Assisting: {company?.name ?? asCompany}
        </div>
      )}

      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Shop info</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Your standing terms. These show up on every printed receipt, on the
        public tracking page customers get, and on the order form reps send
        out — so you only have to say them once.
      </p>

      <div className="rounded-xl border border-neutral-200 p-4">
        <ShopInfoForm info={info} asCompany={asCompany ?? null} />
      </div>

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-bold text-black">
          What customers see
        </h2>
        {hasShopInfo(info) ? (
          <>
            <ShopInfoBlock info={info} />
            <p className="mt-2 text-xs text-neutral-500">
              Saved copy, not a live preview — save to update this.
            </p>
          </>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400">
            Nothing set yet, so customers see no terms section at all.
          </div>
        )}
      </div>
    </main>
  );
}
