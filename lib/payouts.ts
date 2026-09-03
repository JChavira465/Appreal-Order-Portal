import type { SupabaseClient } from "@supabase/supabase-js";

export type PayoutProvider = "venmo" | "cashapp" | "applecash" | "zelle";

export const PAYOUT_PROVIDERS: PayoutProvider[] = [
  "venmo",
  "cashapp",
  "applecash",
  "zelle",
];

export function isPayoutProvider(value: string): value is PayoutProvider {
  return (PAYOUT_PROVIDERS as string[]).includes(value);
}

export type PayoutAccount = {
  id: string;
  provider: PayoutProvider;
  handle: string;
  label: string | null;
};

// What each app can actually do, which is not the same for all four and
// is the reason this isn't one generic "payment link" field.
//
//   venmo    — a real deep link. Recipient, amount AND a note all
//              pre-fill, so the reference lands on the payment itself.
//   cashapp  — a link that opens the profile with the amount pre-filled.
//              Cash App has no note parameter, so the reference has to be
//              typed by the payer; the UI says so and offers a copy
//              button rather than pretending otherwise.
//   applecash— no link of any kind. Apple Cash is sent through iMessage
//              to a phone number, so all the app can honestly do is show
//              the number and say what to do with it. Listing it as a
//              tappable button would be a lie.
//   zelle    — same situation: no universal deep link, it happens inside
//              the payer's own bank app.
export const PROVIDER_INFO: Record<
  PayoutProvider,
  {
    name: string;
    /** What the shop types in. */
    placeholder: string;
    /** How to say the handle back, e.g. "@alex" or "$alex". */
    prefix: string;
    /** Whether a tap-to-pay link exists at all. */
    linkable: boolean;
    /** Whether the reference rides along on the link automatically. */
    carriesNote: boolean;
    /** Told to the payer when there's no link, or no note support. */
    instruction: string;
  }
> = {
  venmo: {
    name: "Venmo",
    placeholder: "alex-rivera-12",
    prefix: "@",
    linkable: true,
    carriesNote: true,
    instruction: "Opens Venmo with the amount and reference already filled in.",
  },
  cashapp: {
    name: "Cash App",
    placeholder: "alexrivera",
    prefix: "$",
    linkable: true,
    carriesNote: false,
    instruction: "Opens Cash App with the amount filled in — please add the reference in the note.",
  },
  applecash: {
    name: "Apple Cash",
    placeholder: "(555) 123-4567",
    prefix: "",
    linkable: false,
    carriesNote: false,
    instruction: "Send through Messages to this number, with the reference in the message.",
  },
  zelle: {
    name: "Zelle",
    placeholder: "(555) 123-4567 or alex@shop.com",
    prefix: "",
    linkable: false,
    carriesNote: false,
    instruction: "Send from your bank's app to this number or email, with the reference in the memo.",
  },
};

// Shops paste handles however they think of them -- "@alex", "$alex",
// "venmo.com/alex". Strip it back to the bare handle so the links work
// and two spellings of the same account don't look like two accounts.
export function normalizeHandle(
  provider: PayoutProvider,
  raw: string,
): string {
  const trimmed = raw.trim();
  if (provider === "applecash" || provider === "zelle") return trimmed;
  return trimmed
    .replace(/^https?:\/\/(www\.)?(venmo\.com|cash\.app)\/?/i, "")
    .replace(/^[@$]/, "")
    .replace(/\/$/, "");
}

export function displayHandle(account: PayoutAccount): string {
  return `${PROVIDER_INFO[account.provider].prefix}${account.handle}`;
}

// The reference a shop needs to see on an incoming payment to know what
// it was for. Order number first because that's what they search by;
// team name because that's what they recognise.
export function paymentReference(
  orderNumber: number,
  teamName: string,
): string {
  return `#${orderNumber} ${teamName}`.slice(0, 80);
}

export function payLink(
  account: PayoutAccount,
  amount: number,
  reference: string,
): string | null {
  const amountStr = amount.toFixed(2);

  if (account.provider === "venmo") {
    const params = new URLSearchParams({
      txn: "pay",
      audience: "private",
      recipients: account.handle,
      amount: amountStr,
      note: reference,
    });
    return `https://venmo.com/?${params.toString()}`;
  }

  if (account.provider === "cashapp") {
    // cash.app/$handle/amount is Cash App's documented shape. No note
    // parameter exists, which is why carriesNote is false above.
    return `https://cash.app/$${encodeURIComponent(account.handle)}/${amountStr}`;
  }

  return null;
}

export async function loadPayoutAccounts(
  supabase: SupabaseClient,
  companyId: string,
): Promise<PayoutAccount[]> {
  if (!companyId) return [];

  // The explicit company filter is load-bearing for the platform admin,
  // who bypasses RLS and would otherwise get every shop's accounts mixed
  // together -- same reasoning as loadCatalog.
  const { data, error } = await supabase
    .from("payout_accounts")
    .select("id, provider, handle, label")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("sort_order");

  if (error) console.error("loadPayoutAccounts: query failed", error);

  return (data ?? [])
    .filter((row) => isPayoutProvider(row.provider))
    .map((row) => ({
      id: row.id,
      provider: row.provider as PayoutProvider,
      handle: row.handle,
      label: row.label,
    }));
}
