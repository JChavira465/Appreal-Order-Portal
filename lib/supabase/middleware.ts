import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

// /track/[id] is the customer-facing status link -- no login, gated only
// by knowing the order's own (unguessable) id, same trust model as most
// small-business tracking/invoice links. It reads via the admin client
// (see app/track/[id]/page.tsx), not the signed-in user's session, so it
// must stay reachable without a session here.
// /order/[token] is the customer-facing intake form a rep sends out --
// the customer has no account, and the token is what identifies the
// company/rep, so it has to stay reachable without a session (same trust
// model as /track/ above).
// /api/stripe/webhook is called by Stripe's servers, which have no
// session and never will -- without this it would be bounced to /login
// and every subscription change would silently never arrive. It does its
// own authentication, and a stronger kind than a session: the request
// body must carry a valid signature from the Stripe webhook secret, so
// an unsigned POST here is rejected inside the route itself.
const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/track/",
  "/order/",
  "/api/stripe/webhook",
  // Public sign-up: whoever is here does not have an account yet, which
  // is the entire point.
  "/signup",
];

// Vercel kills a middleware invocation outright at 25s with a raw 504 --
// no chance to respond gracefully. Supabase's getUser() call occasionally
// stalls under heavy concurrent load (real-world usage shouldn't come
// close, but a deliberate stress test can). Racing it against a shorter
// timeout means a slow response costs an extra redirect to /login instead
// of a dead page -- failing closed (treated as "not signed in") rather
// than skipping the auth check, so this can't be used to bypass it.
const AUTH_CHECK_TIMEOUT_MS = 8000;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser().
  // A simple mistake here can cause the session to randomly log out.
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), AUTH_CHECK_TIMEOUT_MS),
  );
  const user = await Promise.race([
    supabase.auth.getUser().then(({ data }) => data.user),
    timeout,
  ]);

  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return supabaseResponse as-is so cookie changes propagate.
  return supabaseResponse;
}
