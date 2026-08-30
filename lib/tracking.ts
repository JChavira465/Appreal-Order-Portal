export type Carrier = "ups" | "fedex" | "usps" | "dhl" | "other";

export const CARRIERS: Carrier[] = ["ups", "fedex", "usps", "dhl", "other"];

export const CARRIER_LABELS: Record<Carrier, string> = {
  ups: "UPS",
  fedex: "FedEx",
  usps: "USPS",
  dhl: "DHL",
  other: "Other",
};

export function isCarrier(value: string): value is Carrier {
  return (CARRIERS as string[]).includes(value);
}

// Format-based guess, used when a manager doesn't already know which
// carrier a number belongs to. Not exhaustive -- falls back to "other",
// which still saves the number, just without a clickable link.
export function detectCarrier(trackingNumber: string): Carrier {
  const n = trackingNumber.replace(/\s+/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(n)) return "ups";
  if (/^(94|93|92|82|420\d{5}9\d{2})\d{18,20}$/.test(n) || /^[A-Z]{2}\d{9}US$/.test(n)) {
    return "usps";
  }
  if (/^\d{12}$|^\d{15}$|^\d{20}$/.test(n)) return "fedex";
  if (/^\d{10,11}$/.test(n) || /^JD\d{10,18}$/.test(n)) return "dhl";
  return "other";
}

// A link to the carrier's own tracking page. "Where is it now" live status
// (via a carrier API) could replace or sit alongside this later -- carrier
// + tracking_number are already stored cleanly enough to support that
// without a schema change, this just isn't built yet.
export function trackingUrl(carrier: Carrier, trackingNumber: string): string | null {
  const n = encodeURIComponent(trackingNumber.trim());
  switch (carrier) {
    case "ups":
      return `https://www.ups.com/track?tracknum=${n}`;
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "dhl":
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`;
    default:
      return null;
  }
}
