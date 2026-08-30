import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type OrderRef =
  | { order_number: number; team_name: string }
  | { order_number: number; team_name: string }[]
  | null;

type ActivityRow = {
  id: string;
  actor_name: string | null;
  text: string;
  created_at: string;
  order_id: string;
  orders: OrderRef;
};

function orderRef(orders: OrderRef): { order_number: number; team_name: string } | null {
  if (!orders) return null;
  return Array.isArray(orders) ? (orders[0] ?? null) : orders;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function ActivityPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Not signed in.
        </div>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isManager =
    profile?.role === "manager" || profile?.role === "super_admin";

  // No extra filter needed -- activity_log's own RLS already scopes this
  // to "activity on orders I can see" (own orders for a rep, everyone's
  // for a manager), same as the Order Board.
  const { data: activity } = await supabase
    .from("activity_log")
    .select("id, actor_name, text, created_at, order_id, orders(order_number, team_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (activity ?? []) as ActivityRow[];

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Activity</h1>
      <p className="mb-5 text-sm text-neutral-500">
        {isManager
          ? "Everything happening across every order, most recent first."
          : "Everything happening on your orders, most recent first."}
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Nothing yet.
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((a) => {
            const order = orderRef(a.orders);
            return (
              <Link
                key={a.id}
                href={`/orders/${a.order_id}`}
                className="block rounded-lg border border-neutral-100 px-3 py-2 hover:bg-neutral-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm text-neutral-600">
                    <b className="text-black">{a.actor_name ?? "Someone"}</b>{" "}
                    {a.text}
                    {order && (
                      <span className="text-neutral-400">
                        {" "}
                        — #{order.order_number} {order.team_name}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-neutral-300">
                    {timeAgo(a.created_at)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
