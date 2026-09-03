import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, stripeWebhookSecret, tierFromPriceId } from "@/lib/stripe";
import type { BillingStatus } from "@/lib/plans";

// Stripe tells us what happened to a subscription; this turns that into
// the company's tier and billing state. It is the ONLY thing that marks
// a company paid -- nothing in the app's own UI can, which is what stops
// a shop from granting itself a plan it hasn't bought.
//
// Runs with the service-role client because there is no user session on
// a webhook, and because these columns are deliberately not writable by
// any company's own session (companies_update is platform-admin only).

// Stripe's own statuses, narrowed to the four the app acts on.
function mapStatus(stripeStatus: string): BillingStatus {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      // canceled, incomplete, incomplete_expired, paused
      return "canceled";
  }
}

async function applySubscription(subscription: Stripe.Subscription) {
  const admin = createAdminClient();

  // Prefer the id we stamped on at checkout. Fall back to the customer,
  // which covers subscriptions created directly in the Stripe dashboard.
  const companyId = subscription.metadata?.company_id ?? null;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;
  const mapped = priceId ? tierFromPriceId(priceId) : null;

  if (!mapped) {
    console.error(
      "stripe webhook: no tier matches price",
      priceId,
      "-- check STRIPE_PRICE_* env vars",
    );
  }

  const status = mapStatus(subscription.status);

  // Deliberately does NOT touch companies.active.
  //
  // An earlier version set `active: status !== "canceled"`, reusing the
  // suspension lever for cancellation. That quietly broke the lever: a
  // company suspended by hand for unsettled debt still has a live
  // subscription, so its next routine renewal event -- which Stripe
  // sends every billing period without anyone doing anything -- flipped
  // active back to true and un-suspended them. The one control for
  // "this shop hasn't paid me what they owe" undid itself on a monthly
  // timer.
  //
  // It was never needed anyway. company_is_entitled() (0039) requires a
  // billing_status of active/past_due/unexpired-trialing, so setting
  // billing_status = 'canceled' already closes every door on its own.
  // Keeping the two separate means `active` is only ever the platform
  // admin's manual lever and `billing_status` is only ever what Stripe
  // reports, and neither can silently overwrite the other.
  const patch: Record<string, unknown> = {
    billing_status: status,
    stripe_subscription_id: subscription.id,
    current_period_end: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
  };
  if (customerId) patch.stripe_customer_id = customerId;
  if (mapped) {
    patch.tier = mapped.tier;
    patch.billing_period = mapped.period;
  }
  if (subscription.trial_end) {
    patch.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
  }

  // The customer-id fallback exists for subscriptions created straight
  // in the Stripe dashboard, which carry no company_id metadata. It
  // matches on a column with no uniqueness constraint, so before writing
  // through it, confirm it identifies exactly one company. Two companies
  // sharing a customer id should never happen -- startCheckout creates a
  // fresh customer per company -- but if it ever did, a single
  // subscription event would silently rewrite the tier and billing state
  // of a company that had nothing to do with it. Refusing is the right
  // answer: the 500 below makes Stripe retry and leaves a log naming the
  // customer, rather than quietly corrupting two rows.
  if (!companyId) {
    const { data: matches } = await admin
      .from("companies")
      .select("id")
      .eq("stripe_customer_id", customerId ?? "");

    if (!matches || matches.length !== 1) {
      console.error(
        "stripe webhook: customer id does not identify exactly one company",
        { customerId, matched: matches?.length ?? 0, subscription: subscription.id },
      );
      throw new Error("ambiguous customer -> company mapping");
    }
  }

  const query = admin.from("companies").update(patch);
  const { data, error } = companyId
    ? await query.eq("id", companyId).select("id")
    : await query.eq("stripe_customer_id", customerId ?? "").select("id");

  if (error) {
    console.error("stripe webhook: company update failed", error);
    // Rethrow as a non-2xx below so Stripe retries rather than treating
    // a failed write as delivered.
    throw new Error("company update failed");
  }
  if (!data || data.length === 0) {
    console.error(
      "stripe webhook: no company matched",
      { companyId, customerId, subscription: subscription.id },
    );
  }
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = stripeWebhookSecret();

  if (!stripe || !secret) {
    console.error("stripe webhook: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Billing not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // The raw body is required -- the signature is computed over the exact
  // bytes Stripe sent, so parsing it first would break verification.
  // This check is the entire authorization story for this endpoint: it
  // is public, unauthenticated, and grants paid access, so an unsigned
  // or badly-signed request must never reach applySubscription().
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error("stripe webhook: signature verification failed", error);
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;

      case "checkout.session.completed": {
        // The subscription object on this event is a bare id, so fetch
        // the real one rather than guessing at its state.
        const session = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;
        if (subId) {
          const subscription = await stripe.subscriptions.retrieve(subId);
          await applySubscription(subscription);
        }
        break;
      }

      default:
        // Everything else is noise for our purposes. Acknowledged so
        // Stripe doesn't retry it forever.
        break;
    }
  } catch (error) {
    console.error("stripe webhook: handler failed", event.type, error);
    // 500 tells Stripe to retry with backoff. Better a duplicate
    // delivery (these writes are idempotent -- they set state, they
    // don't increment anything) than a subscription change we drop.
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
