begin;

-- Migration 05 is applied and immutable. Fail closed if its trigger body drifts.
do $base_07$
begin
  if md5(pg_get_functiondef('public.aplicar_padrao_financeiro_turma_tecnica()'::regprocedure))
    <> 'd3d63cc7e80ff157f01d6066e9866415' then
    raise exception 'Financial class trigger changed; rebase the scoped academic-update guard.';
  end if;
end;
$base_07$;

CREATE OR REPLACE FUNCTION public.aplicar_padrao_financeiro_turma_tecnica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_modalidade text;
  v_rule jsonb;
  v_fingerprint text;
  v_first_due date;
begin
  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.cursos course where course.id = new.curso_id;
  if v_modalidade not in ('TECNICO', 'TÉCNICO') then return new; end if;
  if exists(select 1 from internal_proesc.class_scopes scope
    where scope.turma_id=new.id and scope.batch_id is not null
      and scope.financial_mode='INDIVIDUAL_REVIEW'
      and internal_proesc.is_bootstrap_claim('CLASS',new.id,to_jsonb(new))) then
    return new;
  end if;
  -- Once the bootstrap claim is consumed, an academic-only update may preserve
  -- its exact neutral mirrors. Every other column (including future columns) is
  -- compared strictly; this grants no financial, gateway or publication change.
  if tg_op='UPDATE' and to_jsonb(old) @> '{
    "origem_financeira":"LEGADO","financeiro_herdado":true,
    "gerar_cobrancas_futuras":false,"sincronizar_asaas_futuro":false,
    "publicar_no_site":false,"permitir_inscricoes_online":false,
    "cobrar_matricula":false,"valor_matricula":0,
    "cobrar_rematricula":false,"valor_rematricula":0,
    "qtd_parcelas":0,"valor_parcela":0,"cronograma_financeiro":[],
    "regra_financeira_fingerprint":null,"regra_financeira_revisao":0,
    "primeiro_vencimento_padrao":null,"dia_vencimento_padrao":0,
    "desconto_pontualidade":0,"juros_atraso":0,"multa_atraso":0,
    "multa_atraso_percentual":0,"aplicar_desconto_matricula":false,
    "aplicar_multa_juros_matricula":false,"aplicar_desconto_mensalidade":false,
    "aplicar_multa_juros_mensalidade":false,"aplicar_desconto_rematricula":false,
    "aplicar_multa_juros_rematricula":false
  }'::jsonb and
    (to_jsonb(new)-array['nome','status','turno','data_inicio','data_previsao_termino',
      'vagas_totais','qtd_vagas_minima','bloquear_matriculas_apos_completar_vagas'])
    is not distinct from
    (to_jsonb(old)-array['nome','status','turno','data_inicio','data_previsao_termino',
      'vagas_totais','qtd_vagas_minima','bloquear_matriculas_apos_completar_vagas'])
    and exists(select 1 from internal_proesc.class_scopes scope
      where scope.turma_id=new.id and scope.polo_id=new.polo_id
        and scope.class_code=new.codigo and scope.batch_id is not null
        and scope.financial_mode='INDIVIDUAL_REVIEW' and scope.phase='CONFIRMED')
    and not exists(select 1 from public.matriculas_tecnicas_financeiro_config config
      where config.turma_id=new.id)
    and not exists(select 1 from internal_academic.technical_manual_cycle_policies policy
      where policy.turma_id=new.id) then
    return new;
  end if;
  v_rule := internal_academic.validate_technical_financial_rule_input(jsonb_build_object(
    'cobrarMatricula', coalesce(new.cobrar_matricula, new.valor_matricula > 0),
    'valorMatricula', new.valor_matricula,
    'qtdMensalidades', new.qtd_parcelas,
    'valorMensalidade', new.valor_parcela,
    'cobrarRematricula', coalesce(new.cobrar_rematricula, new.valor_rematricula > 0),
    'valorRematricula', new.valor_rematricula,
    'diaVencimento', new.dia_vencimento_padrao,
    'descontoPontualidade', new.desconto_pontualidade,
    'jurosAtrasoPercentual', new.juros_atraso,
    'multaAtrasoPercentual', coalesce(new.multa_atraso_percentual, 0),
    'aplicarDescontoMatricula', new.aplicar_desconto_matricula,
    'aplicarMultaJurosMatricula', new.aplicar_multa_juros_matricula,
    'aplicarDescontoMensalidade', new.aplicar_desconto_mensalidade,
    'aplicarMultaJurosMensalidade', new.aplicar_multa_juros_mensalidade,
    'aplicarDescontoRematricula', new.aplicar_desconto_rematricula,
    'aplicarMultaJurosRematricula', new.aplicar_multa_juros_rematricula,
    'instrucaoBoleto', new.instrucao_boleto_carne
  ));
  new.cobrar_matricula := (v_rule ->> 'cobrarMatricula')::boolean;
  new.valor_matricula := (v_rule ->> 'valorMatricula')::numeric;
  new.qtd_parcelas := (v_rule ->> 'qtdMensalidades')::integer;
  new.valor_parcela := (v_rule ->> 'valorMensalidade')::numeric;
  new.cobrar_rematricula := (v_rule ->> 'cobrarRematricula')::boolean;
  new.valor_rematricula := (v_rule ->> 'valorRematricula')::numeric;
  new.dia_vencimento_padrao := (v_rule ->> 'diaVencimento')::integer;
  new.desconto_pontualidade := (v_rule ->> 'descontoPontualidade')::numeric;
  new.juros_atraso := (v_rule ->> 'jurosAtrasoPercentual')::numeric;
  new.multa_atraso_percentual := (v_rule ->> 'multaAtrasoPercentual')::numeric;
  new.multa_atraso := round(new.valor_parcela * new.multa_atraso_percentual / 100.0, 2);
  new.aplicar_desconto_matricula := (v_rule ->> 'aplicarDescontoMatricula')::boolean;
  new.aplicar_multa_juros_matricula := (v_rule ->> 'aplicarMultaJurosMatricula')::boolean;
  new.aplicar_desconto_mensalidade := (v_rule ->> 'aplicarDescontoMensalidade')::boolean;
  new.aplicar_multa_juros_mensalidade := (v_rule ->> 'aplicarMultaJurosMensalidade')::boolean;
  new.aplicar_desconto_rematricula := (v_rule ->> 'aplicarDescontoRematricula')::boolean;
  new.aplicar_multa_juros_rematricula := (v_rule ->> 'aplicarMultaJurosRematricula')::boolean;
  new.instrucao_boleto_carne := v_rule ->> 'instrucaoBoleto';
  new.sincronizar_asaas_futuro := false;
  new.primeiro_vencimento_padrao := coalesce(new.primeiro_vencimento_padrao, new.data_inicio);
  v_first_due := coalesce(new.primeiro_vencimento_padrao, new.data_inicio, (pg_catalog.timezone('America/Maceio', now()))::date);
  new.cronograma_financeiro := internal_academic.build_flexible_technical_financial_schedule(v_first_due, v_rule);
  v_fingerprint := internal_academic.technical_financial_rule_fingerprint_v3(
    new.data_inicio, new.primeiro_vencimento_padrao, v_rule
  );
  if tg_op = 'INSERT' then
    new.regra_financeira_revisao := 1;
  elsif old.regra_financeira_fingerprint is distinct from v_fingerprint then
    new.regra_financeira_revisao := greatest(coalesce(old.regra_financeira_revisao, 0) + 1, 1);
  else
    new.regra_financeira_revisao := old.regra_financeira_revisao;
  end if;
  new.regra_financeira_fingerprint := v_fingerprint;
  return new;
end;
$function$;

commit;
