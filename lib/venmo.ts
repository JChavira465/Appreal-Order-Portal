import type { SupabaseClient } from "@supabase/supabase-js";

// Shown as separate pay links on every order with a balance due, since a
// shop may have more than one person collecting payment and the rep
// decides which one to send the customer. There is no Venmo API to
// auto-confirm an incoming payment for a personal/standard business
// profile -- this only pre-fills the Venmo app/site so a customer's
// tap-to-pay is faster. Whoever collects still has to check Venmo and mark
// the payment received in Payments afterward, same as recording a Cash
// payment today.
//
// Collectors are per-company data (see venmo_collectors table), entered
// by a manager from the shop's own settings -- not hardcoded, since a
// name/handle here belongs to one specific company's staff.
export type VenmoCollector = { name: string; username: string };

export async function loadVenmoCollectors(
  supabase: SupabaseClient,
): Promise<VenmoCollector[]> {
  const { data } = await supabase
    .from("venmo_collectors")
    .select("name, username")
    .eq("active", true)
    .order("sort_order");
  return data ?? [];
}

// Venmo's documented universal deep link (venmo.com/qr-codes-and-deep-links):
// opens the Venmo app pre-filled with recipient/amount/note if installed,
// otherwise falls back to the web/App Store. The prefilled amount is only a
// default -- the customer can still edit it before sending.
export function venmoPayLink({
  amount,
  note,
  username,
}: {
  amount: number;
  note: string;
  username: string;
}): string {
  const params = new URLSearchParams({
    txn: "pay",
    audience: "private",
    recipients: username,
    amount: amount.toFixed(2),
    note,
  });
  return `https://venmo.com/?${params.toString()}`;
}
