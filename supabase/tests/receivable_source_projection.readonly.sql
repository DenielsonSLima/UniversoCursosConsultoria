-- Somente leituras das duas RPCs realmente consumidas pelo Contas a Receber.
-- Executar após 023100; não abre baixa, fila, emissão ou cancelamento.
begin;
set local statement_timeout = '30s';
set local plpgsql.check_asserts = 'on';
select set_config('request.jwt.claim.role', 'service_role', true);
do $test$
declare
  v_page jsonb;
  v_groups jsonb;
  v_row jsonb;
  v_cap jsonb;
begin
  v_page := public.get_receivables_modality_page_v4_secure(
    p_modality => 'TECNICO', p_status_scope => 'all', p_page_size => 25);
  assert jsonb_array_length(v_page->'rows') > 0, 'Fixture técnico indisponível';
  for v_row in select value from jsonb_array_elements(v_page->'rows') loop
    select internal_academic.receivable_operation_capabilities(cr)
      into v_cap from public.contas_receber cr where cr.id=(v_row->>'id')::uuid;
    assert v_row->'operation_capabilities' = v_cap,
      'Página perdeu as capabilities canônicas';
    assert v_row ? 'banese_cancellation', 'Página perdeu o estado da fila';
  end loop;

  v_groups := public.get_receivables_modality_groups_page_v3_secure(
    p_modality => 'TECNICO', p_status_scope => 'all', p_page_size => 10);
  assert jsonb_array_length(v_groups->'groups') > 0, 'Grupos indisponíveis';
  for v_row in
    select value->'first_row' from jsonb_array_elements(v_groups->'groups')
  loop
    select internal_academic.receivable_operation_capabilities(cr)
      into v_cap from public.contas_receber cr where cr.id=(v_row->>'id')::uuid;
    assert v_row->'operation_capabilities' = v_cap,
      'Grupo perdeu as capabilities canônicas';
  end loop;

  perform set_config('request.jwt.claim.role', 'anon', true);
  begin
    perform public.get_receivables_modality_page_v4_secure('TECNICO');
    raise exception 'Página financeira aceitou anônimo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_receivables_modality_groups_page_v3_secure('TECNICO');
    raise exception 'Grupo financeiro aceitou anônimo';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
rollback;
