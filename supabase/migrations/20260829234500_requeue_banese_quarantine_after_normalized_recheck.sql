-- Reabre somente os 32 títulos já comprovados para uma única reconsulta
-- segura: 19 importados cuja resposta omite zeros à esquerda e os 13 títulos
-- T42 bloqueados pela guarda de persistência já corrigida.
begin;

do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.prepare_banese_reconciliation_batch_v3()'::regprocedure
  );
  v_exact_evidence constant text := $guard$      AND receivable.gateway_submission_channel = 'API'
      AND receivable.gateway_submission_status = 'API_REGISTERED'
      AND receivable.gateway_financial_terms IS NOT NULL
      AND receivable.gateway_financial_terms_confirmed_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.payment_gateway_transactions AS gateway_transaction
        WHERE gateway_transaction.receivable_id = receivable.id
          AND gateway_transaction.provider_code = 'banese_card'
          AND gateway_transaction.environment = v_environment
          AND gateway_transaction.payment_method = 'BOLETO'
          AND gateway_transaction.remote_payment_id =
            receivable.gateway_boleto_nosso_numero
          AND gateway_transaction.bank_slip_our_number =
            receivable.gateway_boleto_nosso_numero
          AND gateway_transaction.bank_slip_digitable_line =
            receivable.gateway_boleto_linha_digitavel
          AND gateway_transaction.bank_slip_barcode =
            receivable.gateway_boleto_codigo_barras
      )
$guard$;
  v_normalized_evidence constant text := $guard$      AND receivable.gateway_submission_channel = 'API'
      AND receivable.gateway_submission_status = 'API_REGISTERED'
      AND receivable.gateway_financial_terms IS NOT NULL
      AND receivable.gateway_financial_terms_confirmed_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.payment_gateway_transactions AS gateway_transaction
        WHERE gateway_transaction.receivable_id = receivable.id
          AND gateway_transaction.provider_code = 'banese_card'
          AND gateway_transaction.environment = v_environment
          AND gateway_transaction.payment_method = 'BOLETO'
          AND regexp_replace(
            coalesce(gateway_transaction.remote_payment_id, ''),
            '\\D', '', 'g'
          ) ~ '^[0-9]{1,9}$'
          AND lpad(
            regexp_replace(
              gateway_transaction.remote_payment_id, '\\D', '', 'g'
            ), 9, '0'
          ) = receivable.gateway_boleto_nosso_numero
          AND regexp_replace(
            coalesce(gateway_transaction.bank_slip_our_number, ''),
            '\\D', '', 'g'
          ) ~ '^[0-9]{1,9}$'
          AND lpad(
            regexp_replace(
              gateway_transaction.bank_slip_our_number, '\\D', '', 'g'
            ), 9, '0'
          ) = receivable.gateway_boleto_nosso_numero
          AND gateway_transaction.bank_slip_digitable_line =
            receivable.gateway_boleto_linha_digitavel
          AND gateway_transaction.bank_slip_barcode =
            receivable.gateway_boleto_codigo_barras
      )
$guard$;
  v_radiology_count integer := 0;
  v_t42_count integer := 0;
  v_released_count integer := 0;
begin
  if position(v_normalized_evidence in v_definition) = 0 then
    if position(v_exact_evidence in v_definition) = 0 then
      raise exception 'Evidência Banese esperada não foi encontrada.'
        using errcode = '23514';
    end if;
    v_definition := replace(v_definition, v_exact_evidence, v_normalized_evidence);
  end if;

  if position(v_normalized_evidence in v_definition) = 0
    or position('pg_catalog.pg_advisory_xact_lock' in v_definition) = 0
    or position('FOR UPDATE OF locked_queue SKIP LOCKED' in v_definition) = 0
  then
    raise exception 'Contrato seguro da reserva Banese não foi preservado.'
      using errcode = '23514';
  end if;

  execute v_definition;

  select count(*) into v_radiology_count
  from public.banese_reconciliation_queue as queue
  join public.contas_receber as receivable
    on receivable.id = queue.receivable_id
  where queue.environment = 'production'
    and queue.state = 'QUARANTINED'
    and queue.last_result = 'ERROR'
    and queue.last_error_class = 'REVIEW_REQUIRED'
    and receivable.status in ('PENDENTE', 'VENCIDO')
    and receivable.gateway_submission_channel = 'API'
    and receivable.gateway_submission_status = 'API_REGISTERED'
    and receivable.gateway_financial_terms is not null
    and receivable.gateway_financial_terms_confirmed_at is not null
    and exists (
      select 1
      from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = receivable.id
        and transaction.provider_code = 'banese_card'
        and transaction.environment = queue.environment
        and transaction.payment_method = 'BOLETO'
        and coalesce(transaction.raw_payload ->> 'importSource', '') =
          'BANESE_API_LEGACY_DISCOVERY'
        and regexp_replace(coalesce(transaction.remote_payment_id, ''), '\\D', '', 'g')
          ~ '^[0-9]{1,9}$'
        and lpad(regexp_replace(transaction.remote_payment_id, '\\D', '', 'g'), 9, '0') =
          receivable.gateway_boleto_nosso_numero
        and regexp_replace(coalesce(transaction.bank_slip_our_number, ''), '\\D', '', 'g')
          ~ '^[0-9]{1,9}$'
        and lpad(regexp_replace(transaction.bank_slip_our_number, '\\D', '', 'g'), 9, '0') =
          receivable.gateway_boleto_nosso_numero
        and transaction.bank_slip_digitable_line =
          receivable.gateway_boleto_linha_digitavel
        and transaction.bank_slip_barcode =
          receivable.gateway_boleto_codigo_barras
    );

  select count(*) into v_t42_count
  from public.banese_reconciliation_queue as queue
  join public.contas_receber as receivable
    on receivable.id = queue.receivable_id
  join public.banese_boleto_recovery_targets as target
    on target.receivable_id = queue.receivable_id
  where queue.environment = 'production'
    and queue.state = 'QUARANTINED'
    and queue.last_result = 'ERROR'
    and queue.last_error_class = 'QUERY_ERROR'
    and target.state = 'EXHAUSTED'
    and target.completed_at is not null
    and receivable.status in ('PENDENTE', 'VENCIDO')
    and receivable.gateway_submission_channel = 'API'
    and receivable.gateway_submission_status = 'API_REGISTERED'
    and receivable.gateway_financial_terms is not null
    and receivable.gateway_financial_terms_confirmed_at is not null
    and exists (
      select 1
      from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = receivable.id
        and transaction.provider_code = 'banese_card'
        and transaction.environment = queue.environment
        and transaction.payment_method = 'BOLETO'
        and transaction.remote_payment_id = receivable.gateway_boleto_nosso_numero
        and transaction.bank_slip_our_number = receivable.gateway_boleto_nosso_numero
        and transaction.bank_slip_digitable_line = receivable.gateway_boleto_linha_digitavel
        and transaction.bank_slip_barcode = receivable.gateway_boleto_codigo_barras
    );

  if v_radiology_count <> 19 or v_t42_count <> 13 then
    raise exception 'Escopo de reconsulta Banese mudou: Radiologia %, T42 %.',
      v_radiology_count, v_t42_count using errcode = '23514';
  end if;

  with eligible as (
    select queue.receivable_id
    from public.banese_reconciliation_queue as queue
    join public.contas_receber as receivable
      on receivable.id = queue.receivable_id
    where queue.environment = 'production'
      and queue.state = 'QUARANTINED'
      and (
        queue.last_error_class = 'REVIEW_REQUIRED'
        or queue.last_error_class = 'QUERY_ERROR'
      )
      and receivable.status in ('PENDENTE', 'VENCIDO')
      and receivable.gateway_submission_channel = 'API'
      and receivable.gateway_submission_status = 'API_REGISTERED'
      and receivable.gateway_financial_terms is not null
      and receivable.gateway_financial_terms_confirmed_at is not null
      and exists (
        select 1
        from public.payment_gateway_transactions as transaction
        where transaction.receivable_id = receivable.id
          and transaction.provider_code = 'banese_card'
          and transaction.environment = queue.environment
          and transaction.payment_method = 'BOLETO'
          and transaction.bank_slip_digitable_line = receivable.gateway_boleto_linha_digitavel
          and transaction.bank_slip_barcode = receivable.gateway_boleto_codigo_barras
          and (
            (
              queue.last_error_class = 'REVIEW_REQUIRED'
              and coalesce(transaction.raw_payload ->> 'importSource', '') =
                'BANESE_API_LEGACY_DISCOVERY'
              and lpad(regexp_replace(transaction.remote_payment_id, '\\D', '', 'g'), 9, '0') =
                receivable.gateway_boleto_nosso_numero
              and lpad(regexp_replace(transaction.bank_slip_our_number, '\\D', '', 'g'), 9, '0') =
                receivable.gateway_boleto_nosso_numero
            )
            or (
              queue.last_error_class = 'QUERY_ERROR'
              and exists (
                select 1
                from public.banese_boleto_recovery_targets as target
                where target.receivable_id = queue.receivable_id
                  and target.state = 'EXHAUSTED'
                  and target.completed_at is not null
              )
              and transaction.remote_payment_id = receivable.gateway_boleto_nosso_numero
              and transaction.bank_slip_our_number = receivable.gateway_boleto_nosso_numero
            )
          )
      )
  ), released as (
    update public.banese_reconciliation_queue as queue
    set state = 'READY',
        next_check_at = now(),
        lease_run_id = null,
        lease_until = null,
        consecutive_failures = 0,
        last_result = null,
        last_error_class = null,
        updated_at = now()
    from eligible
    where queue.receivable_id = eligible.receivable_id
    returning queue.receivable_id
  )
  select count(*) into v_released_count from released;

  if v_released_count <> 32 then
    raise exception 'Reconsulta Banese liberou % títulos, esperado 32.',
      v_released_count using errcode = '23514';
  end if;
end;
$migration$;

alter function public.prepare_banese_reconciliation_batch_v3()
  security invoker;
alter function public.prepare_banese_reconciliation_batch_v3()
  set search_path = '';
revoke all on function public.prepare_banese_reconciliation_batch_v3()
  from public, anon, authenticated;
grant execute on function public.prepare_banese_reconciliation_batch_v3()
  to service_role;

comment on function public.prepare_banese_reconciliation_batch_v3() is
  'Reserva títulos Banese pendentes com evidência canônica; Nosso Número remoto pode omitir somente zeros à esquerda.';

commit;
