begin;

create or replace function internal_contas.ead_expiration_identity(p_receivable_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'receivableId', c.id, 'matriculaId', c.matricula_id,
    'alunoId', c.cliente_id, 'turmaId', c.turma_id, 'poloId', c.polo_id,
    'amount', c.valor, 'dueDate', c.data_vencimento,
    'provider', c.gateway_provider, 'environment', c.gateway_environment,
    'method', c.gateway_payment_method, 'paymentId', c.gateway_payment_id,
    'convenio', c.gateway_boleto_convenio, 'nossoNumero', c.gateway_boleto_nosso_numero,
    'agency', c.gateway_boleto_agencia,
    'line', c.gateway_boleto_linha_digitavel, 'barcode', c.gateway_boleto_codigo_barras,
    'financialTerms', c.gateway_financial_terms,
    'submissionChannel', c.gateway_submission_channel,
    'submissionStatus', c.gateway_submission_status,
    'cnabFileId', c.gateway_cnab_file_id,
    'launchType', c.tipo_lancamento, 'origin', c.origem_pagamento
  ) from public.contas_receber c where c.id = p_receivable_id;
$$;
revoke all on function internal_contas.ead_expiration_identity(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_contas.ead_expiration_settlement_is_canonical(
  p_receivable_id uuid,p_transaction_id uuid
)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.contas_receber c
    join public.payment_gateway_transactions t on t.id=p_transaction_id and t.receivable_id=c.id
    where c.id=p_receivable_id and c.status='PAGO' and c.gateway_status='PAID'
      and c.origem_pagamento='BANESE' and c.data_pagamento is not null
      and coalesce(c.valor_pago,0)>0 and c.gateway_settlement_source='API'
      and coalesce((c.gateway_settlement_evidence->>'paymentCount')::integer,0)>0
      and t.provider_code='banese_card' and t.environment=c.gateway_environment
      and t.payment_method='BOLETO' and t.remote_payment_id=c.gateway_boleto_nosso_numero
      and t.bank_slip_our_number=c.gateway_boleto_nosso_numero and t.amount=c.valor
      and upper(coalesce(t.remote_status,'')) in ('PAID','RECEIVED','CONFIRMED'));
$$;
revoke all on function internal_contas.ead_expiration_settlement_is_canonical(uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.claim_banese_ead_checkout_expiration(p_lane text default 'ACTION')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_job public.banese_ead_checkout_expiration_jobs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_inscription public.inscricoes_online%rowtype;
  v_config public.banese_ead_checkout_expiration_config%rowtype;
  v_mode text;
  v_token uuid := gen_random_uuid();
  v_paid boolean;
begin
  perform set_config('lock_timeout','4s',true);
  perform set_config('statement_timeout','10s',true);
  if p_lane is null or p_lane not in ('ACTION','OBSERVE') then raise exception 'Faixa EAD inválida.'; end if;
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role'
    and session_user not in ('postgres','supabase_admin','service_role') then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  update public.banese_ead_checkout_expiration_jobs
  set state=case when attempt_count >= 5 and canceled_at is null
      and processing_payment_detected_at is null
      then 'REVIEW_REQUIRED' else 'RETRY' end,
    processing_mode=case when canceled_at is not null then 'OBSERVE'
      when remote_mutation_started_at is not null or processing_payment_detected_at is not null then 'VERIFY' else 'CANCEL' end,
    lease_token=null,lease_until=null,next_attempt_at=now(),
    last_error_code=case when processing_payment_detected_at is not null
      then 'WAITING_COMPENSATION' else 'LEASE_EXPIRED' end,updated_at=now()
  where state='PROCESSING' and lease_until <= now();

  -- Jobs are created only for an optional, unused, canonical EAD purchase.
  insert into public.banese_ead_checkout_expiration_jobs (
    receivable_id,matricula_id,inscription_id,transaction_id,environment,snapshot,
    expected_receivable_updated_at,expected_transaction_updated_at,
    expected_inscription_updated_at,first_expiration_day
  )
  select c.id,c.matricula_id,i.id,t.id,c.gateway_environment,
    internal_contas.ead_expiration_identity(c.id),c.updated_at,t.updated_at,i.updated_at,
    case when exists(select 1 from public.ead_checkout_attempts a where a.receivable_id=c.id
      and a.state='PAYMENT_RECOVERY_FENCED') then internal_contas.ead_expiration_today()
      else internal_contas.ead_expiration_first_day(c.data_vencimento,cfg.verified_local_holidays) end
  from public.contas_receber c
  join public.banese_ead_checkout_expiration_config cfg
    on cfg.environment=c.gateway_environment and cfg.enabled
    and c.polo_id=any(cfg.verified_polo_ids)
    and cfg.verified_local_holidays is not null
    and not exists(select 1 from unnest(cfg.verified_local_holidays) d where d is null or extract(year from d)<>2026)
  join public.inscricoes_online i on i.receivable_id=c.id
  join public.payment_gateway_transactions t on t.receivable_id=c.id
  where p_lane='ACTION' and internal_contas.ead_expiration_eligible(c.id)
    and c.gateway_provider='banese_card' and c.gateway_payment_method='BOLETO'
    and c.gateway_submission_channel='API' and c.gateway_submission_status='API_REGISTERED'
    and c.gateway_cnab_file_id is null and c.manual_settlement_id is null
    and c.gateway_creation_token is null
    and extract(year from internal_contas.ead_expiration_today())=2026
    and c.gateway_boleto_nosso_numero ~ '^[0-9]{9}$'
    and c.gateway_payment_id=c.gateway_boleto_nosso_numero
    and c.gateway_boleto_convenio ~ '^[0-9]{1,20}$'
    and c.gateway_boleto_linha_digitavel ~ '^0479[0-9]{43}$'
    and c.gateway_boleto_codigo_barras ~ '^0479[0-9]{40}$'
    and c.gateway_financial_terms->>'dueDate'=c.data_vencimento::text
    and jsonb_typeof(c.gateway_financial_terms)='object'
    and c.gateway_financial_terms_confirmed_at is not null
    and upper(coalesce(c.gateway_status,'')) in ('PENDING','REGISTERED','EXPIRED')
    and i.gateway_provider=c.gateway_provider
    and i.gateway_environment=c.gateway_environment
    and i.gateway_payment_id=c.gateway_payment_id
    and t.provider_code=c.gateway_provider and t.environment=c.gateway_environment
    and t.payment_method='BOLETO' and t.remote_payment_id=c.gateway_payment_id
    and t.bank_slip_our_number=c.gateway_boleto_nosso_numero
    and t.bank_slip_digitable_line=c.gateway_boleto_linha_digitavel
    and t.bank_slip_barcode=c.gateway_boleto_codigo_barras
    and t.inscricao_online_id=i.id and t.amount=c.valor
    and upper(coalesce(t.remote_status,'')) in ('PENDING','REGISTERED','EXPIRED')
    and (select count(*) from public.payment_gateway_transactions x where x.receivable_id=c.id)=1
    and (exists(select 1 from public.ead_checkout_attempts a where a.receivable_id=c.id
        and a.state='PAYMENT_RECOVERY_FENCED') or
      internal_contas.ead_expiration_first_day(c.data_vencimento,cfg.verified_local_holidays)
      <= internal_contas.ead_expiration_today())
    and not exists (select 1 from public.banese_ead_checkout_expiration_jobs j where j.receivable_id=c.id)
    and not exists (select 1 from public.banese_cancellation_outbox j
      where j.receivable_id=c.id and j.state in ('PENDING','RETRY','PROCESSING','REVIEW_REQUIRED'))
    and not exists (select 1 from public.banese_ead_title_replacement_jobs j
      where j.receivable_id=c.id and j.status in (
        'PROCESSING','RECOVERING_PIX','CANCEL_FENCED','REISSUING','REVIEW_FENCED','REVIEW_REQUIRED'))
    and not exists (select 1 from public.banese_reconciliation_queue q
      where q.receivable_id=c.id and q.state='LEASED' and q.lease_until>now())
  order by c.data_vencimento,c.id limit 1
  for update of c,t,i skip locked
  on conflict(receivable_id) do nothing;

  select j.* into v_job from public.banese_ead_checkout_expiration_jobs j
  join public.banese_ead_checkout_expiration_config cfg
    on cfg.environment=j.environment and cfg.enabled
      and (cfg.verified_local_holidays is not null or j.remote_mutation_started_at is not null
        or j.canceled_at is not null
        or internal_contas.ead_expiration_settlement_is_canonical(j.receivable_id,j.transaction_id))
  where ((j.state='RETRY') or (j.state in ('DONE','REVIEW_REQUIRED') and j.canceled_at is not null))
    and ((p_lane='ACTION' and j.canceled_at is null) or (p_lane='OBSERVE' and j.canceled_at is not null))
    and j.next_attempt_at<=now()
    and (extract(year from internal_contas.ead_expiration_today())=2026
      or j.remote_mutation_started_at is not null or j.canceled_at is not null
      or internal_contas.ead_expiration_settlement_is_canonical(j.receivable_id,j.transaction_id))
    and not exists (select 1 from public.banese_reconciliation_queue q
      where q.receivable_id=j.receivable_id and q.state='LEASED' and q.lease_until>now())
  order by case when j.state='DONE' then 1 else 0 end,j.next_attempt_at,j.created_at
  limit 1 for update of j skip locked;
  if not found then return jsonb_build_object('claimed',false); end if;

  select * into v_receivable from public.contas_receber where id=v_job.receivable_id for update;
  select * into v_transaction from public.payment_gateway_transactions where id=v_job.transaction_id for update;
  select * into v_inscription from public.inscricoes_online where id=v_job.inscription_id for update;
  select * into v_config from public.banese_ead_checkout_expiration_config where environment=v_job.environment;
  if v_job.attempt_id is null then
    update public.banese_ead_checkout_expiration_jobs
    set attempt_id=internal_contas.ead_adopt_optional_attempt(v_job.receivable_id),
      cancel_reason=case when exists(select 1 from public.ead_checkout_attempts a
        where a.receivable_id=v_job.receivable_id and a.state='PAYMENT_RECOVERY_FENCED')
        then 'DUPLICATE_PENDING' else 'EXPIRED_OPTIONAL' end
    where id=v_job.id returning * into v_job;
    select * into v_receivable from public.contas_receber where id=v_job.receivable_id;
    select * into v_inscription from public.inscricoes_online where id=v_job.inscription_id;
  end if;
  v_paid:=internal_contas.ead_expiration_settlement_is_canonical(v_receivable.id,v_transaction.id);
  v_mode:=case when v_job.canceled_at is not null then 'OBSERVE'
    when v_job.remote_mutation_started_at is not null or v_job.processing_payment_detected_at is not null or v_paid
      or v_receivable.gateway_status='EXPIRED' then 'VERIFY' else 'CANCEL' end;
  if (case when v_paid then internal_contas.ead_expiration_identity(v_job.receivable_id)-'origin'
      else internal_contas.ead_expiration_identity(v_job.receivable_id) end)
    is distinct from (case when v_paid then v_job.snapshot-'origin' else v_job.snapshot end)
    or v_transaction.receivable_id is distinct from v_job.receivable_id
    or v_transaction.remote_payment_id is distinct from v_job.snapshot->>'nossoNumero'
    or v_transaction.bank_slip_our_number is distinct from v_job.snapshot->>'nossoNumero'
    or v_inscription.receivable_id is distinct from v_job.receivable_id
    or (v_mode='CANCEL' and not internal_contas.ead_expiration_eligible(v_job.receivable_id)) then
    update public.banese_ead_checkout_expiration_jobs
    set state='REVIEW_REQUIRED',last_error_code='LOCAL_IDENTITY_CHANGED',updated_at=now()
    where id=v_job.id;
    insert into public.banese_ead_checkout_expiration_events(job_id,event,evidence)
    values(v_job.id,'REVIEW_REQUIRED',jsonb_build_object('code','LOCAL_IDENTITY_CHANGED'));
    return jsonb_build_object('claimed',false,'reviewRequired',true);
  end if;

  update public.banese_ead_checkout_expiration_jobs
  set state='PROCESSING',processing_mode=v_mode,lease_token=v_token,
    lease_until=now()+interval '2 minutes',attempt_count=attempt_count+1,
    expected_receivable_updated_at=v_receivable.updated_at,
    expected_transaction_updated_at=v_transaction.updated_at,
    expected_inscription_updated_at=v_inscription.updated_at,updated_at=now()
  where id=v_job.id;
  update public.banese_reconciliation_queue
  set state='EXPIRATION_FENCED',next_check_at=null,lease_run_id=null,lease_until=null,
    last_result='EAD_EXPIRATION_IN_PROGRESS',updated_at=now()
  where receivable_id=v_job.receivable_id;
  insert into public.banese_ead_checkout_expiration_events(job_id,event,evidence)
  values(v_job.id,'CLAIMED',jsonb_build_object('mode',v_mode,'attempt',v_job.attempt_count+1));
  return jsonb_build_object('claimed',true,'jobId',v_job.id,'leaseToken',v_token,
    'receivableId',v_job.receivable_id,'environment',v_job.environment,'mode',v_mode,
    'transactionId',v_job.transaction_id,'attemptId',v_job.attempt_id,
    'cancelReason',v_job.cancel_reason,'lateRecoveryVersion',1,
    'officialLastPaymentDate',v_job.official_last_payment_date,
    'snapshot',v_job.snapshot,'firstExpirationDay',v_job.first_expiration_day,
    'verifiedLocalHolidays',case when v_mode='CANCEL' then v_config.verified_local_holidays
      else coalesce(v_config.verified_local_holidays,'{}'::date[]) end,
    'lastErrorCode',case when v_job.processing_payment_detected_at is not null and v_job.canceled_at is null
      then 'WAITING_COMPENSATION' else v_job.last_error_code end,
    'localPaid',v_paid,'settledPaymentCount',case when v_paid
      then (v_receivable.gateway_settlement_evidence->>'paymentCount')::integer else 0 end);
end;
$$;
revoke all on function public.claim_banese_ead_checkout_expiration(text) from public,anon,authenticated;
grant execute on function public.claim_banese_ead_checkout_expiration(text) to service_role;

commit;
