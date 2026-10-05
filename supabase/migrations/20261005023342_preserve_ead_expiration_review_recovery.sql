begin;

-- Durable bank intent, payment processing and canceled history remain GET-only
-- recoverable after operator disable, calendar rollover or the retry ceiling.
-- Ordinary reviews without a bank witness cannot reenter the action lane.
do $recovery$
declare v_definition text;v_patch record;v_old_count integer;v_new_count integer;
begin
  v_definition:=pg_get_functiondef('public.claim_banese_ead_checkout_expiration(text)'::regprocedure);
  if position('when v_job.remote_mutation_started_at is not null or v_job.processing_payment_detected_at is not null or v_paid' in v_definition)=0 then
    raise exception 'EAD recovery: GET-only mode guard drift.';
  end if;
  for v_patch in select * from (values
    ($old$or j.remote_mutation_started_at is not null or j.canceled_at is not null$old$,
      $new$or j.remote_mutation_started_at is not null or j.processing_payment_detected_at is not null or j.canceled_at is not null$new$,2),
    ($old$cfg.verified_local_holidays is not null or j.remote_mutation_started_at is not null$old$,
      $new$cfg.verified_local_holidays is not null or j.processing_payment_detected_at is not null
        or j.remote_mutation_started_at is not null$new$,1),
    ($old$where ((j.state='RETRY') or (j.state in ('DONE','REVIEW_REQUIRED') and j.canceled_at is not null))$old$,
      $new$where (j.state='RETRY' or (j.state in ('DONE','REVIEW_REQUIRED') and j.canceled_at is not null)
      or (j.state='REVIEW_REQUIRED' and (j.remote_mutation_started_at is not null
        or j.processing_payment_detected_at is not null)))$new$,1)
  ) as patches(old_text,new_text,expected_count) loop
    v_old_count:=(length(v_definition)-length(replace(v_definition,v_patch.old_text,'')))/length(v_patch.old_text);
    v_new_count:=(length(v_definition)-length(replace(v_definition,v_patch.new_text,'')))/length(v_patch.new_text);
    if v_old_count=v_patch.expected_count and v_new_count=0 then
      v_definition:=replace(v_definition,v_patch.old_text,v_patch.new_text);
    elsif v_old_count<>0 or v_new_count<>v_patch.expected_count then
      raise exception 'EAD recovery: claim anchor drift.';
    end if;
  end loop;
  execute v_definition;
end;
$recovery$;

do $schedule$
declare v_job record;v_old text;v_new text;v_count integer;
begin
  select jobname,schedule,command into strict v_job from cron.job
  where jobname='banese-ead-checkout-expiration-every-minute';
  if v_job.schedule<>'* * * * *'
    or position('/functions/v1/banese-ead-checkout-expiration-worker' in v_job.command)=0
    or position('public.get_banese_reconciliation_worker_secret()' in v_job.command)=0 then
    raise exception 'EAD recovery: authenticated scheduler drift.';
  end if;
  v_old:=$old$where state in ('RETRY','PROCESSING','DONE')
          and (remote_mutation_started_at is not null or canceled_at is not null)$old$;
  v_new:=$new$where state in ('RETRY','PROCESSING','DONE','REVIEW_REQUIRED')
          and (remote_mutation_started_at is not null or processing_payment_detected_at is not null or canceled_at is not null)$new$;
  v_count:=(length(v_job.command)-length(replace(v_job.command,v_old,'')))/length(v_old);
  if v_count=1 then
    perform cron.schedule(v_job.jobname,v_job.schedule,replace(v_job.command,v_old,v_new));
  elsif v_count<>0 or (length(v_job.command)-length(replace(v_job.command,v_new,'')))/length(v_new)<>1 then
    raise exception 'EAD recovery: scheduler predicate drift.';
  end if;
end;
$schedule$;

notify pgrst,'reload schema';
commit;
