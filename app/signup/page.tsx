import Link from "next/link";
import { SignupForm } from "./SignupForm";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";

export const metadata = {
  title: "Start your shop — Order Desk",
};

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-sm px-6 py-10">
      <h1 className="font-script mb-1 text-center text-4xl leading-tight text-black">
        Order Desk
      </h1>
      <p className="mb-8 text-center text-sm text-neutral-500">
        Team apparel orders, off the group chat.
      </p>

      <SignupForm />

      <div className="mt-8 border-t border-neutral-200 pt-5">
        <p className="text-xs text-neutral-500">
          You&apos;ll start on {PLANS.starter.name} — orders, pricing,
          customers, tracking links and receipts, for up to{" "}
          {PLANS.starter.seats} people. {TRIAL_DAYS} days free, then $
          {PLANS.starter.monthly}/month. Upgrade or cancel whenever.
        </p>
        <p className="mt-4 text-center text-xs">
          <Link href="/login" className="text-neutral-400 underline">
            Already have a shop? Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
