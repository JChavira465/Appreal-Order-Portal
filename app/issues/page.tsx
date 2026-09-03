import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { IssueRow } from "./IssueRow";

type ProfileRef = { full_name: string | null } | { full_name: string | null }[] | null;

type CompanyRef = { name: string } | { name: string }[] | null;

type IssueReportRow = {
  id: string;
  description: string;
  page_path: string | null;
  created_at: string;
  resolved: boolean;
  profiles: ProfileRef;
  companies: CompanyRef;
};

function reporterName(profiles: ProfileRef): string {
  if (!profiles) return "Unknown";
  const p = Array.isArray(profiles) ? profiles[0] : profiles;
  return p?.full_name ?? "Unknown";
}

function companyName(companies: CompanyRef): string {
  if (!companies) return "Unknown company";
  const c = Array.isArray(companies) ? companies[0] : companies;
  return c?.name ?? "Unknown company";
}

// issue_reports.created_at is a real timestamp -- shown in Texas time
// regardless of what timezone the server happens to run in.
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { timeZone: "America/Chicago" });
}

export default async function IssuesPage() {
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
    .select("platform_admin")
    .eq("id", user.id)
    .single();
  const isPlatformAdmin = profile?.platform_admin === true;

  if (!isPlatformAdmin) {
    return (
      <main className="mx-auto max-w-lg px-5 py-6">
        <Link href="/home" className="text-xs text-neutral-400 underline">
          ← Home
        </Link>
        <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          Only the platform admin can view reported issues.
        </div>
      </main>
    );
  }

  const { data: issues } = await supabase
    .from("issue_reports")
    .select(
      "id, description, page_path, created_at, resolved, profiles(full_name), companies(name)",
    )
    .order("resolved", { ascending: true })
    .order("created_at", { ascending: false });

  const rows = (issues ?? []) as IssueReportRow[];

  return (
    <main className="mx-auto max-w-lg px-5 py-6">
      <Link href="/home" className="text-xs text-neutral-400 underline">
        ← Home
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-bold text-black">Issues</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Reported straight from the app via the Report Issue button. No email
        yet -- this page is the inbox. Check one off once it&apos;s handled.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
          No issues reported.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <IssueRow key={r.id} id={r.id} resolved={r.resolved}>
              <div className="text-sm font-bold text-black">
                {companyName(r.companies)} — Submitted by: {reporterName(r.profiles)}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
                {r.description}
              </p>
              <div className="mt-2 text-[11px] text-neutral-400">
                {fmtDateTime(r.created_at)}
                {r.page_path && ` · ${r.page_path}`}
              </div>
            </IssueRow>
          ))}
        </div>
      )}
    </main>
  );
}
