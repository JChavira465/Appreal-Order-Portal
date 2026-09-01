import { createAdminClient } from "@/lib/supabase/admin";
import { signedUrlsFor } from "@/lib/order-images";
import { loadShopInfo } from "@/lib/shopInfo";
import { ShopInfoBlock } from "@/app/ShopInfoBlock";
import { CARRIER_LABELS, isCarrier, trackingUrl, type Carrier } from "@/lib/tracking";
import { MockupActions } from "./MockupActions";

const STAGES = [
  { key: "submitted", label: "Order received" },
  { key: "mockup_pending", label: "Design in progress" },
  { key: "mockup_approved", label: "Design approved" },
  { key: "in_production", label: "In production" },
  { key: "shipped", label: "Shipped" },
];
const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  STAGES.map((s, i) => [s.key, i]),
);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return "";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

type TrackingRow = { id: string; carrier: string; tracking_number: string };
type ImageRow = { id: string; storage_path: string; kind: string };

// Public, no-login page -- reachable by anyone with the link, gated only
// by knowing the order's own id (see PUBLIC_PATHS in
// lib/supabase/middleware.ts). Reads via the admin client, bypassing RLS
// entirely, precisely because RLS has no way to express "allow this one
// row to an anonymous visitor who supplied the right id" -- so the safety
// here comes from this query being hardcoded to fetch exactly one row by
// id and select only customer-safe columns, never a list. No pricing, no
// contact info, no cost/vendor data -- just status and tracking.
export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select(
      `company_id, team_name, status, revision_requested, deadline, mockup_notes,
       order_tracking_numbers(id, carrier, tracking_number),
       order_images(id, storage_path, kind)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    return (
      <main className="mx-auto max-w-lg px-5 py-10 text-center">
        <h1 className="font-script text-3xl text-black">Order Desk</h1>
        <p className="mt-6 text-sm text-neutral-400">
          We couldn&apos;t find that order. Double check the link.
        </p>
      </main>
    );
  }

  // Read with the admin client like everything else on this page -- the
  // visitor has no session. Safe to expose: these are the same terms the
  // shop prints on its own price sheet, written to be read by customers.
  const shopInfo = await loadShopInfo(admin, order.company_id as string);

  const trackingEntries = (order.order_tracking_numbers ?? []) as TrackingRow[];
  const mockupImages = ((order.order_images ?? []) as ImageRow[]).filter(
    (img) => img.kind === "mockup",
  );
  const mockupUrls = await signedUrlsFor(
    admin,
    mockupImages.map((img) => img.storage_path),
  );
  const idx = STAGE_INDEX[order.status] ?? 0;
  const isCancelled = order.status === "cancelled";
  const isDraft = order.status === "draft";
  const awaitingApproval = order.status === "mockup_pending";

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <div className="text-center">
        <h1 className="font-script text-3xl text-black">Order Desk</h1>
        <p className="mt-1 text-sm text-neutral-500">Order Status</p>
      </div>

      <div className="mt-6 rounded-xl border border-neutral-200 p-5 text-center">
        <div className="text-lg font-bold text-black">{order.team_name}</div>
        {order.deadline && !isCancelled && !isDraft && (
          <div className="mt-1 text-xs text-neutral-500">
            Needed by {fmtDate(order.deadline)}
          </div>
        )}
      </div>

      {isCancelled || isDraft ? (
        <div className="mt-5 rounded-xl border-2 border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
          {isCancelled ? "This order has been cancelled." : "This order isn't submitted yet."}
        </div>
      ) : (
        <div className="mt-6">
          {order.revision_requested && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs font-semibold text-red-700">
              Revisions requested on the design
            </div>
          )}
          <div className="flex items-center gap-1">
            {STAGES.map((s, i) => (
              <div
                key={s.key}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background:
                    order.revision_requested && i === idx
                      ? "#DC2626"
                      : i <= idx
                        ? "#111111"
                        : "#E5E5E5",
                }}
              />
            ))}
          </div>
          <div className="mt-2 text-center text-sm font-semibold text-black">
            {STAGES[idx]?.label}
          </div>
        </div>
      )}

      {(mockupImages.length > 0 || order.mockup_notes) && (
        <div className="mt-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
            Design
          </div>
          {order.mockup_notes && (
            <p className="mb-2 text-sm text-black">{order.mockup_notes}</p>
          )}
          {mockupImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {mockupImages.map((img) => {
                const url = mockupUrls[img.storage_path];
                if (!url) return null;
                return (
                  <a key={img.id} href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="h-28 w-28 rounded-lg border border-neutral-200 object-cover"
                    />
                  </a>
                );
              })}
            </div>
          )}
          {awaitingApproval && <MockupActions orderId={id} />}
        </div>
      )}

      {trackingEntries.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
            Shipping
          </div>
          <div className="space-y-2">
            {trackingEntries.map((t) => {
              const carrier: Carrier = isCarrier(t.carrier) ? t.carrier : "other";
              const url = trackingUrl(carrier, t.tracking_number);
              return (
                <div key={t.id} className="rounded-lg border border-neutral-200 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                    {CARRIER_LABELS[carrier]}
                  </div>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="break-all text-sm font-semibold text-black underline">
                      {t.tracking_number}
                    </a>
                  ) : (
                    <span className="break-all text-sm font-semibold text-black">
                      {t.tracking_number}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ShopInfoBlock info={shopInfo} className="mt-6" />

      <p className="mt-8 text-center text-xs text-neutral-400">
        Questions? Reach out to whoever you&apos;ve been working with on
        this order.
      </p>
    </main>
  );
}
