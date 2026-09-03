"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, priceIdFor, siteUrl, type BillingPeriod } from "@/lib/stripe";
import { isTier, type Tier } from "@/lib/plans";

export type BillingActionResult = { ok: boolean; message: string; url?: string };

// Stripe's own error messages are written to be shown to people ("Your
// account cannot currently make live charges", "No such price"), and
// they name the actual problem -- which a generic "try again" never
// does, and which nobody can act on without server logs. Passed through
// where one exists, with a plain fallback where it doesn't.
function stripeMessage(error: unknown, action: string): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  return message
    ? `Stripe couldn't ${action}: ${message}`
    : `Could not ${action}. Try again.`;
}

// Only a company's own owner can start or change a subscription -- this
// is the person whose card it is. A manager runs the shop day to day but
// doesn't sign up for a bill, and a rep certainly doesn't.
async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin" || !profile.company_id) return null;
  return { supabase, userId: user.id, companyId: profile.company_id as string };
}

export async function startCheckout(
  tierRaw: string,
  periodRaw: string,
): Promise<BillingActionResult> {
  const actor = await requireOwner();
  if (!actor) {
    return { ok: false, message: "Only the account owner can change the plan." };
  }

  if (!isTier(tierRaw)) return { ok: false, message: "Unknown plan." };
  const tier: Tier = tierRaw;
  const period: BillingPeriod = periodRaw === "yearly" ? "yearly" : "monthly";

  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: false,
      message: "Payments aren't switched on yet. Contact the platform admin.",
    };
  }

  const priceId = priceIdFor(tier, period);
  if (!priceId) {
    return {
      ok: false,
      message: "That plan isn't available for checkout yet. Contact the platform admin.",
    };
  }

  const base = siteUrl();
  if (!base) {
    console.error("startCheckout: NEXT_PUBLIC_SITE_URL is not set");
    return { ok: false, message: "Billing isn't fully configured yet." };
  }

  // Read and write the Stripe customer id with the admin client: the
  // columns live on `companies`, whose update policy is platform-admin
  // only (0031/0037) precisely so a shop can't edit its own billing
  // state. Attaching a customer id is trusted server work, not something
  // the owner's session should be able to do directly.
  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("name, slug, stripe_customer_id")
    .eq("id", actor.companyId)
    .single();

  if (!company) return { ok: false, message: "Company not found." };

  let customerId = company.stripe_customer_id as string | null;
  if (!customerId) {
    // Was outside a try/catch, so any Stripe failure here -- an
    // unactivated live account, a restricted key, a network blip --
    // escaped as an unhandled exception and became a bare 500 with no
    // message at all. A server action that talks to a third party has to
    // assume it can fail.
    try {
      const customer = await stripe.customers.create({
        name: company.name,
        metadata: { company_id: actor.companyId, slug: company.slug },
      });
      customerId = customer.id;
    } catch (error) {
      console.error("startCheckout: Stripe customer creation failed", error);
      return { ok: false, message: stripeMessage(error, "set up billing") };
    }

    // If this write is lost, the next attempt creates a second Stripe
    // customer for the same company -- two customers, two possible
    // subscriptions, and a webhook that can no longer tell which is
    // real. Better to stop here than to build on a broken link.
    const { error: saveError } = await admin
      .from("companies")
      .update({ stripe_customer_id: customerId })
      .eq("id", actor.companyId);

    if (saveError) {
      console.error("startCheckout: could not save stripe_customer_id", saveError);
      return {
        ok: false,
        message: "Could not save your billing account. Try again.",
      };
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/billing?checkout=done`,
      cancel_url: `${base}/billing?checkout=cancelled`,
      allow_promotion_codes: true,
      // company_id on the subscription itself is what lets the webhook
      // find the right row later without depending on the customer
      // lookup, which can be edited from the Stripe dashboard.
      subscription_data: {
        metadata: { company_id: actor.companyId },
      },
      metadata: { company_id: actor.companyId },
    });

    if (!session.url) {
      return { ok: false, message: "Could not start checkout. Try again." };
    }
    return { ok: true, message: "Redirecting to checkout…", url: session.url };
  } catch (error) {
    console.error("startCheckout: Stripe checkout session failed", error);
    return { ok: false, message: stripeMessage(error, "start checkout") };
  }
}

// Stripe's own hosted billing portal: change card, switch plan, see
// invoices, cancel. Everything a subscriber wants to do to their own
// billing, without any of it needing to be rebuilt here.
export async function openBillingPortal(): Promise<BillingActionResult> {
  const actor = await requireOwner();
  if (!actor) {
    return { ok: false, message: "Only the account owner can manage billing." };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, message: "Payments aren't switched on yet." };
  }

  const base = siteUrl();
  if (!base) {
    console.error("openBillingPortal: NEXT_PUBLIC_SITE_URL is not set");
    return { ok: false, message: "Billing isn't fully configured yet." };
  }

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("stripe_customer_id")
    .eq("id", actor.companyId)
    .single();

  const customerId = company?.stripe_customer_id as string | null;
  if (!customerId) {
    return { ok: false, message: "No subscription yet — pick a plan first." };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/billing`,
    });
    return { ok: true, message: "Opening billing…", url: session.url };
  } catch (error) {
    console.error("openBillingPortal: Stripe portal session failed", error);
    return { ok: false, message: stripeMessage(error, "open billing") };
  }
}
