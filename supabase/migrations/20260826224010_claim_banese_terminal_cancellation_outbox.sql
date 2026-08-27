-- Reserva um lote com snapshot imutável e cerca o início da chamada remota.

create or replace function public.claim_banese_cancellation_batch(
  p_limit integer default 10
)
returns table (
  job_id uuid,
  lease_token uuid,
  receivable_id uuid,
  environment text,
  convenio text,
  nosso_numero text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_limit, 0) < 1 or p_limit > 25 then
    raise exception 'Limite inválido.';
  end if;

  with expired as (
    update public.banese_cancellation_outbox j
    set state = case
          when j.remote_attempt_started_at is null then 'RETRY'
          else 'REVIEW_REQUIRED'
        end,
        next_attempt_at = case
          when j.remote_attempt_started_at is null then now()
          else j.next_attempt_at
        end,
        lease_token = null,
        lease_until = null,
        error_class = case
          when j.remote_attempt_started_at is null
            then 'LEASE_EXPIRED_BEFORE_REMOTE_ATTEMPT'
          else 'LEASE_EXPIRED_AFTER_REMOTE_ATTEMPT'
        end,
        error_message = case
          when j.remote_attempt_started_at is null
            then 'A reserva expirou antes da tentativa remota; o item será repetido.'
          else 'A reserva expirou após o início remoto; o título exige revisão.'
        end,
        updated_at = now()
    where j.state = 'PROCESSING'
      and j.lease_until <= now()
    returning j.receivable_id, j.remote_attempt_started_at
  )
  update public.banese_reconciliation_queue q
  set state = 'READY',
      next_check_at = now(),
      lease_run_id = null,
      lease_until = null,
      last_result = 'CANCELLATION_REVIEW',
      updated_at = now()
  from expired
  where q.receivable_id = expired.receivable_id
    and expired.remote_attempt_started_at is not null
    and not (
      q.state = 'LEASED'
      and q.lease_until > now()
    );

  update public.banese_cancellation_outbox j
  set state = 'REVIEW_REQUIRED',
      error_class = 'LOCAL_PREFLIGHT_INVALID',
      error_message = 'O vínculo local do título exige revisão antes da baixa bancária.',
      updated_at = now()
  from public.contas_receber c
  join public.matriculas m on m.id = c.matricula_id
  where j.receivable_id = c.id
    and j.state in ('PENDING', 'RETRY')
    and j.created_at <= now() - interval '2 minutes'
    and not coalesce(
      m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
      and c.matricula_id = j.matricula_id
      and c.status = 'PENDENTE'
      and c.data_pagamento is null
      and c.data_vencimento > j.effective_date
      and c.data_vencimento > (now() at time zone 'America/Maceio')::date
      and c.gateway_provider = 'banese_card'
      and c.gateway_environment = j.environment
      and c.gateway_payment_method = 'BOLETO'
      and c.gateway_submission_channel = 'API'
      and c.gateway_submission_status = 'API_REGISTERED'
      and c.gateway_cnab_file_id is null
      and c.manual_settlement_id is null
      and coalesce(c.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
      and c.gateway_payment_id = c.gateway_boleto_nosso_numero
      and upper(coalesce(c.gateway_status, '')) in ('PENDING', 'REGISTERED')
      and regexp_replace(
        coalesce(c.gateway_boleto_convenio, ''), '\D', '', 'g'
      ) ~ '^[0-9]{1,20}$'
      and exists (
        select 1
        from public.matricula_movimentacoes mm
        where mm.id = j.movement_id
          and mm.matricula_id = j.matricula_id
          and mm.tipo = j.reason
          and mm.data_movimentacao = j.effective_date
          and mm.status_novo = m.status
      )
      and (
        select count(*)
        from public.payment_gateway_transactions t
        where t.receivable_id = c.id
          and t.provider_code = 'banese_card'
          and t.environment = c.gateway_environment
          and t.payment_method = 'BOLETO'
      ) = 1
      and exists (
        select 1
        from public.payment_gateway_transactions t
        where t.receivable_id = c.id
          and t.provider_code = 'banese_card'
          and t.environment = c.gateway_environment
          and t.payment_method = 'BOLETO'
          and t.remote_payment_id = c.gateway_boleto_nosso_numero
          and t.bank_slip_our_number = c.gateway_boleto_nosso_numero
          and upper(coalesce(t.remote_status, '')) in ('PENDING', 'REGISTERED')
      ),
      false
    );

  return query
  with candidates as (
    select
      j.id,
      c.id as current_receivable_id,
      regexp_replace(c.gateway_boleto_convenio, '\D', '', 'g') as current_convenio,
      c.gateway_boleto_nosso_numero as current_nosso_numero,
      c.gateway_payment_id as current_payment_id,
      t.id as current_transaction_id,
      c.data_vencimento as current_due_date,
      c.status as current_receivable_status,
      upper(c.gateway_status) as current_gateway_status,
      upper(t.remote_status) as current_transaction_status,
      c.updated_at as current_receivable_updated_at
    from public.banese_cancellation_outbox j
    join public.contas_receber c on c.id = j.receivable_id
    join public.matriculas m on m.id = c.matricula_id
    join public.matricula_movimentacoes mm on mm.id = j.movement_id
    join public.payment_gateway_transactions t
      on t.receivable_id = c.id
      and t.provider_code = 'banese_card'
      and t.environment = c.gateway_environment
      and t.payment_method = 'BOLETO'
      and t.remote_payment_id = c.gateway_boleto_nosso_numero
      and t.bank_slip_our_number = c.gateway_boleto_nosso_numero
    where j.state in ('PENDING', 'RETRY')
      and j.next_attempt_at <= now()
      and m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
      and c.matricula_id = j.matricula_id
      and c.status = 'PENDENTE'
      and c.data_pagamento is null
      and c.data_vencimento > j.effective_date
      and c.data_vencimento > (now() at time zone 'America/Maceio')::date
      and c.gateway_provider = 'banese_card'
      and c.gateway_environment = j.environment
      and c.gateway_payment_method = 'BOLETO'
      and c.gateway_submission_channel = 'API'
      and c.gateway_submission_status = 'API_REGISTERED'
      and c.gateway_cnab_file_id is null
      and c.manual_settlement_id is null
      and coalesce(c.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
      and c.gateway_payment_id = c.gateway_boleto_nosso_numero
      and upper(coalesce(c.gateway_status, '')) in ('PENDING', 'REGISTERED')
      and regexp_replace(
        coalesce(c.gateway_boleto_convenio, ''), '\D', '', 'g'
      ) ~ '^[0-9]{1,20}$'
      and upper(coalesce(t.remote_status, '')) in ('PENDING', 'REGISTERED')
      and mm.matricula_id = j.matricula_id
      and mm.tipo = j.reason
      and mm.data_movimentacao = j.effective_date
      and mm.status_novo = m.status
      and (
        select count(*)
        from public.payment_gateway_transactions unique_tx
        where unique_tx.receivable_id = c.id
          and unique_tx.provider_code = 'banese_card'
          and unique_tx.environment = c.gateway_environment
          and unique_tx.payment_method = 'BOLETO'
      ) = 1
      and not exists (
        select 1
        from public.banese_reconciliation_queue q
        where q.receivable_id = c.id
          and q.state = 'LEASED'
          and q.lease_until > now()
      )
    order by j.next_attempt_at, j.created_at, j.id
    for update of j, c, t skip locked
    limit p_limit
  ), claimed as (
    update public.banese_cancellation_outbox j
    set state = 'PROCESSING',
        attempt_count = j.attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_until = now() + interval '10 minutes',
        snapshot_convenio = candidate.current_convenio,
        snapshot_nosso_numero = candidate.current_nosso_numero,
        snapshot_payment_id = candidate.current_payment_id,
        snapshot_transaction_id = candidate.current_transaction_id,
        snapshot_due_date = candidate.current_due_date,
        snapshot_receivable_status = candidate.current_receivable_status,
        snapshot_gateway_status = candidate.current_gateway_status,
        snapshot_transaction_status = candidate.current_transaction_status,
        snapshot_receivable_updated_at = candidate.current_receivable_updated_at,
        remote_attempt_started_at = null,
        error_class = null,
        error_message = null,
        updated_at = now()
    from candidates candidate
    where j.id = candidate.id
    returning j.*
  )
  select
    claimed.id,
    claimed.lease_token,
    claimed.receivable_id,
    claimed.environment,
    claimed.snapshot_convenio,
    claimed.snapshot_nosso_numero
  from claimed;
end;
$$;

revoke all on function public.claim_banese_cancellation_batch(integer)
  from public, anon, authenticated;
grant execute on function public.claim_banese_cancellation_batch(integer)
  to service_role;

create or replace function public.start_banese_cancellation_remote_attempt(
  p_job_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.banese_cancellation_outbox%rowtype;
  v_reconciliation public.banese_reconciliation_queue%rowtype;
  v_transaction_count integer;
  v_guard_at timestamptz;
begin
  select * into v_job
  from public.banese_cancellation_outbox
  where id = p_job_id
    and state = 'PROCESSING'
    and lease_token = p_lease_token
    and lease_until > now()
  for update;
  if not found then
    raise exception 'Lease de cancelamento inválido.';
  end if;
  if v_job.remote_attempt_started_at is not null then
    return jsonb_build_object('started', true);
  end if;

  select * into v_reconciliation
  from public.banese_reconciliation_queue q
  where q.receivable_id = v_job.receivable_id
  for update;
  if found
     and v_reconciliation.state = 'LEASED'
     and v_reconciliation.lease_until > now() then
    raise exception 'Conciliação bancária em andamento; tentativa adiada.';
  end if;

  perform 1
  from public.contas_receber c
  join public.matriculas m on m.id = c.matricula_id
  join public.matricula_movimentacoes mm on mm.id = v_job.movement_id
  where c.id = v_job.receivable_id
    and c.matricula_id = v_job.matricula_id
    and c.status = 'PENDENTE'
    and c.data_pagamento is null
    and c.data_vencimento = v_job.snapshot_due_date
    and c.data_vencimento > v_job.effective_date
    and c.data_vencimento > (now() at time zone 'America/Maceio')::date
    and c.gateway_provider = 'banese_card'
    and c.gateway_environment = v_job.environment
    and c.gateway_payment_method = 'BOLETO'
    and c.gateway_submission_channel = 'API'
    and c.gateway_submission_status = 'API_REGISTERED'
    and c.gateway_cnab_file_id is null
    and c.manual_settlement_id is null
    and c.gateway_payment_id = v_job.snapshot_payment_id
    and c.gateway_boleto_nosso_numero = v_job.snapshot_nosso_numero
    and regexp_replace(c.gateway_boleto_convenio, '\D', '', 'g') =
      v_job.snapshot_convenio
    and upper(coalesce(c.gateway_status, '')) = v_job.snapshot_gateway_status
    and c.updated_at is not distinct from v_job.snapshot_receivable_updated_at
    and m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
    and mm.matricula_id = v_job.matricula_id
    and mm.tipo = v_job.reason
    and mm.data_movimentacao = v_job.effective_date
    and mm.status_novo = m.status
  for update of c;
  if not found then
    raise exception 'Recebível mudou antes da tentativa remota.';
  end if;

  select count(*) into v_transaction_count
  from public.payment_gateway_transactions t
  where t.receivable_id = v_job.receivable_id
    and t.provider_code = 'banese_card'
    and t.environment = v_job.environment
    and t.payment_method = 'BOLETO';
  if v_transaction_count <> 1 then
    raise exception 'Transação Banese ausente ou ambígua.';
  end if;

  perform 1
  from public.payment_gateway_transactions t
  where t.id = v_job.snapshot_transaction_id
    and t.receivable_id = v_job.receivable_id
    and t.provider_code = 'banese_card'
    and t.environment = v_job.environment
    and t.payment_method = 'BOLETO'
    and t.remote_payment_id = v_job.snapshot_nosso_numero
    and t.bank_slip_our_number = v_job.snapshot_nosso_numero
    and upper(coalesce(t.remote_status, '')) =
      v_job.snapshot_transaction_status
  for update;
  if not found then
    raise exception 'Identidade da transação Banese mudou.';
  end if;

  update public.contas_receber
  set updated_at = clock_timestamp()
  where id = v_job.receivable_id
  returning updated_at into v_guard_at;

  update public.banese_cancellation_outbox
  set remote_attempt_started_at = now(),
      snapshot_receivable_updated_at = v_guard_at,
      lease_until = now() + interval '10 minutes',
      updated_at = now()
  where id = v_job.id
    and state = 'PROCESSING'
    and lease_token = p_lease_token;

  update public.banese_reconciliation_queue
  set state = 'DONE',
      next_check_at = null,
      lease_run_id = null,
      lease_until = null,
      last_result = 'CANCELLATION_IN_PROGRESS',
      updated_at = now()
  where receivable_id = v_job.receivable_id;

  return jsonb_build_object('started', true);
end;
$$;

revoke all on function public.start_banese_cancellation_remote_attempt(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_banese_cancellation_remote_attempt(uuid, uuid)
  to service_role;
