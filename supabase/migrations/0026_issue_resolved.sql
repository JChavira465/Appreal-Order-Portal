-- Lets the super_admin check off a reported issue once it's handled,
-- instead of the Issues inbox only ever growing.
alter table issue_reports add column if not exists resolved boolean not null default false;

drop policy if exists "issue_reports_update" on issue_reports;
create policy "issue_reports_update" on issue_reports
  for update using (is_super_admin()) with check (is_super_admin());
