import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PLANS, TIERS, TRIAL_DAYS } from "@/lib/plans";

export const metadata = {
  title: "Apparel Logic — team apparel orders, off the group chat",
  description:
    "Order management built for the way team apparel is actually sold: rosters with names and numbers, size runs, vendor minimums and customers who pay by Venmo.",
};

// The public landing page. Deliberately at "/" and deliberately not
// behind a login: the whole reason it exists is that a shop owner who
// was pitched on Tuesday looks the company up on Thursday, and until now
// they landed on a sign-in screen, which reads as "somebody gave me a
// tool" rather than "this is a real product I should buy".
//
// The dashboard that used to live here moved to /home.
export default async function LandingPage() {
  // Signed-in visitors get a way back to their own shop rather than a
  // "start free trial" button they've already used. Only ever changes a
  // link's label -- nothing on this page is gated.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-dvh bg-white">
      {/* ---------- nav ---------- */}
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
        <span className="font-script text-2xl leading-none text-black">
          Apparel Logic
        </span>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <Link href="/home" className="font-medium text-black underline">
              Go to my shop
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-neutral-500 hover:text-black">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-black px-3.5 py-2 font-medium text-white"
              >
                Start free
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* ---------- hero ---------- */}
      <section className="mx-auto max-w-4xl px-5 pb-4 pt-8 sm:pt-14">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-400">
          For team &amp; spirit-wear shops
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-black sm:text-6xl">
          Team apparel orders,
          <br />
          off the group chat.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-neutral-600">
          A coach sends 24 names and numbers in a text. Somewhere in that
          thread is the deadline, the sizes, and half a Venmo screenshot.
          Apparel Logic is where that order actually lives.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-black px-6 py-3.5 text-base font-medium text-white"
          >
            Start {TRIAL_DAYS} days free
          </Link>
          <span className="text-sm text-neutral-500">No card needed.</span>
        </div>
      </section>

      {/* ---------- the specific problem ---------- */}
      <section className="mx-auto max-w-4xl px-5 py-14">
        <h2 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
          Built for rosters, not print jobs
        </h2>
        <p className="mt-3 max-w-xl text-neutral-600">
          Most shop software is built for a production floor. Team apparel is
          a different job, and these are the parts nobody else gets right.
        </p>

        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {[
            {
              title: "Paste the whole roster",
              body: "A coach's list goes in as one paste — names, numbers and sizes, in whatever format it arrived in. Save it and it prefills next season.",
            },
            {
              title: "Size runs the vendor can read",
              body: "Every order produces the tally sheet and a manufacturer-ready build order. That's the spreadsheet your team currently rebuilds by hand.",
            },
            {
              title: "Hats that add up to a minimum",
              body: "Three teams each ordered four of the same cap. The screen tells you they make one full vendor order instead of three short ones.",
            },
            {
              title: "The customer fills it out",
              body: "Send one link. They pick from your real price list, with your terms and turnaround on the page. It lands in your queue under your rep's name.",
            },
            {
              title: "They approve the design themselves",
              body: "The coach sees the mockup on their phone and approves it, or says exactly what to change. No screenshot, no text thread.",
            },
            {
              title: "Profit per order, not just revenue",
              body: "Vendor cost per line, shipping, supplies. Most shops genuinely don't know which orders made money. This one does.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h3 className="text-base font-bold text-black">{item.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-600">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- pricing ---------- */}
      <section className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-4xl px-5 py-14">
          <h2 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
            Pricing
          </h2>
          <p className="mt-3 text-neutral-600">
            Every plan includes orders, pricing, customers, tracking links and
            receipts. Yearly is two months free.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {TIERS.map((tier) => {
              const plan = PLANS[tier];
              const highlight = tier === "pro";
              return (
                <div
                  key={tier}
                  className={`flex flex-col rounded-xl bg-white p-5 ${
                    highlight
                      ? "border-2 border-black"
                      : "border border-neutral-200"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold text-black">
                      {plan.name}
                    </span>
                    {highlight && (
                      <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Most shops
                      </span>
                    )}
                  </div>

                  <div className="mt-3 font-mono text-3xl font-bold text-black">
                    ${plan.monthly}
                    <span className="font-sans text-sm font-normal text-neutral-400">
                      /mo
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    or ${plan.yearly.toLocaleString()}/year
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                    {plan.pitch}
                  </p>

                  <div className="mt-4 border-t border-neutral-200 pt-3 text-sm text-neutral-600">
                    {plan.seats === null
                      ? "Unlimited staff"
                      : `Up to ${plan.seats} staff`}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-block rounded-lg bg-black px-6 py-3.5 text-base font-medium text-white"
            >
              Start {TRIAL_DAYS} days free
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="mx-auto max-w-4xl px-5 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 pt-6 text-sm">
          <span className="font-script text-lg text-black">Apparel Logic</span>
          <div className="flex gap-5 text-neutral-500">
            <Link href="/login" className="hover:text-black">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-black">
              Start free
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
