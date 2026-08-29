-- Importações Banese são elegíveis somente quando possuem a mesma prova local
-- exigida das emissões canônicas. A origem de importação, isoladamente, não é
-- motivo para bloquear um título pendente identificado pelo Nosso Número.
begin;

do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.prepare_banese_reconciliation_batch_v3()'::regprocedure
  );
  v_legacy_exclusion constant text := $guard$      AND NOT EXISTS (
        SELECT 1
        FROM public.payment_gateway_transactions AS gateway_transaction
        WHERE gateway_transaction.receivable_id = receivable.id
          AND gateway_transaction.provider_code = 'banese_card'
          AND gateway_transaction.environment = v_environment
          AND gateway_transaction.payment_method = 'BOLETO'
          AND coalesce(
            gateway_transaction.raw_payload ->> 'importSource', ''
          ) = 'BANESE_API_LEGACY_DISCOVERY'
      )
$guard$;
  v_canonical_evidence constant text := $guard$      AND receivable.gateway_submission_channel = 'API'
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
begin
  if position(v_canonical_evidence in v_definition) = 0 then
    if position(v_legacy_exclusion in v_definition) = 0 then
      raise exception 'Guarda esperada da seleção Banese não foi encontrada.'
        using errcode = '23514';
    end if;
    v_definition := replace(
      v_definition,
      v_legacy_exclusion,
      v_canonical_evidence
    );
  end if;

  if position(v_canonical_evidence in v_definition) = 0
    or position(v_legacy_exclusion in v_definition) > 0
    or position('pg_catalog.pg_advisory_xact_lock' in v_definition) = 0
    or position('FOR UPDATE OF locked_queue SKIP LOCKED' in v_definition) = 0
  then
    raise exception 'Contrato seguro da reserva Banese não foi preservado.'
      using errcode = '23514';
  end if;

  execute v_definition;
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
  'Reserva somente títulos Banese pendentes, comprovados por Nosso Número e evidência canônica local; itens em quarentena continuam fora.';

commit;
