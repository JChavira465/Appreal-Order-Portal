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

async function managersOf(companyId: string): Promise<string[]> {
  const admin = createAdminClient();

  const { data: staff, error } = await admin
    .from("profiles")
    .select("id, role")
    .eq("company_id", companyId)
    .eq("active", true)
    .in("role", ["manager", "super_admin"]);

  if (error) {
    console.error("notify: could not load managers", error);
    return [];
  }

  // profiles has no email column -- the address lives on the auth user,
  // so each one has to be looked up. Reps carry synthetic
  // @staff.internal addresses that sendEmail drops on the floor.
  const addresses = await Promise.all(
    (staff ?? []).map(async (person) => {
      const { data } = await admin.auth.admin.getUserById(person.id);
      return data?.user?.email ?? null;
    }),
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
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(args.repId);
  const email = data?.user?.email;
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
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(args.repId);

  const to = [
    ...(data?.user?.email ? [data.user.email] : []),
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
