import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCompanyPlan, planAllows } from "@/lib/companyPlan";
import { isBillingStatus, trialHasExpired, type BillingStatus } from "@/lib/plans";
import { signOut } from "./logout/actions";
import { PinForm } from "./PinForm";
import { AddRepForm } from "./AddRepForm";
import { AddManagerForm } from "./AddManagerForm";
import { StaffRow } from "./StaffRow";
import { OrderLinkCard } from "./OrderLinkCard";

const ROLE_LABEL: Record<string, string> = {
  rep: "Rep",
  manager: "Manager",
  super_admin: "Super Admin",
};

function daysUntil(dateStr: string): number | null {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, orders_viewed_at, platform_admin, company_id")
    .eq("id", user.id)
    .single();

  if (profile?.company_id) {
    // companies_select's RLS lets a member see their own company row
    // regardless of active status (see 0032), specifically so this check
    // can render a clear message instead of every other query on this
    // page just silently coming back empty with no explanation.
    const { data: company } = await supabase
      .from("companies")
      .select("name, active, billing_status, trial_ends_at")
      .eq("id", profile.company_id)
      .single();

    if (company && !company.active) {
      return (
        <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12 text-center">
          <div className="w-full max-w-sm">
            <h1 className="mb-4 text-lg font-bold text-black">
              Account suspended
            </h1>
            <p className="text-sm text-neutral-500">
              {company.name}&apos;s account is currently suspended. Contact
              the platform admin to resolve this.
            </p>
            <form action={signOut} className="mt-8">
              <button
                type="submit"
                className="text-xs text-neutral-400 underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </main>
      );
    }

    // A canceled subscription closes every door through billing_status
    // alone -- the webhook no longer touches companies.active, so this
    // never reaches the "suspended" branch above and would otherwise
    // land on a home page whose every query silently returns nothing.
    if (company && company.billing_status === "canceled") {
      const isOwner = profile?.role === "super_admin";
      return (
        <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12 text-center">
          <div className="w-full max-w-sm">
            <h1 className="mb-4 text-lg font-bold text-black">
              Your subscription has ended
            </h1>
            <p className="text-sm text-neutral-500">
              {company.name}&apos;s plan was cancelled. Your orders and
              everything else are safe — start a plan again and it all comes
              straight back.
            </p>
            {isOwner ? (
              <Link
                href="/billing"
                className="mt-6 block rounded-lg bg-black px-4 py-3 text-sm font-medium text-white"
              >
                See plans
              </Link>
            ) : (
              <p className="mt-6 text-xs text-neutral-500">
                Ask the account owner to start a plan again.
              </p>
            )}
            <form action={signOut} className="mt-8">
              <button
                type="submit"
                className="text-xs text-neutral-400 underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </main>
      );
    }

    // An expired trial closes the same doors suspension does (0039), so
    // without this the shop would land on a home page whose every query
    // silently returns nothing. Deliberately a different screen from
    // suspension: this one has an obvious way out, and the owner can
    // take it themselves.
    const expired =
      isBillingStatus(company?.billing_status ?? "") &&
      trialHasExpired(
        company!.billing_status as BillingStatus,
        company!.trial_ends_at ?? null,
      );

    if (company && expired) {
      const isOwner = profile?.role === "super_admin";
      return (
        <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12 text-center">
          <div className="w-full max-w-sm">
            <h1 className="mb-4 text-lg font-bold text-black">
              Your free trial has ended
            </h1>
            <p className="text-sm text-neutral-500">
              {company.name}&apos;s trial is over. Your orders and everything
              else are safe — pick a plan and it all comes straight back.
            </p>
            {isOwner ? (
              <Link
                href="/billing"
                className="mt-6 block rounded-lg bg-black px-4 py-3 text-sm font-medium text-white"
              >
                See plans
              </Link>
            ) : (
              <p className="mt-6 text-xs text-neutral-500">
                Ask the account owner to pick a plan.
              </p>
            )}
            <form action={signOut} className="mt-8">
              <button
                type="submit"
                className="text-xs text-neutral-400 underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </main>
      );
    }
  }

  const isManager = profile?.role === "manager" || profile?.role === "super_admin";
  const isSuperAdmin = profile?.role === "super_admin";
  const isPlatformAdmin = profile?.platform_admin === true;
  const displayName = profile?.full_name || user.email;
  const roleLabel = isPlatformAdmin
    ? "Platform Admin"
    : profile?.role
      ? (ROLE_LABEL[profile.role] ?? profile.role)
      : "Pending";

  const { data: staff } = isManager
    ? await supabase
        .from("profiles")
        .select("id, full_name, role, active")
        .neq("role", "rep")
        .order("full_name")
    : { data: null };

  const { data: reps } = isManager
    ? await supabase
        .from("profiles")
        .select("id, full_name, active")
        .eq("role", "rep")
        .order("full_name")
    : { data: null };

  // Customer order links are a paid feature (0037), so the card only
  // appears for a shop whose plan includes it. RLS refuses the insert
  // either way -- this just keeps a button off the screen that would
  // only ever explain why it can't be used.
  const plan = profile?.company_id
    ? await loadCompanyPlan(supabase, profile.company_id)
    : null;
  const canUseOrderLinks =
    plan !== null && planAllows(plan, "customer_links");

  // Their own customer order link, if they've made one already -- RLS
  // scopes order_links to the caller's own row for a rep.
  const { data: orderLink } = canUseOrderLinks
    ? await supabase
        .from("order_links")
        .select("token")
        .eq("rep_id", user.id)
        .maybeSingle()
    : { data: null };
  const orderLinkToken = orderLink?.token ?? null;

  // RLS already scopes this to "my orders" for a rep and "all orders" for
  // a manager, same as the Order Board -- no extra filter needed here.
  const { data: deadlineOrders } = await supabase
    .from("orders")
    .select("deadline, status")
    .not("deadline", "is", null);
  const activeDeadlines = (deadlineOrders ?? []).filter(
    (o) => !["draft", "cancelled", "shipped"].includes(o.status),
  );
  const overdueCount = activeDeadlines.filter(
    (o) => (daysUntil(o.deadline!) ?? 0) < 0,
  ).length;
  const dueSoonCount = activeDeadlines.filter((o) => {
    const d = daysUntil(o.deadline!);
    return d !== null && d >= 0 && d <= 7;
  }).length;

  // Orders submitted by anyone else since this manager last visited the
  // Order Board (which stamps orders_viewed_at -- see app/orders/page.tsx).
  // Reps don't get this: they already know what they just submitted.
  let newOrderCount = 0;
  if (isManager && profile?.orders_viewed_at) {
    const { data: newOrders } = await supabase
      .from("orders")
      .select("id")
      .neq("status", "draft")
      .neq("rep_id", user.id)
      .gt("created_at", profile.orders_viewed_at);
    newOrderCount = newOrders?.length ?? 0;
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-script mb-8 text-4xl text-black">Order Desk</h1>

        <div className="rounded-xl border border-neutral-200 px-6 py-8">
          <p className="text-sm text-neutral-500">Signed in as</p>
          <p className="mt-1 text-xl font-medium text-black">{displayName}</p>
          <span className="mt-3 inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
            {roleLabel}
          </span>
        </div>

        {newOrderCount > 0 && (
          <Link
            href="/orders"
            className="mt-4 block rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-800"
          >
            {newOrderCount} new order{newOrderCount === 1 ? "" : "s"} submitted
            since you last checked
          </Link>
        )}

        {(overdueCount > 0 || dueSoonCount > 0) && (
          <Link
            href="/orders"
            className="mt-4 block rounded-lg border px-4 py-3 text-left text-sm font-semibold"
            style={{
              borderColor: overdueCount > 0 ? "#FCA5A5" : "#FDE68A",
              background: overdueCount > 0 ? "#FEF2F2" : "#FFFBEB",
              color: overdueCount > 0 ? "#B42318" : "#B45309",
            }}
          >
            {overdueCount > 0 &&
              `${overdueCount} order${overdueCount === 1 ? "" : "s"} overdue`}
            {overdueCount > 0 && dueSoonCount > 0 && " · "}
            {dueSoonCount > 0 &&
              `${dueSoonCount} due within 7 days`}
          </Link>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link
            href="/orders/new"
            className="rounded-lg bg-black px-4 py-3 text-center text-sm font-medium text-white"
          >
            New Order
          </Link>
          <Link
            href="/orders"
            className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
          >
            {isManager ? "All Orders" : "My Orders"}
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link
            href="/activity"
            className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
          >
            Activity
          </Link>

          {isManager && (
            <Link
              href="/pricing"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
            >
              Pricing
            </Link>
          )}

          {isManager && (
            <Link
              href="/vendors"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
            >
              Vendors
            </Link>
          )}

          {isManager && (
            <Link
              href="/customers"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
            >
              Customers
            </Link>
          )}

          {isManager && (
            <Link
              href="/reports"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
            >
              Reports
            </Link>
          )}

          {isManager && (
            <Link
              href="/hats"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
            >
              Hat Orders
            </Link>
          )}

          {isManager && (
            <Link
              href="/shop-info"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
            >
              Shop Info
            </Link>
          )}

          {isSuperAdmin && (
            <Link
              href="/billing"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
            >
              Plan &amp; Billing
            </Link>
          )}

          {isSuperAdmin && (
            <Link
              href="/company"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
            >
              Company
            </Link>
          )}

          {isPlatformAdmin && (
            <Link
              href="/issues"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
            >
              Issues
            </Link>
          )}

          {isPlatformAdmin && (
            <Link
              href="/admin/companies"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-black hover:bg-neutral-50"
            >
              Companies
            </Link>
          )}
        </div>

        {canUseOrderLinks && <OrderLinkCard initialToken={orderLinkToken} />}

        <div className="mt-6 rounded-xl border border-neutral-200 px-6 py-6 text-left">
          <PinForm />
        </div>

        {isManager && (
          <div className="mt-6 rounded-xl border border-neutral-200 px-6 py-6 text-left">
            <AddRepForm />

            {reps && reps.length > 0 && (
              <div className="mt-6 border-t border-neutral-200 pt-4">
                <p className="mb-2 text-sm font-medium text-black">Reps</p>
                <ul>
                  {reps.map((rep) => (
                    <StaffRow
                      key={rep.id}
                      id={rep.id}
                      fullName={rep.full_name}
                      active={rep.active}
                      roleLabel="Rep"
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {isSuperAdmin && (
          <div className="mt-6 rounded-xl border border-neutral-200 px-6 py-6 text-left">
            <AddManagerForm />

            {staff && staff.length > 0 && (
              <div className="mt-6 border-t border-neutral-200 pt-4">
                <p className="mb-2 text-sm font-medium text-black">
                  Managers &amp; admins
                </p>
                <ul>
                  {staff.map((person) => (
                    <StaffRow
                      key={person.id}
                      id={person.id}
                      fullName={person.full_name}
                      active={person.active}
                      roleLabel={ROLE_LABEL[person.role] ?? person.role}
                      locked={person.role === "super_admin"}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
