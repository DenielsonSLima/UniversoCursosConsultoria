-- Teste sintético: não cria matrícula, recebível, transação nem emissão bancária.
-- Executar somente depois de 20260930190500; a transação sempre termina em rollback.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

do $test$
declare
  v_today date := pg_catalog.timezone('America/Maceio', pg_catalog.now())::date;
  v_retro date := v_today - 10;
  v_monthly date := v_today + 10;
  v_rule jsonb := jsonb_build_object(
    'encargos', jsonb_build_object(
      'descontoPontualidade', '10.00',
      'jurosAtrasoPercentual', '2.00',
      'multaAtrasoPercentual', '2.00'),
    'aplicacao', jsonb_build_object(
      'matricula', jsonb_build_object('desconto', true, 'multaJuros', true),
      'rematricula', jsonb_build_object('desconto', false, 'multaJuros', true),
      'mensalidade', jsonb_build_object('desconto', true, 'multaJuros', true)),
    'boleto', jsonb_build_object('instrucao', 'CONTRATO SINTETICO'));
  v_local_review jsonb := jsonb_build_object(
    'modoMatricula', 'REGISTRO_SEM_BOLETO',
    'emitirMatricula', false,
    'itens', '[]'::jsonb);
  v_items jsonb;
  v_result jsonb;
  v_changed jsonb;
  v_expected_details jsonb;
  v_snapshot_definition text;
  v_wrapper_definition text;
  v_implementation_definition text;
begin
  v_items := jsonb_build_array(
    jsonb_build_object(
      'chave', 'matricula', 'tipo', 'MATRICULA', 'numero', 0,
      'descricao', 'Matrícula sintética', 'valor', '100.00',
      'vencimento', pg_catalog.to_char(v_retro, 'YYYY-MM-DD')),
    jsonb_build_object(
      'chave', 'ciclo-1-parc-1', 'tipo', 'PARCELA', 'numero', 1,
      'descricao', 'Mensalidade sintética 1', 'valor', '250.00',
      'vencimento', pg_catalog.to_char(v_monthly, 'YYYY-MM-DD')),
    jsonb_build_object(
      'chave', 'ciclo-1-parc-2', 'tipo', 'PARCELA', 'numero', 2,
      'descricao', 'Mensalidade sintética 2', 'valor', '250.00',
      'vencimento', pg_catalog.to_char(v_monthly + 31, 'YYYY-MM-DD')));

  v_result := internal_academic.review_manual_cycle_items(
    v_items, v_local_review, v_rule, 'T-SINTETICA', 'Turma sintética');
  v_expected_details := internal_academic.technical_manual_cycle_boleto_details(
    100.00, v_retro, v_rule, 'MATRICULA', 'Matrícula sintética',
    'T-SINTETICA', 'Turma sintética');
  if v_result #>> '{itens,0,vencimento}' is distinct from v_retro::text
    or v_result #>> '{itens,0,destinoCobranca}' is distinct from 'LOCAL'
    or v_result #>> '{itens,1,vencimento}' is distinct from v_monthly::text
    or v_result #> '{itens,0,detalhesBoleto}' is distinct from v_expected_details
    or v_result ->> 'quantidadeLocal' is distinct from '1'
    or v_result ->> 'quantidadeBancaria' is distinct from '2'
  then
    raise exception 'Matrícula local retroativa ou detalhes canônicos não foram preservados.';
  end if;
  v_snapshot_definition := pg_get_functiondef(
    'internal_academic.manual_cycle_reviewed_snapshot(uuid,jsonb)'::regprocedure);
  if pg_catalog.strpos(v_snapshot_definition, '''destinoCobranca''') = 0
    or pg_catalog.strpos(v_snapshot_definition, '''revisaoPorItem''') = 0
  then
    raise exception 'Snapshot revisado perdeu destino ou identidade por item.';
  end if;
  v_wrapper_definition := pg_get_functiondef(
    'internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)'::regprocedure);
  if pg_catalog.strpos(
    v_wrapper_definition,
    'technical_manual_cycle_reviewed_preview_before_transfer_entry'
  ) = 0 then
    raise exception 'Wrapper de transferência da prévia foi substituído.';
  end if;
  v_implementation_definition := pg_get_functiondef(
    'internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(uuid,integer,date,jsonb)'::regprocedure);
  if pg_catalog.strpos(v_implementation_definition, 'manual_cycle_due_is_allowed') = 0
    or pg_catalog.strpos(v_implementation_definition, 'manual_cycle_monthly_offset') = 0
  then
    raise exception 'Implementação da prévia não usa as guardas explícitas novas.';
  end if;

  v_changed := internal_academic.review_manual_cycle_items(
    jsonb_set(v_items, '{0,vencimento}', to_jsonb((v_retro - 5)::text)),
    v_local_review, v_rule, 'T-SINTETICA', 'Turma sintética');
  if v_changed #>> '{itens,0,vencimento}' is distinct from (v_retro - 5)::text
    or v_changed #>> '{itens,1,vencimento}' is distinct from v_monthly::text
  then
    raise exception 'Vencimentos da matrícula e da mensalidade continuam acoplados.';
  end if;

  -- O limite inferior é inclusivo; um dia além dele deve falhar fechado.
  perform internal_academic.review_manual_cycle_items(
    jsonb_set(v_items, '{0,vencimento}', to_jsonb((v_today - 1825)::text)),
    v_local_review, v_rule, 'T-SINTETICA', 'Turma sintética');
  begin
    perform internal_academic.review_manual_cycle_items(
      jsonb_set(v_items, '{0,vencimento}', to_jsonb((v_today - 1826)::text)),
      v_local_review, v_rule, 'T-SINTETICA', 'Turma sintética');
    raise exception 'Matrícula anterior ao limite seguro foi aceita.' using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform internal_academic.review_manual_cycle_items(
      v_items,
      jsonb_build_object('modoMatricula', 'BOLETO',
        'emitirMatricula', true, 'itens', '[]'::jsonb),
      v_rule, 'T-SINTETICA', 'Turma sintética');
    raise exception 'Boleto de matrícula retroativo foi aceito.' using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform internal_academic.review_manual_cycle_items(
      jsonb_set(v_items, '{1,vencimento}', to_jsonb((v_today - 1)::text)),
      v_local_review, v_rule, 'T-SINTETICA', 'Turma sintética');
    raise exception 'Mensalidade retroativa foi aceita.' using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform internal_academic.review_manual_cycle_items(
      jsonb_build_array(jsonb_build_object(
        'chave', 'ciclo-1-rematricula', 'tipo', 'REMATRICULA', 'numero', 0,
        'descricao', 'Rematrícula sintética', 'valor', '100.00',
        'vencimento', pg_catalog.to_char(v_today - 1, 'YYYY-MM-DD'))),
      null, v_rule, 'T-SINTETICA', 'Turma sintética');
    raise exception 'Rematrícula retroativa foi aceita.' using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform internal_academic.review_manual_cycle_items(
      jsonb_set(v_items, '{0,vencimento}', to_jsonb((v_today + 1826)::text)),
      v_local_review, v_rule, 'T-SINTETICA', 'Turma sintética');
    raise exception 'Vencimento acima de cinco anos foi aceito.' using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform internal_academic.review_manual_cycle_items(
      jsonb_set(v_items, '{0,vencimento}', to_jsonb((v_monthly + 1)::text)),
      v_local_review, v_rule, 'T-SINTETICA', 'Turma sintética');
    raise exception 'Cronograma fora de ordem foi aceito.' using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;

  if internal_academic.manual_cycle_due_is_allowed(
      'DESCONHECIDO', v_today, 'REGISTRO_SEM_BOLETO', v_today)
    or internal_academic.manual_cycle_due_is_allowed(
      'MATRICULA', v_today, 'DESCONHECIDO', v_today)
    or internal_academic.manual_cycle_due_is_allowed(
      'PARCELA', v_today - 1, 'REGISTRO_SEM_BOLETO', v_today)
  then
    raise exception 'Política de vencimento não falhou fechada.';
  end if;

  -- Origem 15/10 + OMITIR: Mensalidade 1 em 15/10 e 12 em 15/09 seguinte.
  if public.data_vencimento_mensal(
      date '2026-10-15', 15,
      internal_academic.manual_cycle_monthly_offset(1, 'OMITIR', true, 1))
      is distinct from date '2026-10-15'
    or public.data_vencimento_mensal(
      date '2026-10-15', 15,
      internal_academic.manual_cycle_monthly_offset(1, 'OMITIR', true, 12))
      is distinct from date '2027-09-15'
    or public.data_vencimento_mensal(
      date '2026-10-15', 15,
      internal_academic.manual_cycle_monthly_offset(1, 'BOLETO', true, 1))
      is distinct from date '2026-11-15'
  then
    raise exception 'O modo OMITIR ainda reservou o mês da matrícula.';
  end if;
end;
$test$;

rollback;
