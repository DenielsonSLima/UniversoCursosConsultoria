begin;

create function public.recover_banese_ead_checkout_payment(p_job_id uuid,p_lease_token uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_j public.banese_ead_checkout_expiration_jobs%rowtype;v_a public.ead_checkout_attempts%rowtype;
  v_c public.contas_receber%rowtype;v_i public.inscricoes_online%rowtype;v_t public.payment_gateway_transactions%rowtype;
  v_other public.ead_checkout_attempts%rowtype;v_review uuid;v_state text:='PAID';v_valid boolean;
  v_date date;v_last_date date;v_count integer;v_cents bigint;v_method text;v_fingerprint text;v_range bigint[];
begin
  perform internal_contas.ead_assert_service_role();
  perform set_config('lock_timeout','4s',true);
  perform set_config('statement_timeout','10s',true);
  if jsonb_typeof(p_evidence) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_evidence) k
    where k not in ('paymentCount','paymentDate','totalAmountCents','settlementMethod','evidenceFingerprint','lastPaymentDate','expectedSnapshot')) then
    raise exception 'Evidência bancária EAD inválida.';
  end if;
  select * into strict v_j from public.banese_ead_checkout_expiration_jobs where id=p_job_id;
  perform 1 from public.matriculas where id=v_j.matricula_id for update;
  perform 1 from public.ead_checkout_attempts where matricula_id=v_j.matricula_id order by sequence_number for update;
  select * into strict v_a from public.ead_checkout_attempts where id=v_j.attempt_id;
  select * into strict v_c from public.contas_receber where id=v_j.receivable_id for update;
  select * into strict v_i from public.inscricoes_online where id=v_j.inscription_id for update;
  select * into strict v_t from public.payment_gateway_transactions where id=v_j.transaction_id for update;
  select * into strict v_j from public.banese_ead_checkout_expiration_jobs where id=p_job_id for update;
  v_fingerprint:=p_evidence->>'evidenceFingerprint';
  if v_fingerprint is null or v_fingerprint !~ '^[0-9a-f]{64}$'
    or p_evidence->'expectedSnapshot' is distinct from v_j.snapshot
    or (internal_contas.ead_expiration_identity(v_c.id)-'origin') is distinct from (v_j.snapshot-'origin')
    or v_a.receivable_id is distinct from v_c.id or v_a.inscription_id is distinct from v_i.id
    or v_c.ead_checkout_attempt_id is distinct from v_a.id or v_i.ead_checkout_attempt_id is distinct from v_a.id
    or v_t.receivable_id is distinct from v_c.id or v_t.inscricao_online_id is distinct from v_i.id
    or v_t.remote_payment_id is distinct from v_j.snapshot->>'nossoNumero'
    or v_t.provider_code is distinct from 'banese_card' or v_t.environment is distinct from v_c.gateway_environment
    or v_i.gateway_payment_id is distinct from v_j.snapshot->>'nossoNumero' then
    raise exception 'Identidade da recuperação EAD divergente.' using errcode='PT409';
  end if;
  if v_j.state='PAID' and v_j.recovery_fingerprint=v_fingerprint then
    if (p_evidence-'expectedSnapshot') is distinct from v_c.gateway_settlement_evidence then
      raise exception 'Replay bancário EAD com evidência alterada.' using errcode='PT409'; end if;
    select id into v_review from public.ead_payment_reviews where attempt_id=v_a.id and reason='DUPLICATE_PAYMENT';
    return jsonb_build_object('jobId',v_j.id,'receivableId',v_c.id,'attemptId',v_a.id,
      'state',v_a.state,'paid',true,'reviewId',v_review);
  end if;
  if v_j.state<>'PROCESSING' or v_j.lease_token is distinct from p_lease_token or v_j.lease_until<=now()
    or not (v_j.processing_mode='OBSERVE' and v_j.canceled_at is not null
      or v_j.cancel_reason='DUPLICATE_PENDING')
    or v_c.status not in ('CANCELADO','PENDENTE','VENCIDO','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO') then
    raise exception 'Lease de recuperação EAD inválida.' using errcode='PT409';
  end if;
  begin
    if p_evidence->>'paymentCount' !~ '^[0-9]{1,6}$'
      or p_evidence->>'totalAmountCents' !~ '^[0-9]{1,14}$'
      or p_evidence->>'paymentDate' !~ '^202[6-9]-[0-9]{2}-[0-9]{2}$'
      or p_evidence->>'lastPaymentDate' !~ '^202[6-9]-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Formato de pagamento inválido.';
    end if;
    v_count:=(p_evidence->>'paymentCount')::integer;v_cents:=(p_evidence->>'totalAmountCents')::bigint;
    v_date:=(p_evidence->>'paymentDate')::date;v_last_date:=(p_evidence->>'lastPaymentDate')::date;
  exception when others then v_count:=null;v_cents:=null;v_date:=null;v_last_date:=null;
  end;
  v_method:=p_evidence->>'settlementMethod';
  v_range:=internal_contas.ead_verified_settlement_cents(v_j.snapshot,v_date);
  -- Compute the payment range in the database before any canonical mutation.
  v_valid:=coalesce(v_count=1 and v_cents between v_range[1] and v_range[2] and v_cents>0
    and v_date is not null and v_date<=internal_contas.ead_expiration_today() and v_last_date>=v_c.data_vencimento
    and (v_j.official_last_payment_date is null or v_last_date=v_j.official_last_payment_date)
    and v_method in ('BOLETO','PIX','NAO_IDENTIFICADO'),false);
  if not v_valid then
    insert into public.ead_payment_reviews(attempt_id,receivable_id,polo_id,reason,evidence)
    values(v_a.id,v_c.id,v_c.polo_id,'PAYMENT_EVIDENCE_MISMATCH',p_evidence-'expectedSnapshot')
    on conflict(attempt_id,reason) do update set evidence=excluded.evidence,updated_at=now()
    returning id into v_review;
    update public.banese_ead_checkout_expiration_jobs set state='REVIEW_REQUIRED',
      last_error_code='PAYMENT_EVIDENCE_MISMATCH',lease_token=null,lease_until=null,updated_at=now() where id=v_j.id;
    insert into public.banese_ead_checkout_expiration_events(job_id,event,evidence)
    values(v_j.id,'REVIEW_REQUIRED',jsonb_build_object('reviewId',v_review,'fingerprint',v_fingerprint));
    return jsonb_build_object('jobId',v_j.id,'receivableId',v_c.id,'attemptId',v_a.id,
      'state','REVIEW_REQUIRED','paid',false,'reviewId',v_review);
  end if;
  select * into v_other from public.ead_checkout_attempts where matricula_id=v_a.matricula_id
    and id<>v_a.id and state in ('PAID','PAID_REVIEW') order by paid_at,id limit 1;
  if v_other.id is not null then
    v_state:='PAID_REVIEW';
    insert into public.ead_payment_reviews(attempt_id,other_attempt_id,receivable_id,polo_id,reason,evidence)
    values(v_a.id,v_other.id,v_c.id,v_c.polo_id,'DUPLICATE_PAYMENT',p_evidence-'expectedSnapshot')
    on conflict(attempt_id,reason) do update set evidence=excluded.evidence,updated_at=now()
    returning id into v_review;
  end if;
  perform set_config('app.ead_expiration_job',v_j.id::text,true);
  perform set_config('app.ead_expiration_lease',p_lease_token::text,true);
  update public.ead_checkout_attempts set state=v_state,paid_at=v_date,payment_fingerprint=v_fingerprint,updated_at=now() where id=v_a.id;
  update public.payment_gateway_transactions set remote_status='PAID',last_error=null,synced_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_t.id;
  update public.contas_receber set status='PAGO',valor_pago=v_cents/100.0,data_pagamento=v_date,
    forma_pagamento=v_method,origem_pagamento='BANESE',gateway_status='PAID',gateway_settlement_source='API',
    gateway_settlement_channel=v_method,gateway_settlement_evidence=p_evidence-'expectedSnapshot',
    gateway_last_error=null,gateway_synced_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_c.id;
  update public.inscricoes_online set status='PAGO',pago_em=v_date,confirmado_em=now(),erro=null,updated_at=clock_timestamp() where id=v_i.id;
  -- Fence every other unpaid attempt before any new emission or ordinary
  -- settlement can proceed. The bank job closes it only after confirmation.
  for v_other in select * from public.ead_checkout_attempts where matricula_id=v_a.matricula_id
    and id<>v_a.id and state in ('RESERVED','OPEN','PAYMENT_RECOVERY_FENCED') loop
    update public.ead_checkout_attempts set state='PAYMENT_RECOVERY_FENCED',updated_at=now() where id=v_other.id;
    insert into public.ead_payment_reviews(attempt_id,other_attempt_id,receivable_id,polo_id,reason,evidence)
    values(v_a.id,v_other.id,v_c.id,v_c.polo_id,'PENDING_ATTEMPT_CANCELLATION',
      jsonb_build_object('paidReceivableId',v_c.id,'pendingReceivableId',v_other.receivable_id))
    on conflict(attempt_id,reason) do nothing;
    update public.banese_reconciliation_queue set state='EXPIRATION_FENCED',next_check_at=null,
      lease_run_id=null,lease_until=null,last_result='EAD_DUPLICATE_PENDING',updated_at=now() where receivable_id=v_other.receivable_id;
  end loop;
  update public.banese_ead_checkout_expiration_jobs set state='PAID',lease_token=null,lease_until=null,
    recovery_fingerprint=v_fingerprint,official_last_payment_date=v_last_date,next_attempt_at='infinity',updated_at=now() where id=v_j.id;
  update public.banese_reconciliation_queue set state='DONE',next_check_at=null,lease_run_id=null,lease_until=null,
    last_result='EAD_LATE_PAYMENT_RECOVERED',updated_at=now() where receivable_id=v_c.id;
  insert into public.banese_ead_checkout_expiration_events(job_id,event,evidence)
  values(v_j.id,'PAYMENT_CONFIRMED',jsonb_build_object('attemptId',v_a.id,'fingerprint',v_fingerprint,'state',v_state,'reviewId',v_review));
  return jsonb_build_object('jobId',v_j.id,'receivableId',v_c.id,'attemptId',v_a.id,
    'state',v_state,'paid',true,'reviewId',v_review);
end; $$;
revoke all on function public.recover_banese_ead_checkout_payment(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.recover_banese_ead_checkout_payment(uuid,uuid,jsonb) to service_role;

commit;
