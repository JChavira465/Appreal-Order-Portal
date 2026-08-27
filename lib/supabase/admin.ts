import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";

// Bypasses RLS entirely. Only for trusted server-side operations: resolving
// a rep's login_email during sign-in, and provisioning rep accounts.
export function createAdminClient() {
  return createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
