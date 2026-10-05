begin;

-- Dedicated authenticated lane; normal Banese reconciliation keeps its budget.
-- The secret is read from Vault at execution time, never copied into cron text.
do $schedule$
declare v_origin text;v_command text;
begin
  select substring(command from 'https://[a-z0-9]+[.]supabase[.]co') into v_origin
  from cron.job where jobname='banese-reconciliation-every-minute';
  if v_origin is null or v_origin !~ '^https://[a-z0-9]+[.]supabase[.]co$' then
    raise exception 'Existing authenticated Banese scheduler origin unavailable.';
  end if;
  v_command:=format($cron$
    select net.http_post(
      url:=%L,
      headers:=jsonb_build_object('Content-Type','application/json',
        'X-Banese-Worker-Token',public.get_banese_reconciliation_worker_secret()),
      body:='{}'::jsonb,timeout_milliseconds:=25000)
    where exists(select 1 from public.banese_ead_checkout_expiration_config where enabled)
      or exists(select 1 from public.banese_ead_checkout_expiration_jobs
        where state in ('RETRY','PROCESSING','DONE')
          and (remote_mutation_started_at is not null or canceled_at is not null));
  $cron$,v_origin||'/functions/v1/banese-ead-checkout-expiration-worker');
  perform cron.schedule('banese-ead-checkout-expiration-every-minute','* * * * *',v_command);
end;
$schedule$;

commit;
