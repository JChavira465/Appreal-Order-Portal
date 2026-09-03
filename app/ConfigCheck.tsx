// A missing environment variable takes every page down with a server-side
// exception whose only visible detail is a digest number -- correct
// (failing closed beats running half-configured) but undiagnosable
// without server logs. This app's setup involves a lot of hand-copying
// values into a dashboard, and one blank or wrongly-scoped variable looks
// identical to a code bug from the outside.
//
// So: check before anything tries to use them, and say which one is
// missing. The NAMES are not secret -- they're documented in
// .env.local.example -- and only ever appear here when the app is already
// completely down. The values are never shown.
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function missingRequiredEnv(): string[] {
  return REQUIRED.filter((name) => !process.env[name]?.trim());
}

export function ConfigError({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-script mb-4 text-center text-4xl text-black">
          Order Desk
        </h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-bold text-red-800">
            This app isn&apos;t finished being set up.
          </p>
          <p className="mt-2 text-sm text-red-700">
            {missing.length === 1
              ? "One required setting is missing:"
              : `${missing.length} required settings are missing:`}
          </p>
          <ul className="mt-2 space-y-1">
            {missing.map((name) => (
              <li key={name} className="font-mono text-xs text-red-900">
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-red-700">
            Add these in Vercel under Settings &rarr; Environment Variables,
            tick every environment, then redeploy. Values beginning
            NEXT_PUBLIC_ are baked in at build time, so a redeploy is
            required for them to take effect.
          </p>
        </div>
      </div>
    </main>
  );
}
