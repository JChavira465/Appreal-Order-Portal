// Copy/paste from dashboards (especially on mobile) sometimes drags in a
// trailing newline or space, which breaks URL/path parsing in confusing
// ways. Trim defensively so a stray whitespace character doesn't turn into
// a support saga.
function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return trimmed;
}

export const SUPABASE_URL = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const SUPABASE_ANON_KEY = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

// Server-only secret. Never reference this from a Client Component or
// anything bundled for the browser.
export const SUPABASE_SERVICE_ROLE_KEY = () =>
  required(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
