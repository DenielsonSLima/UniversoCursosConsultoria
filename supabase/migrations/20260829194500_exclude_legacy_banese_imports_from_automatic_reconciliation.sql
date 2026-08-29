-- Importações legadas já carregam a evidência histórica do Banese, mas não
-- passaram pelo POST canônico deste sistema. Elas não podem ser consultadas
-- pela conciliação automática nem bloquear a fila dos boletos emitidos aqui.
begin;

do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.prepare_banese_reconciliation_batch_v3()'::regprocedure
  );
  v_anchor constant text := $anchor$      AND coalesce(receivable.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
      AND (
        v_profile.queue_strategy = 'GENERAL'$anchor$;
  v_legacy_guard constant text := $guard$      AND NOT EXISTS (
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
  v_replacement constant text := $replacement$      AND coalesce(receivable.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
      AND NOT EXISTS (
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
      AND (
        v_profile.queue_strategy = 'GENERAL'$replacement$;
begin
  if position(v_legacy_guard in v_definition) = 0 then
    if position(v_anchor in v_definition) = 0 then
      raise exception 'Contrato inesperado na seleção da fila Banese.';
    end if;
    v_definition := replace(v_definition, v_anchor, v_replacement);
  end if;

  if position('pg_catalog.pg_advisory_xact_lock' in v_definition) = 0
    or position('FOR UPDATE OF locked_queue SKIP LOCKED' in v_definition) = 0
    or position(v_legacy_guard in v_definition) = 0
  then
    raise exception 'Guardas da reserva Banese ausentes.';
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
  'Reserva atomicamente somente boletos Banese emitidos pela API canônica; imports legados ficam fora da conciliação automática.';

commit;
