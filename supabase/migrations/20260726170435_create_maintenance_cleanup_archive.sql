create schema if not exists maintenance_archive;

revoke all on schema maintenance_archive from public, anon, authenticated;
grant usage on schema maintenance_archive to service_role;

create table if not exists maintenance_archive.cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  criteria jsonb not null default '{}'::jsonb,
  baseline jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists maintenance_archive.cleanup_rows (
  id bigint generated always as identity primary key,
  run_id uuid not null
    references maintenance_archive.cleanup_runs(id)
    on delete restrict,
  source_schema text not null default 'public',
  source_table text not null,
  source_key jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  archived_at timestamptz not null default now()
);

create index if not exists cleanup_rows_run_table_idx
  on maintenance_archive.cleanup_rows (run_id, source_schema, source_table);

revoke all on all tables in schema maintenance_archive
  from public, anon, authenticated;
revoke all on all sequences in schema maintenance_archive
  from public, anon, authenticated;

grant select, insert, update on maintenance_archive.cleanup_runs
  to service_role;
grant select, insert on maintenance_archive.cleanup_rows
  to service_role;
grant usage, select on all sequences in schema maintenance_archive
  to service_role;

comment on schema maintenance_archive is
  'Private logical backups for explicitly authorized destructive maintenance.';

comment on table maintenance_archive.cleanup_rows is
  'Immutable JSONB snapshots captured before destructive cleanup operations.';
