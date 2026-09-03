import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

// The four moments worth interrupting someone for. Everything else in
// the app is something you go and look at; these are things you need to
// know without looking.
//
// Every function here is fire-and-forget: callers do not await a result
// they act on, and nothing throws. A failed notification must never fail
// the work that triggered it -- an order that saved and didn't email is
// far better than an order that didn't save because an email did.
//
// Recipients are resolved with the admin client because these run after
// an action has already authorised itself, and the people who need
// telling (a manager, the shop's owner) are usually NOT the person who
// caused the event, so the acting user's own session can't see them.

// Where to actually email a person.
//
// EVERY staff account -- rep, manager, owner, however it was created --
// signs in with a synthetic @staff.internal address, because PIN login
// has to work for people who never gave us a mailbox. So the auth user's
// email is almost never somewhere mail can go, and reading it was the
// bug that made this entire notification system silently reach nobody.
//
// profiles.signup_email is the real address: set at self-serve signup,
// and now also when a manager adds someone or the platform admin creates
// a shop. The auth email is only used as a fallback for the one account
// type that has a genuine one -- the platform admin, who signs in with
// email and password.
async function addressFor(profileId: string): Promise<string | null> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("signup_email")
    .eq("id", profileId)
    .maybeSingle();

  if (profile?.signup_email) return profile.signup_email as string;

  const { data } = await admin.auth.admin.getUserById(profileId);
  const authEmail = data?.user?.email ?? null;
  if (authEmail && !authEmail.endsWith("@staff.internal")) return authEmail;

  return null;
}

async function managersOf(companyId: string): Promise<string[]> {
  const admin = createAdminClient();

  const { data: staff, error } = await admin
    .from("profiles")
    .select("id, signup_email")
    .eq("company_id", companyId)
    .eq("active", true)
    .in("role", ["manager", "super_admin"]);

  if (error) {
    console.error("notify: could not load managers", error);
    return [];
  }

  const addresses = await Promise.all(
    (staff ?? []).map(async (person) =>
      person.signup_email
        ? (person.signup_email as string)
        : addressFor(person.id),
    ),
  );

  return addresses.filter((a): a is string => Boolean(a));
}

/** A rep (or a customer, through an order link) submitted a new order. */
export async function notifyNewOrder(args: {
  companyId: string;
  orderId: string;
  orderNumber: number;
  teamName: string;
  submittedBy: string;
  fromCustomerLink: boolean;
}): Promise<void> {
  const to = await managersOf(args.companyId);
  if (to.length === 0) return;

  const origin = args.fromCustomerLink
    ? `${args.submittedBy} filled this out themselves through a customer order link, so nobody on your team has checked the details yet.`
    : `${args.submittedBy} submitted it.`;

  await sendEmail({
    to,
    subject: `New order #${args.orderNumber} — ${args.teamName}`,
    body: `${args.teamName} has a new order on the board.\n\n${origin}`,
    action: { label: "Open the order", path: `/orders/${args.orderId}` },
  });
}

/** A manager posted a mockup; the rep needs to get it in front of their customer. */
export async function notifyMockupReady(args: {
  repId: string;
  orderId: string;
  orderNumber: number;
  teamName: string;
}): Promise<void> {
  const email = await addressFor(args.repId);
  if (!email) return;

  await sendEmail({
    to: email,
    subject: `Mockup ready for #${args.orderNumber} — ${args.teamName}`,
    body:
      `The design for ${args.teamName} is ready to show the customer.\n\n` +
      `Send them the tracking link and they can approve it or ask for changes themselves, or approve it for them once you've talked.`,
    action: { label: "See the mockup", path: `/orders/${args.orderId}` },
  });
}

/** The customer approved or asked for changes from the public tracking page. */
export async function notifyCustomerDecision(args: {
  companyId: string;
  repId: string;
  orderId: string;
  orderNumber: number;
  teamName: string;
  approved: boolean;
  note: string | null;
}): Promise<void> {
  const repEmail = await addressFor(args.repId);

  const to = [
    ...(repEmail ? [repEmail] : []),
    ...(await managersOf(args.companyId)),
  ];
  if (to.length === 0) return;

  const what = args.approved
    ? `The customer approved the design for ${args.teamName}. It's clear to go to production.`
    : `The customer asked for changes to the design for ${args.teamName}.`;

  await sendEmail({
    to,
    subject: args.approved
      ? `Approved: #${args.orderNumber} — ${args.teamName}`
      : `Changes requested: #${args.orderNumber} — ${args.teamName}`,
    body: args.note ? `${what}\n\nThey said:\n${args.note}` : what,
    action: { label: "Open the order", path: `/orders/${args.orderId}` },
  });
}

/** A payment was recorded against an order. */
export async function notifyPaymentRecorded(args: {
  companyId: string;
  orderId: string;
  orderNumber: number;
  teamName: string;
  amount: number;
  balanceDue: number;
}): Promise<void> {
  const to = await managersOf(args.companyId);
  if (to.length === 0) return;

  const money = (n: number) => `$${n.toFixed(2)}`;
  const settled =
    args.balanceDue <= 0
      ? "That settles the order in full."
      : `${money(args.balanceDue)} still outstanding.`;

  await sendEmail({
    to,
    subject: `Payment received — #${args.orderNumber} ${args.teamName}`,
    body: `${money(args.amount)} came in against ${args.teamName}'s order.\n\n${settled}`,
    action: { label: "Open the order", path: `/orders/${args.orderId}` },
  });
}
