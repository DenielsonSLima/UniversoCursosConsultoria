begin;

create or replace function public.start_banese_ead_checkout_expiration_mutation(
  p_job_id uuid,p_lease_token uuid,
  p_last_payment_date date default null,p_evidence_fingerprint text default null
)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_job public.banese_ead_checkout_expiration_jobs%rowtype;
  v_c public.contas_receber%rowtype;
  v_t public.payment_gateway_transactions%rowtype;
  v_i public.inscricoes_online%rowtype;
begin
  perform set_config('lock_timeout','4s',true);
  perform set_config('statement_timeout','10s',true);
  select * into v_job from public.banese_ead_checkout_expiration_jobs
  where id=p_job_id and state='PROCESSING' and lease_token=p_lease_token
    and lease_until>now() and processing_mode='CANCEL' for update;
  if not found or v_job.remote_mutation_started_at is not null or v_job.processing_payment_detected_at is not null then
    raise exception 'Lease ou intenção de expiração inválida.' using errcode='PT409';
  end if;
  perform 1 from public.banese_reconciliation_queue
  where receivable_id=v_job.receivable_id and state='EXPIRATION_FENCED' for update;
  if not found then raise exception 'Fila de expiração perdeu o fence.' using errcode='PT409'; end if;
  select * into v_c from public.contas_receber where id=v_job.receivable_id for update;
  select * into v_t from public.payment_gateway_transactions where id=v_job.transaction_id for update;
  select * into v_i from public.inscricoes_online where id=v_job.inscription_id for update;
  if p_last_payment_date is null or p_last_payment_date<v_c.data_vencimento
    or p_evidence_fingerprint is null or p_evidence_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Preflight bancário EAD incompleto.' using errcode='PT409';
  end if;
  if internal_contas.ead_expiration_identity(v_c.id) is distinct from v_job.snapshot
    or not internal_contas.ead_expiration_eligible(v_c.id)
    or v_c.updated_at is distinct from v_job.expected_receivable_updated_at
    or v_t.updated_at is distinct from v_job.expected_transaction_updated_at
    or v_i.updated_at is distinct from v_job.expected_inscription_updated_at
    or not exists (select 1 from public.banese_ead_checkout_expiration_config cfg
      where cfg.environment=v_job.environment and cfg.enabled
        and v_c.polo_id=any(cfg.verified_polo_ids)
        and extract(year from internal_contas.ead_expiration_today())=2026
        and cfg.verified_local_holidays is not null
        and not exists(select 1 from unnest(cfg.verified_local_holidays) d where d is null or extract(year from d)<>2026)
        and (v_job.cancel_reason='DUPLICATE_PENDING' or
          internal_contas.ead_expiration_first_day(v_c.data_vencimento,cfg.verified_local_holidays)
          <=internal_contas.ead_expiration_today())) then
    raise exception 'Compra EAD mudou antes da baixa bancária.' using errcode='PT409';
  end if;
  update public.banese_ead_checkout_expiration_jobs
  set remote_mutation_started_at=now(),official_last_payment_date=p_last_payment_date,
    preflight_fingerprint=p_evidence_fingerprint,updated_at=now() where id=v_job.id;
  insert into public.banese_ead_checkout_expiration_events(job_id,event,evidence)
  values(v_job.id,'REMOTE_INTENT',jsonb_build_object('lastPaymentDate',p_last_payment_date,
    'fingerprint',p_evidence_fingerprint,'cancelReason',v_job.cancel_reason));
  return true;
end;
$$;
revoke all on function public.start_banese_ead_checkout_expiration_mutation(uuid,uuid,date,text)
  from public,anon,authenticated;
grant execute on function public.start_banese_ead_checkout_expiration_mutation(uuid,uuid,date,text) to service_role;

create or replace function public.finish_banese_ead_checkout_expiration(
  p_job_id uuid,p_lease_token uuid,p_result text,
  p_remote_status text default null,p_situation_code integer default null,
  p_payment_count integer default null,p_evidence_fingerprint text default null,
  p_error_code text default null,p_last_payment_date date default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_job public.banese_ead_checkout_expiration_jobs%rowtype;
  v_c public.contas_receber%rowtype;
  v_t public.payment_gateway_transactions%rowtype;
  v_i public.inscricoes_online%rowtype;
  v_state text;
  v_event text;
  v_evidence jsonb;
  v_next_attempt timestamptz;
  v_paid boolean;
  v_banking_day date;
  v_holidays date[];
begin
  perform set_config('lock_timeout','4s',true);
  perform set_config('statement_timeout','10s',true);
  if p_result not in ('CANCELED','PAID','RETRY','REVIEW_REQUIRED','OBSERVED_UNPAID')
    or (p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{3,80}$')
    or (p_evidence_fingerprint is not null and p_evidence_fingerprint !~ '^[0-9a-f]{64}$')
    or p_remote_status is not null and p_remote_status !~ '^[A-Z_]{2,30}$'
    or p_payment_count<0 then raise exception 'Resultado de expiração inválido.'; end if;
  select * into v_job from public.banese_ead_checkout_expiration_jobs
  where id=p_job_id and state='PROCESSING' and lease_token=p_lease_token
    and lease_until>now() for update;
  if not found then raise exception 'Lease de expiração inválida.' using errcode='PT409'; end if;
  select * into v_c from public.contas_receber where id=v_job.receivable_id for update;
  select * into v_t from public.payment_gateway_transactions where id=v_job.transaction_id for update;
  select * into v_i from public.inscricoes_online where id=v_job.inscription_id for update;
  v_paid:=internal_contas.ead_expiration_settlement_is_canonical(v_c.id,v_t.id);
  if (case when v_paid then internal_contas.ead_expiration_identity(v_job.receivable_id)-'origin'
      else internal_contas.ead_expiration_identity(v_job.receivable_id) end)
    is distinct from (case when v_paid then v_job.snapshot-'origin' else v_job.snapshot end)
    or v_t.receivable_id is distinct from v_c.id
    or v_i.receivable_id is distinct from v_c.id
    or v_t.remote_payment_id is distinct from v_job.snapshot->>'nossoNumero'
    or v_i.gateway_payment_id is distinct from v_job.snapshot->>'nossoNumero' then
    raise exception 'Identidade EAD mudou durante a consulta.' using errcode='PT409';
  end if;
  v_evidence:=jsonb_strip_nulls(jsonb_build_object('remoteStatus',p_remote_status,
    'situationCode',p_situation_code,'paymentCount',p_payment_count,
    'fingerprint',p_evidence_fingerprint,'code',p_error_code,'lastPaymentDate',p_last_payment_date));
  if p_result in ('CANCELED','OBSERVED_UNPAID') and v_job.official_last_payment_date is not null
    and p_last_payment_date is not null and p_last_payment_date<>v_job.official_last_payment_date then
    raise exception 'Data limite bancária mudou durante a expiração.' using errcode='PT409'; end if;

  if p_result='PAID' then
    -- The regular reconciliation must first confirm amount/date and activation.
    if not v_paid or v_c.status<>'PAGO' or v_c.data_pagamento is null or coalesce(v_c.valor_pago,0)<=0
      or upper(coalesce(v_t.remote_status,'')) not in ('PAID','RECEIVED','CONFIRMED')
      or v_i.status<>'PAGO' or coalesce(p_payment_count,0)<1
      or p_remote_status<>'PAID' then raise exception 'Pagamento EAD não foi conciliado.'; end if;
    v_state:='PAID';v_event:='PAYMENT_CONFIRMED';v_next_attempt:='infinity';
  elsif p_result='CANCELED' then
    if coalesce(p_last_payment_date,v_job.official_last_payment_date) is null
      or coalesce(p_last_payment_date,v_job.official_last_payment_date)<v_c.data_vencimento then
      raise exception 'Data limite bancária ausente.' using errcode='PT409';
    end if;
    if not coalesce((p_situation_code=5 and p_remote_status='CANCELED')
        or (p_situation_code=4 and p_remote_status='EXPIRED'),false)
      or p_payment_count is distinct from 0 or p_evidence_fingerprint is null
      or v_job.processing_mode='OBSERVE'
      or not internal_contas.ead_expiration_eligible(v_c.id)
      or v_c.data_pagamento is not null or coalesce(v_c.valor_pago,0)<>0
      or v_c.updated_at is distinct from v_job.expected_receivable_updated_at
      or v_t.updated_at is distinct from v_job.expected_transaction_updated_at
      or v_i.updated_at is distinct from v_job.expected_inscription_updated_at then
      raise exception 'Cancelamento Banese não está confirmado ou o snapshot mudou.' using errcode='PT409';
    end if;
    perform set_config('app.ead_expiration_job',v_job.id::text,true);
    perform set_config('app.ead_expiration_lease',p_lease_token::text,true);
    update public.payment_gateway_transactions
    set remote_status=p_remote_status,last_error=null,synced_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=v_job.transaction_id;
    update public.contas_receber
    set status='CANCELADO',gateway_status=p_remote_status,gateway_last_error=null,
      gateway_synced_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=v_job.receivable_id;
    update public.inscricoes_online
    set status='CANCELADO',erro='Compra EAD expirada sem pagamento confirmado.',updated_at=clock_timestamp()
    where id=v_job.inscription_id;
    update public.banese_ead_checkout_expiration_jobs
    set canceled_at=now(),observe_until=now()+interval '14 days',
      official_last_payment_date=coalesce(official_last_payment_date,p_last_payment_date)
    where id=v_job.id;
    update public.ead_checkout_attempts set state='EXPIRED',canceled_at=now(),updated_at=now()
    where id=v_job.attempt_id;
    update public.ead_payment_reviews set state='RESOLVED',resolution_action='BANK_CANCELLATION_CONFIRMED',
      resolved_at=now(),updated_at=now() where other_attempt_id=v_job.attempt_id
      and reason='PENDING_ATTEMPT_CANCELLATION' and state='OPEN';
    v_state:='DONE';v_event:='CANCEL_CONFIRMED';v_next_attempt:=now()+interval '1 day';
  elsif p_result='OBSERVED_UNPAID' then
    if v_job.processing_mode<>'OBSERVE' or v_job.canceled_at is null
      or p_last_payment_date is null or p_last_payment_date<v_c.data_vencimento
      or v_c.status<>'CANCELADO' or not coalesce(
        (p_situation_code=5 and p_remote_status='CANCELED')
        or (p_situation_code=4 and p_remote_status='EXPIRED'),false)
      or p_remote_status is distinct from v_job.remote_status or p_payment_count is distinct from 0 then
      raise exception 'Verificação do cancelamento EAD inválida.';
    end if;
    v_state:='DONE';v_event:='OBSERVED_UNPAID';v_next_attempt:=now()+interval '1 day';
  else
    if p_error_code is null then raise exception 'Diagnóstico de expiração ausente.'; end if;
    v_state:=case when p_result='REVIEW_REQUIRED'
      or v_job.attempt_count>=5 and v_job.canceled_at is null
        and v_job.processing_payment_detected_at is null and p_error_code<>'WAITING_COMPENSATION'
      then 'REVIEW_REQUIRED' else 'RETRY' end;
    v_event:=v_state;
    v_next_attempt:=case when v_job.canceled_at is not null
      then now()+interval '1 day' else now()+interval '5 minutes' end;
    if p_error_code='WAITING_COMPENSATION' then
      select verified_local_holidays into v_holidays
      from public.banese_ead_checkout_expiration_config where environment=v_job.environment;
      v_banking_day:=public.banese_next_national_banking_day(
        internal_contas.ead_expiration_today()+1);
      while v_banking_day=any(v_holidays) loop
        v_banking_day:=public.banese_next_national_banking_day(v_banking_day+1);
      end loop;
      -- This result is GET-only: an unavailable calendar cannot authorize PUT
      -- and must not prevent observing a payment already processing at bank.
      if v_banking_day is null or v_holidays is null then v_next_attempt:=now()+interval '1 day';
      else v_next_attempt:=greatest(now()+interval '1 day',
        v_banking_day::timestamp at time zone 'America/Maceio'); end if;
    end if;
  end if;

  update public.banese_ead_checkout_expiration_jobs
  set state=v_state,remote_status=coalesce(p_remote_status,remote_status),
    official_last_payment_date=coalesce(official_last_payment_date,p_last_payment_date),
    last_error_code=p_error_code,lease_token=null,lease_until=null,
    next_attempt_at=v_next_attempt,updated_at=now()
    ,processing_payment_detected_at=case when p_error_code='WAITING_COMPENSATION'
      then coalesce(processing_payment_detected_at,now()) else processing_payment_detected_at end
  where id=v_job.id;
  insert into public.banese_ead_checkout_expiration_events(job_id,event,evidence)
  values(v_job.id,v_event,v_evidence);
  update public.banese_reconciliation_queue
  set state=case when v_state in ('DONE','PAID') then 'DONE'
      when v_job.canceled_at is not null or p_error_code='LATE_PAYMENT_DETECTED'
        then 'QUARANTINED'
      when v_job.remote_mutation_started_at is not null then 'EXPIRATION_FENCED'
      else 'READY' end,
    next_check_at=case when v_state in ('DONE','PAID') or v_job.canceled_at is not null
      or v_job.remote_mutation_started_at is not null then null else now() end,
    lease_run_id=null,lease_until=null,last_result='EAD_EXPIRATION_'||v_state,updated_at=now()
  where receivable_id=v_job.receivable_id;
  return jsonb_build_object('jobId',v_job.id,'state',v_state);
end;
$$;
revoke all on function public.finish_banese_ead_checkout_expiration(uuid,uuid,text,text,integer,integer,text,text,date)
  from public,anon,authenticated;
grant execute on function public.finish_banese_ead_checkout_expiration(uuid,uuid,text,text,integer,integer,text,text,date)
  to service_role;

commit;
