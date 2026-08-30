-- "Report Issue" button, available to anyone signed in. There's no email
-- pipeline yet (see 0024/README), so this is the inbox until there is one:
-- any signed-in user can log a report, only the account owner
-- (super_admin) can read them.
create table if not exists issue_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles (id),
  description text not null,
  page_path text,
  created_at timestamptz not null default now()
);

alter table issue_reports enable row level security;

drop policy if exists "issue_reports_insert" on issue_reports;
create policy "issue_reports_insert" on issue_reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists "issue_reports_select" on issue_reports;
create policy "issue_reports_select" on issue_reports
  for select using (is_super_admin());
