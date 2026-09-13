-- Read-only contract checks. Supply an imported class UUID through
-- app.diario_historical_cards_test_turma before running with MCP SQL.
begin;
do $test$
declare
  v_turma uuid := nullif(current_setting('app.diario_historical_cards_test_turma', true), '')::uuid;
  v_base jsonb;
  v_actual jsonb;
  v_history_count bigint;
begin
  assert v_turma is not null, 'An explicitly selected imported class is required';
  assert not has_function_privilege('anon',
    'public.get_diarios_turma_com_historico(uuid)', 'EXECUTE');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select coalesce(jsonb_agg(to_jsonb(d) - 'ordinality' order by d.ordinality), '[]'::jsonb)
    into v_base from public.get_diarios_turma(v_turma) with ordinality d;
  v_actual := public.get_diarios_turma_com_historico(v_turma);
  assert jsonb_array_length(v_actual) > 0, 'The selected class must have diary cards';
  assert (select jsonb_agg(item - 'historico' order by ordinal)
    from jsonb_array_elements(v_actual) with ordinality j(item, ordinal)) = v_base,
    'The overlay must preserve every operational field and its order';
  select count(*) into v_history_count from internal_academic.diario_importacoes
    where turma_id = v_turma;
  assert v_history_count > 0, 'The selected class must contain imported histories';
  assert (select count(*) from jsonb_array_elements(v_actual) c
    where c -> 'historico' <> 'null'::jsonb) = v_history_count;
  assert not exists (
    select 1 from jsonb_array_elements(v_actual) c
    join internal_academic.diario_importacoes i on i.disciplina_id = (c ->> 'disciplina_id')::uuid
      and i.turma_id = v_turma
    where c #>> '{historico,estado}' <> 'EM_CONFERENCIA'
      or c #>> '{historico,readOnly}' <> 'true'
      or c #> '{historico,horasDocumentadas}' is distinct from coalesce(to_jsonb(i.carga_aulas_documental), 'null'::jsonb)
      or (c #>> '{historico,aulasDocumentadas}')::bigint <> (
        select count(*) from internal_academic.diario_aulas_importadas a where a.importacao_id = i.id
      )
  ), 'Historical summaries must preserve documentary values and remain read-only';
  assert not exists (
    select 1 from jsonb_array_elements(v_actual) c
    where c #>> '{historico,datasEstado}' = 'EM_CONFERENCIA'
      and (c #> '{historico,primeiraAula}' <> 'null'::jsonb
        or c #> '{historico,ultimaAula}' <> 'null'::jsonb)
  ), 'Unconfirmed dates must not be presented as an official interval';
  -- A session without an authorized identity cannot inherit service data.
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '', true);
  assert public.get_diarios_turma_com_historico(v_turma) = '[]'::jsonb,
    'Unauthorized callers must not receive card or historical data';
end;
$test$;
rollback;
