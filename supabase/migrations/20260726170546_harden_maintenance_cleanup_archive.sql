alter table maintenance_archive.cleanup_runs enable row level security;
alter table maintenance_archive.cleanup_rows enable row level security;

revoke all on maintenance_archive.cleanup_runs
  from public, anon, authenticated;
revoke all on maintenance_archive.cleanup_rows
  from public, anon, authenticated;

grant select, insert, update on maintenance_archive.cleanup_runs
  to service_role;
grant select, insert on maintenance_archive.cleanup_rows
  to service_role;
