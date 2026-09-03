import "server-only";
import { Resend } from "resend";
import { siteUrl } from "@/lib/stripe";

// Outbound email. Optional infrastructure, exactly like Stripe and the
// OpenAI key: with no RESEND_API_KEY set, every send is a no-op that logs
// and returns, and nothing else in the app changes. That matters because
// a shop must never fail to save an order because an email bounced.
//
// Nothing here ever throws. A notification is a nice-to-have layered on
// top of work that already succeeded -- if the email fails, the order is
// still placed, the mockup is still sent, the payment is still recorded.
// Callers deliberately do not await a result they act on.

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

// The From address must be on a domain verified in Resend. Until the real
// domain is bought and verified, Resend's onboarding sender works for
// testing but only delivers to the account owner's own address.
function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";
}

type SendArgs = {
  to: string | string[];
  subject: string;
  /** Plain-text body. Rendered into a simple HTML wrapper as well. */
  body: string;
  /** Optional call-to-action shown as a button and repeated as a link. */
  action?: { label: string; path: string };
};

function wrap({ body, action }: Pick<SendArgs, "body" | "action">): {
  html: string;
  text: string;
} {
  const base = siteUrl();
  const url = action && base ? `${base}${action.path}` : null;

  const paragraphs = body
    .trim()
    .split("\n\n")
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f1f1f">${p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const button = url
    ? `<p style="margin:22px 0 0"><a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">${action!.label}</a></p>`
    : "";

  return {
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:28px 22px">${paragraphs}${button}</div>`,
    text: url ? `${body.trim()}\n\n${action!.label}: ${url}` : body.trim(),
  };
}

export async function sendEmail(args: SendArgs): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    // Not an error. Most deployments run without email configured, and
    // saying so once per send makes that visible without being alarming.
    console.info("sendEmail: RESEND_API_KEY not set, skipping", args.subject);
    return;
  }

  const recipients = (Array.isArray(args.to) ? args.to : [args.to]).filter(
    (address) => address && address.includes("@"),
  );

  // Rep accounts sign in with a synthetic @staff.internal address that
  // does not exist -- sending there would bounce and hurt the sending
  // domain's reputation, which eventually stops real mail arriving.
  const real = recipients.filter(
    (address) => !address.endsWith("@staff.internal"),
  );
  if (real.length === 0) return;

  const { html, text } = wrap(args);

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: real,
      subject: args.subject,
      html,
      text,
    });
    if (error) console.error("sendEmail: Resend rejected", args.subject, error);
  } catch (error) {
    console.error("sendEmail: failed", args.subject, error);
  }
}
