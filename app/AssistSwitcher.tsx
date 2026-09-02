"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type SwitcherCompany = { slug: string; name: string; active: boolean };

// Which screens understand ?company= (they resolve it through
// requireManagerContext / requireViewerContext). Switching company from
// anywhere else has nowhere sensible to land, so it drops you on that
// company's Order Board -- the screen you'd want first when someone
// calls for help anyway.
const ASSIST_PATHS = ["/orders", "/pricing", "/shop-info"];
const DEFAULT_ASSIST_PATH = "/orders";

function assistTargetFor(pathname: string): string {
  const match = ASSIST_PATHS.find(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  return match ? pathname : DEFAULT_ASSIST_PATH;
}

export function AssistSwitcher({
  companies,
}: {
  companies: SwitcherCompany[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("company") ?? "";

  const go = (slug: string) => {
    if (!slug) {
      // Leaving assist mode: back to your own platform-admin home.
      router.push("/");
      return;
    }
    router.push(`${assistTargetFor(pathname)}?company=${slug}`);
  };

  const currentCompany = companies.find((c) => c.slug === current);

  return (
    <div
      className={`flex items-center gap-2 border-b px-4 py-2 ${
        current
          ? "border-amber-200 bg-amber-50"
          : "border-neutral-200 bg-neutral-50"
      }`}
    >
      <label
        htmlFor="assist-company"
        className={`shrink-0 text-[10px] font-bold uppercase tracking-wide ${
          current ? "text-amber-800" : "text-neutral-400"
        }`}
      >
        {current ? "Assisting" : "Platform admin"}
      </label>

      <select
        id="assist-company"
        value={current}
        onChange={(e) => go(e.target.value)}
        className={`min-w-0 flex-1 rounded-md border bg-white px-2 py-1.5 text-sm text-black focus:border-black focus:outline-none focus:ring-1 focus:ring-black ${
          current ? "border-amber-300" : "border-neutral-300"
        }`}
      >
        <option value="">Go to a company…</option>
        {companies.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
            {c.active ? "" : " (suspended)"}
          </option>
        ))}
      </select>

      {currentCompany && (
        <button
          type="button"
          onClick={() => go("")}
          className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800"
        >
          Exit
        </button>
      )}
    </div>
  );
}
