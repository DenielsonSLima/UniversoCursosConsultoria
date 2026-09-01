begin;

-- Trigger functions are invoked by Postgres and never need direct client access.
revoke all on function public.preserve_online_inscription_terminal_status()
  from public, anon, authenticated;

-- The archive is queried by receivable and optional online-inscription identity.
create index if not exists banese_ead_replacement_archive_receivable_idx
  on public.banese_ead_title_replacement_archive (receivable_id);
create index if not exists banese_ead_replacement_archive_inscription_idx
  on public.banese_ead_title_replacement_archive (source_inscription_id)
  where source_inscription_id is not null;

-- Service-role RPCs bypass RLS; signed-in and anonymous clients are denied.
drop policy if exists banese_ead_replacement_jobs_deny_clients
  on public.banese_ead_title_replacement_jobs;
create policy banese_ead_replacement_jobs_deny_clients
  on public.banese_ead_title_replacement_jobs
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists banese_ead_replacement_archive_deny_clients
  on public.banese_ead_title_replacement_archive;
create policy banese_ead_replacement_archive_deny_clients
  on public.banese_ead_title_replacement_archive
  for all to anon, authenticated
  using (false)
  with check (false);

commit;
