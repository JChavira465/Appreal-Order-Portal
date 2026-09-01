import { type ShopInfo, hasShopInfo } from "@/lib/shopInfo";

// The shop's standing terms, rendered identically everywhere a customer
// might read them: the printed receipt, the public tracking page, and the
// customer-facing order form. One component so those three can't drift
// apart -- a shop that changes its turnaround time should not have to
// wonder which of the three still says the old number.
//
// Renders nothing at all when the shop hasn't filled any of this in, so
// a company that never sets it never sees an empty box.
export function ShopInfoBlock({
  info,
  className = "",
}: {
  info: ShopInfo;
  className?: string;
}) {
  if (!hasShopInfo(info)) return null;

  const rows: { label: string; value: string }[] = [];
  if (info.paymentTerms) rows.push({ label: "Payment", value: info.paymentTerms });
  if (info.turnaroundTime) rows.push({ label: "Turnaround", value: info.turnaroundTime });
  if (info.taxShippingNote) {
    rows.push({ label: "Tax & shipping", value: info.taxShippingNote });
  }

  return (
    <div className={className}>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
        Shop terms
      </div>
      <dl className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              {row.label}
            </dt>
            {/* whitespace-pre-line so a shop can write these as a couple
                of short lines without them collapsing into one run-on. */}
            <dd className="whitespace-pre-line text-sm text-black">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
