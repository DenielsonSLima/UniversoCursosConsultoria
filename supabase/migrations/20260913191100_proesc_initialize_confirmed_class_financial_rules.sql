-- User-confirmed on 2026-09-13: enrollment 200, renewal 100, 12 installments
-- per cycle at 279.90, punctuality 260, interest 2% monthly and penalty 2% once.
-- This initializes class conditions only. Individual cycle/source review remains
-- required; existing receivables, payments, dates and gateway identities are kept.
-- Apply before assigning manual cycle policies to these nine imported classes.
begin;
set local lock_timeout = '5s';

do $initialize_confirmed_rules$
declare
  v_codes constant text[] := array[
    'ENF-T35-INT-MAT','ENF-T37-SEM-PDF','ENF-T38-INT-MAT',
    'ENF-T39-SEM-PDF','ENF-T40-INT-MAT','ENF-T41-SEM-AQB',
    'ENF-T43-INT-MAT','ENF-T44-SEM-AQB','ENF-T45-SEM-PDF'
  ];
  v_neutral constant jsonb := '{
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
  }';
  v_requested constant jsonb := '{
    "cobrar_matricula":true,"valor_matricula":200,
    "cobrar_rematricula":true,"valor_rematricula":100,
    "qtd_parcelas":12,"valor_parcela":279.90,"dia_vencimento_padrao":15,
    "desconto_pontualidade":19.90,"juros_atraso":2,
    "multa_atraso_percentual":2,"multa_atraso":5.60,
    "aplicar_desconto_matricula":false,"aplicar_multa_juros_matricula":true,
    "aplicar_desconto_mensalidade":true,"aplicar_multa_juros_mensalidade":true,
    "aplicar_desconto_rematricula":false,"aplicar_multa_juros_rematricula":true,
    "instrucao_boleto_carne":"SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO."
  }';
  v_allowed constant text[] := array[
    'cobrar_matricula','valor_matricula','cobrar_rematricula','valor_rematricula',
    'qtd_parcelas','valor_parcela','dia_vencimento_padrao','desconto_pontualidade',
    'juros_atraso','multa_atraso','multa_atraso_percentual',
    'aplicar_desconto_matricula','aplicar_multa_juros_matricula',
    'aplicar_desconto_mensalidade','aplicar_multa_juros_mensalidade',
    'aplicar_desconto_rematricula','aplicar_multa_juros_rematricula',
    'instrucao_boleto_carne','cronograma_financeiro','primeiro_vencimento_padrao',
    'regra_financeira_revisao','regra_financeira_fingerprint'
  ];
  v_ids uuid[];
  v_batch uuid;
  v_count integer;
  v_class_count integer;
  v_code_count integer;
  v_batch_count integer;
  v_classes_before jsonb;
  v_controls_before text;
  v_receivables_before text;
  v_enrollments_before text;
  v_sources_before text;
  v_scopes_before text;
  v_after text;
  v_class record;
  v_rule jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('proesc:confirmed-class-rules:20260913', 0));
  perform 1 from internal_proesc.class_scopes scope
  where scope.class_code = any(v_codes) and scope.batch_id is not null
  order by scope.id for update;
  perform 1 from public.turmas class where class.codigo = any(v_codes)
  order by class.id for update;

  select array_agg(class.id order by class.codigo), max(scope.batch_id::text)::uuid,
    count(*), count(distinct class.id), count(distinct class.codigo), count(distinct scope.batch_id)
  into v_ids, v_batch, v_count, v_class_count, v_code_count, v_batch_count
  from public.turmas class
  join internal_proesc.class_scopes scope on scope.turma_id = class.id
    and scope.batch_id is not null and scope.class_code = class.codigo
    and scope.polo_id = class.polo_id and scope.phase = 'CONFIRMED'
    and scope.financial_mode = 'INDIVIDUAL_REVIEW'
  join public.cursos course on course.id = class.curso_id
    and upper(course.modalidade) in ('TECNICO','TÉCNICO')
  where class.codigo = any(v_codes);
  if v_count <> 9 or v_class_count <> 9 or v_code_count <> 9 or v_batch_count <> 1
    or (select count(*) from public.turmas where codigo = any(v_codes)) <> 9
  then
    raise exception 'Expected nine confirmed imported technical classes; scope changed.';
  end if;

  -- A completed identical application is a no-op; mixed or changed rules fail.
  select count(*) into v_count from public.turmas class
  where class.id = any(v_ids) and to_jsonb(class) @> v_requested
    and class.regra_financeira_revisao >= 1
    and class.regra_financeira_fingerprint ~ '^[0-9a-f]{64}$';
  if v_count = 9 then return; end if;
  if v_count <> 0 then
    raise exception 'Imported class conditions are mixed; reconcile before initializing.';
  end if;

  select count(*) into v_count from public.turmas class
  where class.id = any(v_ids) and to_jsonb(class) @> v_neutral
    and class.data_inicio is not null;
  if v_count <> 9
    or exists(select 1 from public.matriculas_tecnicas_financeiro_config where turma_id = any(v_ids))
    or exists(select 1 from internal_academic.technical_manual_cycle_policies where turma_id = any(v_ids))
    or (select count(*) from public.turmas where codigo = 'ENF-T42-INT-MAT') <> 1
    or not exists(select 1 from public.turmas class
      where class.codigo = 'ENF-T42-INT-MAT' and to_jsonb(class) @> v_requested)
  then
    raise exception 'Neutral import or the user-confirmed T42 reference changed.';
  end if;

  select jsonb_object_agg(class.id::text, to_jsonb(class) - v_allowed)
  into v_classes_before from public.turmas class where class.id = any(v_ids);
  select md5(string_agg(to_jsonb(class)::text, '' order by class.id)) into v_controls_before
  from public.turmas class where class.codigo in ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');
  select md5(coalesce(string_agg(to_jsonb(item)::text, '' order by item.id), ''))
  into v_receivables_before from public.contas_receber item where item.turma_id = any(v_ids);
  select md5(coalesce(string_agg(to_jsonb(item)::text, '' order by item.id), ''))
  into v_enrollments_before from public.matriculas item where item.turma_id = any(v_ids);
  select md5(coalesce(string_agg(to_jsonb(source)::text, '' order by source.matricula_id), ''))
  into v_sources_before from internal_proesc.enrollment_sources source
  join public.matriculas enrollment on enrollment.id = source.matricula_id
  where enrollment.turma_id = any(v_ids);
  select md5(string_agg(to_jsonb(scope)::text, '' order by scope.id)) into v_scopes_before
  from internal_proesc.class_scopes scope where scope.turma_id = any(v_ids);

  -- Do not disable triggers or fabricate a fingerprint. Normal canonical
  -- validation builds the schedule/revision and emits audit/realtime events.
  update public.turmas set
    cobrar_matricula = true, valor_matricula = 200,
    cobrar_rematricula = true, valor_rematricula = 100,
    qtd_parcelas = 12, valor_parcela = 279.90, dia_vencimento_padrao = 15,
    desconto_pontualidade = 19.90, juros_atraso = 2, multa_atraso_percentual = 2,
    aplicar_desconto_matricula = false, aplicar_multa_juros_matricula = true,
    aplicar_desconto_mensalidade = true, aplicar_multa_juros_mensalidade = true,
    aplicar_desconto_rematricula = false, aplicar_multa_juros_rematricula = true,
    instrucao_boleto_carne = v_requested->>'instrucao_boleto_carne'
  where id = any(v_ids) and regra_financeira_revisao = 0
    and regra_financeira_fingerprint is null;
  get diagnostics v_count = row_count;
  if v_count <> 9 then raise exception 'Expected exactly nine initialized financial rules.'; end if;

  for v_class in select * from public.turmas where id = any(v_ids) loop
    if not to_jsonb(v_class) @> v_requested
      or v_class.regra_financeira_revisao is distinct from 1
      or not coalesce(v_class.regra_financeira_fingerprint ~ '^[0-9a-f]{64}$', false)
      or v_class.primeiro_vencimento_padrao is distinct from v_class.data_inicio
      or (to_jsonb(v_class) - v_allowed) is distinct from v_classes_before->v_class.id::text
    then raise exception 'Initialized class rule differs from the authorized conditions.'; end if;
    v_rule := internal_academic.technical_financial_rule(v_class.id);
    if jsonb_array_length(v_rule->'cronogramaCiclo') is distinct from 14
      or v_rule#>>'{cobranca,mensalidade,quantidade}' is distinct from '12'
      or v_rule#>>'{aplicacao,matricula,desconto}' is distinct from 'false'
      or v_rule#>>'{aplicacao,rematricula,desconto}' is distinct from 'false'
    then raise exception 'Canonical financial rule did not validate after initialization.'; end if;
  end loop;

  select md5(coalesce(string_agg(to_jsonb(item)::text, '' order by item.id), ''))
  into v_after from public.contas_receber item where item.turma_id = any(v_ids);
  if v_after is distinct from v_receivables_before then
    raise exception 'Existing imported receivables changed during rule initialization.';
  end if;
  select md5(coalesce(string_agg(to_jsonb(item)::text, '' order by item.id), ''))
  into v_after from public.matriculas item where item.turma_id = any(v_ids);
  if v_after is distinct from v_enrollments_before then raise exception 'Enrollments changed.'; end if;
  select md5(coalesce(string_agg(to_jsonb(source)::text, '' order by source.matricula_id), ''))
  into v_after from internal_proesc.enrollment_sources source
  join public.matriculas enrollment on enrollment.id = source.matricula_id
  where enrollment.turma_id = any(v_ids);
  if v_after is distinct from v_sources_before then raise exception 'Individual source review changed.'; end if;
  select md5(string_agg(to_jsonb(scope)::text, '' order by scope.id)) into v_after
  from internal_proesc.class_scopes scope where scope.turma_id = any(v_ids);
  if v_after is distinct from v_scopes_before then raise exception 'Import scope changed.'; end if;
  select md5(string_agg(to_jsonb(class)::text, '' order by class.id)) into v_after
  from public.turmas class where class.codigo in ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');
  if v_after is distinct from v_controls_before then raise exception 'T42 or Radiology changed.'; end if;
  if exists(select 1 from public.matriculas_tecnicas_financeiro_config where turma_id = any(v_ids))
    or exists(select 1 from internal_academic.technical_manual_cycle_policies where turma_id = any(v_ids))
  then raise exception 'Rule initialization must not activate or authorize individual billing.'; end if;
end;
$initialize_confirmed_rules$;

commit;
