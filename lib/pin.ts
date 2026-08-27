// Supabase enforces a hard floor of 6 characters on passwords -- it cannot
// be lowered from the dashboard. A 4-digit PIN is only 4 characters, so we
// pad it into a Supabase-acceptable password server-side. This adds no
// real security either way: the actual secret is still just the 4-digit
// PIN, since the prefix is a fixed constant, not something derived per
// user. Apply this everywhere a PIN becomes (or is checked against) a
// Supabase Auth password: sign-in, account provisioning, and self-service
// PIN changes.
const PIN_PASSWORD_PREFIX = "pin_";

export function pinToPassword(pin: string): string {
  return `${PIN_PASSWORD_PREFIX}${pin}`;
}
