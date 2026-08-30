-- O canário v85 expôs dois timeouts PostgREST como QUERY_ERROR porque o SDK
-- devolveu objeto simples. Corrige somente a classificação técnica; auditoria,
-- status financeiro e fila permanecem preservados.
begin;

do $migration$
declare
  v_run constant uuid := '6fd5810b-e0cd-42c5-bc2f-f56d949d3d51';
  v_ids constant uuid[] := array[
    '6c018876-137c-58e7-8a6b-a93b253c7ffa'::uuid,
    'af31879b-d032-5abc-8f7b-949789edc8f6'::uuid
  ];
  v_count integer;
begin
  select count(*) into v_count
  from public.banese_reconciliation_attempts
  where run_id = v_run
    and receivable_id = any(v_ids)
    and result = 'ERROR'
    and error_class = 'QUERY_ERROR'
    and duration_ms between 8000 and 10000;
  if v_count <> 2 then
    raise exception 'Escopo do canário Banese mudou: % tentativas.', v_count
      using errcode = '23514';
  end if;

  update public.banese_reconciliation_attempts
  set error_class = 'TIMEOUT'
  where run_id = v_run
    and receivable_id = any(v_ids)
    and result = 'ERROR'
    and error_class = 'QUERY_ERROR'
    and duration_ms between 8000 and 10000;
  get diagnostics v_count = row_count;
  if v_count <> 2 then
    raise exception 'Reclassificação alterou % tentativas.', v_count
      using errcode = '23514';
  end if;

  update public.banese_reconciliation_queue
  set last_error_class = 'TIMEOUT', updated_at = now()
  where receivable_id = any(v_ids)
    and state = 'READY'
    and last_result = 'ERROR'
    and last_error_class = 'QUERY_ERROR';
  get diagnostics v_count = row_count;
  if v_count <> 2 then
    raise exception 'Reclassificação alterou % itens da fila.', v_count
      using errcode = '23514';
  end if;

  update public.contas_receber
  set gateway_last_error = null, updated_at = now()
  where id = any(v_ids)
    and status = 'PENDENTE'
    and gateway_provider = 'banese_card'
    and gateway_last_error =
      'Não foi possível confirmar o título no Banese.';
  get diagnostics v_count = row_count;
  if v_count <> 2 then
    raise exception 'Limpeza alterou % recebíveis.', v_count
      using errcode = '23514';
  end if;
end;
$migration$;

commit;
