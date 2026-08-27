// This shop's Venmo collectors -- shown as separate pay links on every
// order with a balance due, since more than one person can collect
// payment and the rep decides which one to send the customer. There is
// no Venmo API to auto-confirm an incoming payment for a personal/
// standard business profile -- this only pre-fills the Venmo app/site so
// a customer's tap-to-pay is faster. Whoever collects still has to check
// Venmo and mark the payment received in Payments afterward, same as
// recording a Cash payment today. Update this list (and redeploy) if a
// handle changes or a collector is added/removed -- not worth a settings
// table for values that rarely change.
//
// Demo placeholders below -- replace with real @usernames before this
// goes live for an actual shop. Deliberately not real-looking handles,
// since a wrong-but-plausible one could send a customer's payment to a
// stranger's real Venmo account.
export type VenmoCollector = { name: string; username: string };

export const VENMO_COLLECTORS: VenmoCollector[] = [
  { name: "Owner", username: "REPLACE-WITH-VENMO-USERNAME-1" },
  { name: "Manager", username: "REPLACE-WITH-VENMO-USERNAME-2" },
];

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
