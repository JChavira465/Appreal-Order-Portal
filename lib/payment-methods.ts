export type PaymentMethod =
  | "cash"
  | "check"
  | "venmo"
  | "zelle"
  | "cashapp"
  | "card"
  | "other";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "check",
  "venmo",
  "zelle",
  "cashapp",
  "card",
  "other",
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  check: "Check",
  venmo: "Venmo",
  zelle: "Zelle",
  cashapp: "Cash App",
  card: "Card",
  other: "Other",
};

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as string[]).includes(value);
}
