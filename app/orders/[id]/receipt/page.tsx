import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/catalog";
import { loadShopInfo } from "@/lib/shopInfo";
import { ShopInfoBlock } from "@/app/ShopInfoBlock";
import { PrintButton } from "../PrintButton";

type OrderItem = {
  item: string;
  mods: string[];
  qty: number;
  unit_price: number | null;
  line_total: number | null;
  order_item_sizes: { size_label: string; qty: number }[];
};
type Payment = { amount: number };

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// deadline is a plain date, no time/timezone attached -- reading it out of
// the "YYYY-MM-DD" string directly (never through a Date object) means it
// can never shift a day depending on what timezone the server happens to
// be running in.
function fmtDateOnly(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// created_at is a real timestamp -- always shown in Texas time regardless
// of what timezone the server itself runs in.
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function OrderReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  // Same orders_select RLS as Order Detail (rep_id = auth.uid() or
  // is_manager()) -- this is a customer-safe subset of the same order, not
  // a public/unauthenticated page, so no separate access check is needed.
  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, order_number, company_id, team_name, contact_name, contact_phone, sport,
       deadline, shipping_address, notes, shipping_fee, discount, created_at,
       order_items(item, mods, qty, unit_price, line_total,
         order_item_sizes(size_label, qty)),
       payments(amount)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href={`/orders/${id}`} className="text-sm text-neutral-500">
          ← Back
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Order not found.
        </div>
      </main>
    );
  }

  // The shop's standing terms, printed alongside the balance due -- the
  // two questions a customer reads a receipt to answer are "what do I
  // owe" and "when do I get it", and the second one lived nowhere.
  const shopInfo = await loadShopInfo(supabase, order.company_id as string);

  const items = (order.order_items ?? []) as OrderItem[];
  const payments = (order.payments ?? []) as Payment[];
  const subtotal = items.reduce((s, li) => s + Number(li.line_total ?? 0), 0);
  const total = subtotal + Number(order.shipping_fee ?? 0) - Number(order.discount ?? 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const balanceDue = total - paid;

  return (
    <main className="mx-auto max-w-lg px-5 py-8 print:max-w-none print:px-0">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print mb-6 flex items-center justify-between">
        <Link href={`/orders/${id}`} className="text-sm text-neutral-500">
          ← Back to order
        </Link>
        <PrintButton />
      </div>

      <div className="text-center">
        <h1 className="font-script text-3xl text-black">Order Desk</h1>
        <p className="mt-1 text-sm text-neutral-500">Order Receipt</p>
      </div>

      <div className="mt-6 flex items-start justify-between border-b border-neutral-200 pb-4">
        <div>
          <div className="font-mono text-xs text-neutral-400">
            #{order.order_number}
          </div>
          <div className="text-lg font-bold text-black">{order.team_name}</div>
          <div className="text-sm text-neutral-500">{order.sport ?? "—"}</div>
        </div>
        <div className="text-right text-sm text-neutral-500">
          <div>Needed by {fmtDateOnly(order.deadline)}</div>
          <div>Placed {fmtDate(order.created_at)}</div>
        </div>
      </div>

      {(order.contact_name || order.contact_phone || order.shipping_address) && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {order.contact_name && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                Contact
              </div>
              <div className="text-black">{order.contact_name}</div>
            </div>
          )}
          {order.contact_phone && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                Phone
              </div>
              <div className="text-black">{order.contact_phone}</div>
            </div>
          )}
          {order.shipping_address && (
            <div className="col-span-2">
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                Shipping address
              </div>
              <div className="whitespace-pre-line text-black">
                {order.shipping_address}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <div className="divide-y divide-neutral-100 rounded-t-xl border border-neutral-200">
          {items.map((li, i) => (
            <div key={i} className="flex items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-black">{li.item}</div>
                {li.order_item_sizes.length > 0 && (
                  <div className="mt-0.5 text-xs text-neutral-400">
                    {li.order_item_sizes
                      .map((sz) => `${sz.size_label} x${sz.qty}`)
                      .join(", ")}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right font-mono text-sm">
                <div className="text-neutral-500">
                  {li.qty} × {money(Number(li.unit_price ?? 0))}
                </div>
                <div className="font-bold text-black">
                  {money(Number(li.line_total ?? 0))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1 rounded-b-xl border border-t-0 border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
          <div className="flex justify-between text-neutral-500">
            <span>Subtotal</span>
            <span className="font-mono">{money(subtotal)}</span>
          </div>
          <div className="flex justify-between text-neutral-500">
            <span>Shipping</span>
            <span className="font-mono">{money(Number(order.shipping_fee ?? 0))}</span>
          </div>
          {Number(order.discount ?? 0) > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Discount</span>
              <span className="font-mono">−{money(Number(order.discount))}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-black">
            <span>Total</span>
            <span className="font-mono">{money(total)}</span>
          </div>
          <div className="flex justify-between text-neutral-500">
            <span>Paid</span>
            <span className="font-mono">{money(paid)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span className="text-black">Balance due</span>
            <span
              className="font-mono"
              style={{ color: balanceDue > 0 ? "#B45309" : "#15803D" }}
            >
              {money(balanceDue)}
            </span>
          </div>
        </div>
      </div>

      {order.notes && (
        <div className="mt-5">
          <div className="text-xs font-bold uppercase tracking-wide text-neutral-400">
            Notes
          </div>
          <div className="mt-1 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-black">
            {order.notes}
          </div>
        </div>
      )}

      <ShopInfoBlock info={shopInfo} className="mt-6" />

      <p className="mt-8 text-center text-xs text-neutral-400">
        Thanks for your order — questions? Reach out to whoever you&apos;ve
        been working with on this order.
      </p>
    </main>
  );
}
