begin;

-- Regra técnica flexível. As colunas novas são somente metadados/overrides;
-- nenhum valor, vencimento, status ou pagamento histórico é alterado.
alter table public.turmas
  add column if not exists cobrar_matricula boolean,
  add column if not exists cobrar_rematricula boolean;

alter table public.matriculas
  add column if not exists qtd_parcelas_individual integer,
  add column if not exists cobrar_matricula_individual boolean,
  add column if not exists cobrar_rematricula_individual boolean,
  add column if not exists aplicar_desconto_matricula_individual boolean,
  add column if not exists aplicar_multa_juros_matricula_individual boolean,
  add column if not exists aplicar_desconto_mensalidade_individual boolean,
  add column if not exists aplicar_multa_juros_mensalidade_individual boolean,
  add column if not exists aplicar_desconto_rematricula_individual boolean,
  add column if not exists aplicar_multa_juros_rematricula_individual boolean,
  add column if not exists instrucao_boleto_carne_individual text;

alter table public.matriculas_tecnicas_financeiro_config
  add column if not exists override_ativo boolean not null default false,
  add column if not exists override_revisao integer not null default 0,
  add column if not exists override_fingerprint text,
  add column if not exists regra_efetiva_fingerprint text;

alter table public.contas_receber
  add column if not exists regra_financeira_tecnica_snapshot jsonb;

alter table public.contas_receber
  drop constraint if exists contas_receber_regra_financeira_tecnica_snapshot_check,
  add constraint contas_receber_regra_financeira_tecnica_snapshot_check
    check (
      regra_financeira_tecnica_snapshot is null
      or jsonb_typeof(regra_financeira_tecnica_snapshot) = 'object'
    );

alter table public.matriculas_tecnicas_financeiro_config
  drop constraint if exists matriculas_tecnicas_financeiro_config_status_financeiro_check,
  add constraint matriculas_tecnicas_financeiro_config_status_financeiro_check
    check (status_financeiro in ('PENDENTE', 'AGENDADA', 'ATIVADA', 'GERADA')),
  drop constraint if exists matriculas_tecnicas_financeiro_config_agendamento_check,
  add constraint matriculas_tecnicas_financeiro_config_agendamento_check
    check (
      (status_financeiro = 'PENDENTE' and ativar_em is null and titulo_matricula_id is null)
      or (status_financeiro = 'AGENDADA' and ativar_em is not null and titulo_matricula_id is null)
      or (status_financeiro = 'ATIVADA' and ativar_em is null and titulo_matricula_id is null)
      or (status_financeiro = 'GERADA' and ativar_em is null and titulo_matricula_id is not null)
    );

comment on column public.turmas.cobrar_matricula is
  'Habilitação explícita da matrícula. NULL preserva a semântica histórica valor_matricula > 0.';
comment on column public.turmas.cobrar_rematricula is
  'Habilitação explícita da rematrícula. NULL preserva a semântica histórica valor_rematricula > 0.';
comment on column public.matriculas_tecnicas_financeiro_config.override_ativo is
  'Quando true, cada coluna *_individual não nula prevalece; NULL continua significando herdar a turma.';
comment on column public.matriculas_tecnicas_financeiro_config.regra_efetiva_fingerprint is
  'Identidade da regra turma+override confirmada ao agendar/ativar; não é preço de título já emitido.';
comment on column public.contas_receber.regra_financeira_tecnica_snapshot is
  'Política técnica imutável capturada na emissão do título; alterações posteriores de turma/override não a reprecificam.';

create or replace function internal_academic.validate_technical_financial_rule_input(
  p_rule jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_unknown text;
  v_result jsonb;
  v_cobrar_matricula boolean;
  v_cobrar_rematricula boolean;
  v_valor_matricula numeric;
  v_valor_mensalidade numeric;
  v_valor_rematricula numeric;
  v_quantidade integer;
  v_dia integer;
  v_desconto numeric;
  v_juros numeric;
  v_multa numeric;
  v_instrucao text;
begin
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    raise exception 'A regra financeira deve ser um objeto.' using errcode = '22023';
  end if;

  select key into v_unknown
  from jsonb_object_keys(p_rule) key
  where key not in (
    'cobrarMatricula', 'valorMatricula', 'qtdMensalidades',
    'valorMensalidade', 'cobrarRematricula', 'valorRematricula',
    'diaVencimento', 'descontoPontualidade', 'jurosAtrasoPercentual',
    'multaAtrasoPercentual', 'aplicarDescontoMatricula',
    'aplicarMultaJurosMatricula', 'aplicarDescontoMensalidade',
    'aplicarMultaJurosMensalidade', 'aplicarDescontoRematricula',
    'aplicarMultaJurosRematricula', 'instrucaoBoleto'
  ) limit 1;
  if v_unknown is not null then
    raise exception 'Campo financeiro não suportado: %.', v_unknown using errcode = '22023';
  end if;

  if not (
    p_rule ? 'cobrarMatricula' and p_rule ? 'valorMatricula'
    and p_rule ? 'qtdMensalidades' and p_rule ? 'valorMensalidade'
    and p_rule ? 'cobrarRematricula' and p_rule ? 'valorRematricula'
    and p_rule ? 'diaVencimento' and p_rule ? 'descontoPontualidade'
    and p_rule ? 'jurosAtrasoPercentual' and p_rule ? 'multaAtrasoPercentual'
    and p_rule ? 'aplicarDescontoMatricula'
    and p_rule ? 'aplicarMultaJurosMatricula'
    and p_rule ? 'aplicarDescontoMensalidade'
    and p_rule ? 'aplicarMultaJurosMensalidade'
    and p_rule ? 'aplicarDescontoRematricula'
    and p_rule ? 'aplicarMultaJurosRematricula'
    and p_rule ? 'instrucaoBoleto'
  ) then
    raise exception 'A regra financeira está incompleta.' using errcode = '22023';
  end if;

  begin
    v_cobrar_matricula := (p_rule ->> 'cobrarMatricula')::boolean;
    v_cobrar_rematricula := (p_rule ->> 'cobrarRematricula')::boolean;
    v_valor_matricula := round((p_rule ->> 'valorMatricula')::numeric, 2);
    v_valor_mensalidade := round((p_rule ->> 'valorMensalidade')::numeric, 2);
    v_valor_rematricula := round((p_rule ->> 'valorRematricula')::numeric, 2);
    v_quantidade := (p_rule ->> 'qtdMensalidades')::integer;
    v_dia := (p_rule ->> 'diaVencimento')::integer;
    v_desconto := round((p_rule ->> 'descontoPontualidade')::numeric, 2);
    v_juros := round((p_rule ->> 'jurosAtrasoPercentual')::numeric, 6);
    v_multa := round((p_rule ->> 'multaAtrasoPercentual')::numeric, 6);
    v_instrucao := pg_catalog.btrim(coalesce(p_rule ->> 'instrucaoBoleto', ''));
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'A regra financeira contém valor inválido.' using errcode = '22023';
  end;

  if v_valor_matricula < 0
    or v_valor_mensalidade <= 0
    or v_valor_rematricula < 0
    or v_quantidade not between 1 and 60
    or v_dia not between 1 and 31
    or v_desconto < 0
    or v_juros not between 0 and 100
    or v_multa not between 0 and 100
    or (v_cobrar_matricula and v_valor_matricula <= 0)
    or (v_cobrar_rematricula and v_valor_rematricula <= 0)
    or v_cobrar_matricula is null
    or v_cobrar_rematricula is null
    or pg_catalog.length(v_instrucao) not between 1 and 180
  then
    raise exception 'Regra financeira técnica inválida.' using errcode = '22023';
  end if;

  v_result := jsonb_build_object(
    'cobrarMatricula', v_cobrar_matricula,
    'valorMatricula', v_valor_matricula,
    'qtdMensalidades', v_quantidade,
    'valorMensalidade', v_valor_mensalidade,
    'cobrarRematricula', v_cobrar_rematricula,
    'valorRematricula', v_valor_rematricula,
    'diaVencimento', v_dia,
    'descontoPontualidade', v_desconto,
    'jurosAtrasoPercentual', v_juros,
    'multaAtrasoPercentual', v_multa,
    'aplicarDescontoMatricula', (p_rule ->> 'aplicarDescontoMatricula')::boolean,
    'aplicarMultaJurosMatricula', (p_rule ->> 'aplicarMultaJurosMatricula')::boolean,
    'aplicarDescontoMensalidade', (p_rule ->> 'aplicarDescontoMensalidade')::boolean,
    'aplicarMultaJurosMensalidade', (p_rule ->> 'aplicarMultaJurosMensalidade')::boolean,
    'aplicarDescontoRematricula', (p_rule ->> 'aplicarDescontoRematricula')::boolean,
    'aplicarMultaJurosRematricula', (p_rule ->> 'aplicarMultaJurosRematricula')::boolean,
    'instrucaoBoleto', v_instrucao
  );
  if v_result @> '{"aplicarDescontoMatricula": null}'::jsonb
    or v_result @> '{"aplicarMultaJurosMatricula": null}'::jsonb
    or v_result @> '{"aplicarDescontoMensalidade": null}'::jsonb
    or v_result @> '{"aplicarMultaJurosMensalidade": null}'::jsonb
    or v_result @> '{"aplicarDescontoRematricula": null}'::jsonb
    or v_result @> '{"aplicarMultaJurosRematricula": null}'::jsonb
  then
    raise exception 'As flags de aplicação são obrigatórias.' using errcode = '22023';
  end if;
  return v_result;
end;
$function$;

revoke all on function internal_academic.validate_technical_financial_rule_input(jsonb)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.technical_financial_rule_fingerprint_v2(
  p_data_inicio date,
  p_rule jsonb
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        jsonb_build_object(
          'versao', 2,
          'dataInicio', p_data_inicio,
          'regra', internal_academic.validate_technical_financial_rule_input(p_rule)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

revoke all on function internal_academic.technical_financial_rule_fingerprint_v2(date, jsonb)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.technical_financial_simulation(
  p_valor numeric,
  p_desconto numeric,
  p_juros numeric,
  p_multa numeric,
  p_aplicar_desconto boolean,
  p_aplicar_encargos boolean
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select jsonb_build_object(
    'descontoAplicado', pg_catalog.to_char(preview.desconto_aplicado, 'FM999999990.00'),
    'jurosMensal', pg_catalog.to_char(preview.juros_calculados, 'FM999999990.00'),
    'jurosPercentualDia', pg_catalog.to_char(preview.juros_percentual_dia, 'FM999999990.000000'),
    'jurosValorDia', pg_catalog.to_char(preview.juros_valor_dia, 'FM999999990.00'),
    'multa', pg_catalog.to_char(preview.multa_aplicada, 'FM999999990.00'),
    'valorComDesconto', pg_catalog.to_char(preview.valor_com_desconto, 'FM999999990.00'),
    'valorComAtraso', pg_catalog.to_char(preview.valor_com_atraso, 'FM999999990.00')
  )
  from public.calculate_gestao_technical_financial_preview(
    p_valor, p_desconto, p_juros, p_multa,
    p_aplicar_desconto, p_aplicar_encargos
  ) preview;
$function$;

revoke all on function internal_academic.technical_financial_simulation(
  numeric, numeric, numeric, numeric, boolean, boolean
) from public, anon, authenticated, service_role;

create or replace function internal_academic.build_flexible_technical_financial_schedule(
  p_primeiro_vencimento date,
  p_rule jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_rule jsonb := internal_academic.validate_technical_financial_rule_input(p_rule);
  v_result jsonb := '[]'::jsonb;
  v_numero integer;
  v_offset integer;
  v_due date;
  v_value numeric;
begin
  if p_primeiro_vencimento is null then
    raise exception 'Primeiro vencimento obrigatório para projetar o ciclo.' using errcode = '22023';
  end if;

  if (v_rule ->> 'cobrarMatricula')::boolean then
    v_value := (v_rule ->> 'valorMatricula')::numeric;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'matricula', 'tipo', 'MATRICULA', 'numero', null,
      'ciclo', 1, 'label', 'Matrícula inicial',
      'valor', pg_catalog.to_char(v_value, 'FM999999990.00'),
      'dataVencimento', pg_catalog.to_char(p_primeiro_vencimento, 'YYYY-MM-DD'),
      'simulacao', internal_academic.technical_financial_simulation(
        v_value,
        (v_rule ->> 'descontoPontualidade')::numeric,
        (v_rule ->> 'jurosAtrasoPercentual')::numeric,
        (v_rule ->> 'multaAtrasoPercentual')::numeric,
        (v_rule ->> 'aplicarDescontoMatricula')::boolean,
        (v_rule ->> 'aplicarMultaJurosMatricula')::boolean
      )
    ));
    v_offset := 1;
  else
    v_offset := 0;
  end if;

  v_value := (v_rule ->> 'valorMensalidade')::numeric;
  for v_numero in 1..(v_rule ->> 'qtdMensalidades')::integer loop
    v_due := public.data_vencimento_mensal(
      p_primeiro_vencimento,
      (v_rule ->> 'diaVencimento')::integer,
      v_offset + v_numero - 1
    );
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'mensalidade-' || v_numero,
      'tipo', 'MENSALIDADE', 'numero', v_numero,
      'ciclo', 1,
      'label', 'Mensalidade ' || v_numero || '/' || (v_rule ->> 'qtdMensalidades'),
      'valor', pg_catalog.to_char(v_value, 'FM999999990.00'),
      'dataVencimento', pg_catalog.to_char(v_due, 'YYYY-MM-DD'),
      'simulacao', internal_academic.technical_financial_simulation(
        v_value,
        (v_rule ->> 'descontoPontualidade')::numeric,
        (v_rule ->> 'jurosAtrasoPercentual')::numeric,
        (v_rule ->> 'multaAtrasoPercentual')::numeric,
        (v_rule ->> 'aplicarDescontoMensalidade')::boolean,
        (v_rule ->> 'aplicarMultaJurosMensalidade')::boolean
      )
    ));
  end loop;

  if (v_rule ->> 'cobrarRematricula')::boolean then
    v_value := (v_rule ->> 'valorRematricula')::numeric;
    v_due := public.data_vencimento_mensal(
      p_primeiro_vencimento,
      (v_rule ->> 'diaVencimento')::integer,
      v_offset + (v_rule ->> 'qtdMensalidades')::integer
    );
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'rematricula', 'tipo', 'REMATRICULA', 'numero', null,
      'ciclo', 1, 'label', 'Rematrícula após o ciclo',
      'valor', pg_catalog.to_char(v_value, 'FM999999990.00'),
      'dataVencimento', pg_catalog.to_char(v_due, 'YYYY-MM-DD'),
      'simulacao', internal_academic.technical_financial_simulation(
        v_value,
        (v_rule ->> 'descontoPontualidade')::numeric,
        (v_rule ->> 'jurosAtrasoPercentual')::numeric,
        (v_rule ->> 'multaAtrasoPercentual')::numeric,
        (v_rule ->> 'aplicarDescontoRematricula')::boolean,
        (v_rule ->> 'aplicarMultaJurosRematricula')::boolean
      )
    ));
  end if;
  return v_result;
end;
$function$;

revoke all on function internal_academic.build_flexible_technical_financial_schedule(date, jsonb)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.render_technical_financial_rule(
  p_rule jsonb,
  p_primeiro_vencimento date,
  p_identity jsonb,
  p_origin text default 'TURMA'
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_rule jsonb := internal_academic.validate_technical_financial_rule_input(p_rule);
begin
  return jsonb_build_object(
    'identidade', p_identity,
    'origem', p_origin,
    'cobranca', jsonb_build_object(
      'matricula', jsonb_build_object(
        'habilitada', (v_rule ->> 'cobrarMatricula')::boolean,
        'valor', pg_catalog.to_char((v_rule ->> 'valorMatricula')::numeric, 'FM999999990.00')
      ),
      'mensalidade', jsonb_build_object(
        'habilitada', true,
        'quantidade', (v_rule ->> 'qtdMensalidades')::integer,
        'valor', pg_catalog.to_char((v_rule ->> 'valorMensalidade')::numeric, 'FM999999990.00')
      ),
      'rematricula', jsonb_build_object(
        'habilitada', (v_rule ->> 'cobrarRematricula')::boolean,
        'valor', pg_catalog.to_char((v_rule ->> 'valorRematricula')::numeric, 'FM999999990.00')
      )
    ),
    'vencimento', jsonb_build_object(
      'diaBase', (v_rule ->> 'diaVencimento')::integer,
      'primeiroVencimentoSugerido', pg_catalog.to_char(p_primeiro_vencimento, 'YYYY-MM-DD')
    ),
    'encargos', jsonb_build_object(
      'descontoPontualidade', pg_catalog.to_char((v_rule ->> 'descontoPontualidade')::numeric, 'FM999999990.00'),
      'jurosAtrasoPercentual', pg_catalog.to_char((v_rule ->> 'jurosAtrasoPercentual')::numeric, 'FM999999990.000000'),
      'multaAtrasoPercentual', pg_catalog.to_char((v_rule ->> 'multaAtrasoPercentual')::numeric, 'FM999999990.000000')
    ),
    'aplicacao', jsonb_build_object(
      'matricula', jsonb_build_object(
        'desconto', (v_rule ->> 'aplicarDescontoMatricula')::boolean,
        'multaJuros', (v_rule ->> 'aplicarMultaJurosMatricula')::boolean
      ),
      'mensalidade', jsonb_build_object(
        'desconto', (v_rule ->> 'aplicarDescontoMensalidade')::boolean,
        'multaJuros', (v_rule ->> 'aplicarMultaJurosMensalidade')::boolean
      ),
      'rematricula', jsonb_build_object(
        'desconto', (v_rule ->> 'aplicarDescontoRematricula')::boolean,
        'multaJuros', (v_rule ->> 'aplicarMultaJurosRematricula')::boolean
      )
    ),
    'boleto', jsonb_build_object('instrucao', v_rule ->> 'instrucaoBoleto'),
    'continuidade', jsonb_build_object(
      'recorrente', (v_rule ->> 'cobrarRematricula')::boolean,
      'proximoCiclo', case when (v_rule ->> 'cobrarRematricula')::boolean
        then 'APOS_REMATRICULA' else 'ENCERRA_APOS_MENSALIDADES' end,
      'mensalidadesPorCiclo', (v_rule ->> 'qtdMensalidades')::integer
    ),
    'cronogramaCiclo', internal_academic.build_flexible_technical_financial_schedule(
      p_primeiro_vencimento, v_rule
    )
  );
end;
$function$;

revoke all on function internal_academic.render_technical_financial_rule(jsonb, date, jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function public.aplicar_padrao_financeiro_turma_tecnica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
  v_rule jsonb;
  v_fingerprint text;
  v_first_due date;
begin
  select upper(coalesce(course.modalidade, ''))
  into v_modalidade
  from public.cursos course
  where course.id = new.curso_id;
  if v_modalidade not in ('TECNICO', 'TÉCNICO') then return new; end if;

  v_rule := internal_academic.validate_technical_financial_rule_input(
    jsonb_build_object(
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
    )
  );

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
  new.multa_atraso := round(
    new.valor_parcela * new.multa_atraso_percentual / 100.0,
    2
  );
  new.aplicar_desconto_matricula := (v_rule ->> 'aplicarDescontoMatricula')::boolean;
  new.aplicar_multa_juros_matricula := (v_rule ->> 'aplicarMultaJurosMatricula')::boolean;
  new.aplicar_desconto_mensalidade := (v_rule ->> 'aplicarDescontoMensalidade')::boolean;
  new.aplicar_multa_juros_mensalidade := (v_rule ->> 'aplicarMultaJurosMensalidade')::boolean;
  new.aplicar_desconto_rematricula := (v_rule ->> 'aplicarDescontoRematricula')::boolean;
  new.aplicar_multa_juros_rematricula := (v_rule ->> 'aplicarMultaJurosRematricula')::boolean;
  new.instrucao_boleto_carne := v_rule ->> 'instrucaoBoleto';
  new.sincronizar_asaas_futuro := false;

  v_first_due := coalesce(
    new.data_inicio,
    (pg_catalog.timezone('America/Maceio', now()))::date
  );
  new.cronograma_financeiro := internal_academic.build_flexible_technical_financial_schedule(
    v_first_due, v_rule
  );
  v_fingerprint := internal_academic.technical_financial_rule_fingerprint_v2(
    new.data_inicio, v_rule
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

revoke all on function public.aplicar_padrao_financeiro_turma_tecnica()
  from public, anon, authenticated;

create or replace function internal_academic.technical_financial_rule(
  p_turma_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_rule jsonb;
  v_fingerprint text;
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_first_due date;
  v_rendered jsonb;
begin
  select class.*, upper(coalesce(course.modalidade, '')) as modalidade
  into v_turma
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if not found or v_turma.modalidade not in ('TECNICO', 'TÉCNICO') then
    raise exception 'Turma técnica não encontrada.' using errcode = '22023';
  end if;

  v_rule := internal_academic.validate_technical_financial_rule_input(
    jsonb_build_object(
      'cobrarMatricula', coalesce(v_turma.cobrar_matricula, v_turma.valor_matricula > 0),
      'valorMatricula', v_turma.valor_matricula,
      'qtdMensalidades', v_turma.qtd_parcelas,
      'valorMensalidade', v_turma.valor_parcela,
      'cobrarRematricula', coalesce(v_turma.cobrar_rematricula, v_turma.valor_rematricula > 0),
      'valorRematricula', v_turma.valor_rematricula,
      'diaVencimento', v_turma.dia_vencimento_padrao,
      'descontoPontualidade', v_turma.desconto_pontualidade,
      'jurosAtrasoPercentual', v_turma.juros_atraso,
      'multaAtrasoPercentual', coalesce(v_turma.multa_atraso_percentual, 0),
      'aplicarDescontoMatricula', v_turma.aplicar_desconto_matricula,
      'aplicarMultaJurosMatricula', v_turma.aplicar_multa_juros_matricula,
      'aplicarDescontoMensalidade', v_turma.aplicar_desconto_mensalidade,
      'aplicarMultaJurosMensalidade', v_turma.aplicar_multa_juros_mensalidade,
      'aplicarDescontoRematricula', v_turma.aplicar_desconto_rematricula,
      'aplicarMultaJurosRematricula', v_turma.aplicar_multa_juros_rematricula,
      'instrucaoBoleto', v_turma.instrucao_boleto_carne
    )
  );
  v_fingerprint := internal_academic.technical_financial_rule_fingerprint_v2(
    v_turma.data_inicio, v_rule
  );
  v_first_due := greatest(coalesce(v_turma.data_inicio, v_today), v_today);
  v_rendered := internal_academic.render_technical_financial_rule(
    v_rule,
    v_first_due,
    jsonb_build_object(
      'turmaRevisao', v_turma.regra_financeira_revisao,
      'turmaFingerprint', v_fingerprint,
      'overrideRevisao', null,
      'overrideFingerprint', null,
      'efetivaFingerprint', v_fingerprint
    ),
    'TURMA'
  );
  -- Aliases compatíveis mantêm os entrypoints diferidos já publicados.
  return v_rendered || jsonb_build_object(
    'revisao', v_turma.regra_financeira_revisao,
    'fingerprint', v_fingerprint,
    'primeiroVencimentoSugerido', pg_catalog.to_char(v_first_due, 'YYYY-MM-DD'),
    'valorMatricula', pg_catalog.to_char(v_turma.valor_matricula, 'FM999999990.00'),
    'valorMensalidade', pg_catalog.to_char(v_turma.valor_parcela, 'FM999999990.00'),
    'valorRematricula', pg_catalog.to_char(v_turma.valor_rematricula, 'FM999999990.00'),
    'mensalidadesPorCiclo', v_turma.qtd_parcelas,
    'diaVencimento', v_turma.dia_vencimento_padrao
  );
end;
$function$;

revoke all on function internal_academic.technical_financial_rule(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.obter_regra_financeira_turma_tecnica_secure(
  p_turma_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then
    raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501';
  end if;
  return internal_academic.technical_financial_rule(p_turma_id);
end;
$function$;

create or replace function public.prever_regra_financeira_turma_tecnica_secure(
  p_turma_id uuid,
  p_regra jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_rule jsonb;
  v_first_due date;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then
    raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501';
  end if;
  select class.data_inicio, class.regra_financeira_revisao
  into v_turma from public.turmas class where class.id = p_turma_id;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;
  v_rule := internal_academic.validate_technical_financial_rule_input(p_regra);
  v_first_due := greatest(
    coalesce(v_turma.data_inicio, (pg_catalog.timezone('America/Maceio', now()))::date),
    (pg_catalog.timezone('America/Maceio', now()))::date
  );
  return internal_academic.render_technical_financial_rule(
    v_rule,
    v_first_due,
    jsonb_build_object(
      'preview', true,
      'turmaRevisao', v_turma.regra_financeira_revisao,
      'turmaFingerprint', internal_academic.technical_financial_rule_fingerprint_v2(
        v_turma.data_inicio, v_rule
      ),
      'overrideRevisao', null,
      'overrideFingerprint', null,
      'efetivaFingerprint', internal_academic.technical_financial_rule_fingerprint_v2(
        v_turma.data_inicio, v_rule
      )
    ),
    'PREVIEW'
  );
end;
$function$;

create or replace function internal_academic.technical_financial_override_flat(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_config public.matriculas_tecnicas_financeiro_config%rowtype;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  select config.* into v_config
  from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = p_matricula_id;
  if not found then raise exception 'Financeiro técnico não configurado.' using errcode = '22023'; end if;
  return jsonb_build_object(
    'ativo', v_config.override_ativo,
    'cobrarMatricula', to_jsonb(v_enrollment.cobrar_matricula_individual),
    'valorMatricula', to_jsonb(v_enrollment.valor_matricula_individual),
    'qtdMensalidades', to_jsonb(v_enrollment.qtd_parcelas_individual),
    'valorMensalidade', to_jsonb(v_enrollment.valor_parcela_individual),
    'cobrarRematricula', to_jsonb(v_enrollment.cobrar_rematricula_individual),
    'valorRematricula', to_jsonb(v_enrollment.valor_rematricula_individual),
    'diaVencimento', to_jsonb(v_enrollment.dia_vencimento_individual),
    'descontoPontualidade', to_jsonb(v_enrollment.desconto_pontualidade_individual),
    'jurosAtrasoPercentual', to_jsonb(v_enrollment.juros_atraso_individual),
    'multaAtrasoPercentual', to_jsonb(v_enrollment.multa_atraso_percentual_individual),
    'aplicarDescontoMatricula', to_jsonb(v_enrollment.aplicar_desconto_matricula_individual),
    'aplicarMultaJurosMatricula', to_jsonb(v_enrollment.aplicar_multa_juros_matricula_individual),
    'aplicarDescontoMensalidade', to_jsonb(v_enrollment.aplicar_desconto_mensalidade_individual),
    'aplicarMultaJurosMensalidade', to_jsonb(v_enrollment.aplicar_multa_juros_mensalidade_individual),
    'aplicarDescontoRematricula', to_jsonb(v_enrollment.aplicar_desconto_rematricula_individual),
    'aplicarMultaJurosRematricula', to_jsonb(v_enrollment.aplicar_multa_juros_rematricula_individual),
    'instrucaoBoleto', to_jsonb(v_enrollment.instrucao_boleto_carne_individual)
  );
end;
$function$;

revoke all on function internal_academic.technical_financial_override_flat(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.technical_financial_override_fingerprint(
  p_matricula_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        case when coalesce((raw ->> 'ativo')::boolean, false)
          then raw else jsonb_build_object('ativo', false) end::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from (
    select internal_academic.technical_financial_override_flat(p_matricula_id) raw
  ) source;
$function$;

revoke all on function internal_academic.technical_financial_override_fingerprint(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.render_technical_financial_override(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_raw jsonb := internal_academic.technical_financial_override_flat(p_matricula_id);
  v_revision integer;
  v_fingerprint text := internal_academic.technical_financial_override_fingerprint(p_matricula_id);
begin
  select config.override_revisao into v_revision
  from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = p_matricula_id;
  if not coalesce((v_raw ->> 'ativo')::boolean, false) then
    -- Valores legados permanecem fisicamente preservados, mas override inativo
    -- é exposto como herança por campo para o editor não os ressuscitar.
    v_raw := jsonb_build_object('ativo', false);
  end if;
  return jsonb_build_object(
    'ativo', (v_raw ->> 'ativo')::boolean,
    'identidade', jsonb_build_object(
      'revisao', coalesce(v_revision, 0),
      'fingerprint', v_fingerprint
    ),
    'cobranca', jsonb_build_object(
      'matricula', jsonb_build_object(
        'habilitada', v_raw -> 'cobrarMatricula',
        'valor', case when jsonb_typeof(v_raw -> 'valorMatricula') = 'null' then null
          else pg_catalog.to_char((v_raw ->> 'valorMatricula')::numeric, 'FM999999990.00') end
      ),
      'mensalidade', jsonb_build_object(
        'quantidade', v_raw -> 'qtdMensalidades',
        'valor', case when jsonb_typeof(v_raw -> 'valorMensalidade') = 'null' then null
          else pg_catalog.to_char((v_raw ->> 'valorMensalidade')::numeric, 'FM999999990.00') end
      ),
      'rematricula', jsonb_build_object(
        'habilitada', v_raw -> 'cobrarRematricula',
        'valor', case when jsonb_typeof(v_raw -> 'valorRematricula') = 'null' then null
          else pg_catalog.to_char((v_raw ->> 'valorRematricula')::numeric, 'FM999999990.00') end
      )
    ),
    'vencimento', jsonb_build_object('diaBase', v_raw -> 'diaVencimento'),
    'encargos', jsonb_build_object(
      'descontoPontualidade', case when jsonb_typeof(v_raw -> 'descontoPontualidade') = 'null' then null
        else pg_catalog.to_char((v_raw ->> 'descontoPontualidade')::numeric, 'FM999999990.00') end,
      'jurosAtrasoPercentual', case when jsonb_typeof(v_raw -> 'jurosAtrasoPercentual') = 'null' then null
        else pg_catalog.to_char((v_raw ->> 'jurosAtrasoPercentual')::numeric, 'FM999999990.000000') end,
      'multaAtrasoPercentual', case when jsonb_typeof(v_raw -> 'multaAtrasoPercentual') = 'null' then null
        else pg_catalog.to_char((v_raw ->> 'multaAtrasoPercentual')::numeric, 'FM999999990.000000') end
    ),
    'aplicacao', jsonb_build_object(
      'matricula', jsonb_build_object(
        'desconto', v_raw -> 'aplicarDescontoMatricula',
        'multaJuros', v_raw -> 'aplicarMultaJurosMatricula'
      ),
      'mensalidade', jsonb_build_object(
        'desconto', v_raw -> 'aplicarDescontoMensalidade',
        'multaJuros', v_raw -> 'aplicarMultaJurosMensalidade'
      ),
      'rematricula', jsonb_build_object(
        'desconto', v_raw -> 'aplicarDescontoRematricula',
        'multaJuros', v_raw -> 'aplicarMultaJurosRematricula'
      )
    ),
    'boleto', jsonb_build_object(
      'instrucao', case when jsonb_typeof(v_raw -> 'instrucaoBoleto') = 'null'
        then null else v_raw ->> 'instrucaoBoleto' end
    )
  );
end;
$function$;

revoke all on function internal_academic.render_technical_financial_override(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.technical_financial_effective_rule(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_config public.matriculas_tecnicas_financeiro_config%rowtype;
  v_class_rule jsonb;
  v_rule jsonb;
  v_override_fingerprint text;
  v_effective_fingerprint text;
  v_first_due date;
  v_override boolean;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  select class.* into v_class from public.turmas class where class.id = v_enrollment.turma_id;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;
  select config.* into v_config
  from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = p_matricula_id;
  if not found then raise exception 'Financeiro técnico não configurado.' using errcode = '22023'; end if;
  v_class_rule := internal_academic.technical_financial_rule(v_class.id);
  v_override := v_config.override_ativo;

  v_rule := internal_academic.validate_technical_financial_rule_input(
    jsonb_build_object(
      'cobrarMatricula', case
        when not v_override then coalesce(v_class.cobrar_matricula, v_class.valor_matricula > 0)
        when v_enrollment.cobrar_matricula_individual is not null then v_enrollment.cobrar_matricula_individual
        when v_enrollment.valor_matricula_individual = 0 then false
        else coalesce(v_class.cobrar_matricula, v_class.valor_matricula > 0) end,
      'valorMatricula', case when v_override then coalesce(v_enrollment.valor_matricula_individual, v_class.valor_matricula) else v_class.valor_matricula end,
      'qtdMensalidades', case when v_override then coalesce(v_enrollment.qtd_parcelas_individual, v_class.qtd_parcelas) else v_class.qtd_parcelas end,
      'valorMensalidade', case when v_override then coalesce(v_enrollment.valor_parcela_individual, v_class.valor_parcela) else v_class.valor_parcela end,
      'cobrarRematricula', case
        when not v_override then coalesce(v_class.cobrar_rematricula, v_class.valor_rematricula > 0)
        when v_enrollment.cobrar_rematricula_individual is not null then v_enrollment.cobrar_rematricula_individual
        when v_enrollment.valor_rematricula_individual = 0 then false
        else coalesce(v_class.cobrar_rematricula, v_class.valor_rematricula > 0) end,
      'valorRematricula', case when v_override then coalesce(v_enrollment.valor_rematricula_individual, v_class.valor_rematricula) else v_class.valor_rematricula end,
      'diaVencimento', case when v_override then coalesce(v_enrollment.dia_vencimento_individual, v_class.dia_vencimento_padrao) else v_class.dia_vencimento_padrao end,
      'descontoPontualidade', case when v_override then coalesce(v_enrollment.desconto_pontualidade_individual, v_class.desconto_pontualidade) else v_class.desconto_pontualidade end,
      'jurosAtrasoPercentual', case when v_override then coalesce(v_enrollment.juros_atraso_individual, v_class.juros_atraso) else v_class.juros_atraso end,
      'multaAtrasoPercentual', case when v_override then coalesce(v_enrollment.multa_atraso_percentual_individual, v_class.multa_atraso_percentual, 0) else coalesce(v_class.multa_atraso_percentual, 0) end,
      'aplicarDescontoMatricula', case when v_override then coalesce(v_enrollment.aplicar_desconto_matricula_individual, v_class.aplicar_desconto_matricula) else v_class.aplicar_desconto_matricula end,
      'aplicarMultaJurosMatricula', case when v_override then coalesce(v_enrollment.aplicar_multa_juros_matricula_individual, v_class.aplicar_multa_juros_matricula) else v_class.aplicar_multa_juros_matricula end,
      'aplicarDescontoMensalidade', case when v_override then coalesce(v_enrollment.aplicar_desconto_mensalidade_individual, v_class.aplicar_desconto_mensalidade) else v_class.aplicar_desconto_mensalidade end,
      'aplicarMultaJurosMensalidade', case when v_override then coalesce(v_enrollment.aplicar_multa_juros_mensalidade_individual, v_class.aplicar_multa_juros_mensalidade) else v_class.aplicar_multa_juros_mensalidade end,
      'aplicarDescontoRematricula', case when v_override then coalesce(v_enrollment.aplicar_desconto_rematricula_individual, v_class.aplicar_desconto_rematricula) else v_class.aplicar_desconto_rematricula end,
      'aplicarMultaJurosRematricula', case when v_override then coalesce(v_enrollment.aplicar_multa_juros_rematricula_individual, v_class.aplicar_multa_juros_rematricula) else v_class.aplicar_multa_juros_rematricula end,
      'instrucaoBoleto', case when v_override then coalesce(v_enrollment.instrucao_boleto_carne_individual, v_class.instrucao_boleto_carne) else v_class.instrucao_boleto_carne end
    )
  );
  v_override_fingerprint := internal_academic.technical_financial_override_fingerprint(p_matricula_id);
  v_effective_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        jsonb_build_object(
          'turmaFingerprint', v_class_rule -> 'identidade' ->> 'turmaFingerprint',
          'overrideFingerprint', v_override_fingerprint,
          'regra', v_rule
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_first_due := greatest(
    coalesce(v_config.primeiro_vencimento, v_enrollment.data_primeiro_vencimento_financeiro, v_class.data_inicio,
      (pg_catalog.timezone('America/Maceio', now()))::date),
    (pg_catalog.timezone('America/Maceio', now()))::date
  );
  return internal_academic.render_technical_financial_rule(
    v_rule,
    v_first_due,
    jsonb_build_object(
      'turmaRevisao', v_class.regra_financeira_revisao,
      'turmaFingerprint', v_class_rule -> 'identidade' ->> 'turmaFingerprint',
      'overrideRevisao', v_config.override_revisao,
      'overrideFingerprint', v_override_fingerprint,
      'efetivaFingerprint', v_effective_fingerprint
    ),
    case when v_override then 'INDIVIDUAL' else 'TURMA' end
  ) || jsonb_build_object(
    'revisao', v_class.regra_financeira_revisao,
    'fingerprint', v_class_rule -> 'identidade' ->> 'turmaFingerprint',
    'primeiroVencimentoSugerido', pg_catalog.to_char(v_first_due, 'YYYY-MM-DD')
  );
end;
$function$;

revoke all on function internal_academic.technical_financial_effective_rule(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.build_technical_receivable_policy_snapshot(
  p_matricula_id uuid,
  p_tipo_lancamento text,
  p_descricao text,
  p_valor numeric,
  p_preservar_politica_legada boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_modalidade text;
  v_has_config boolean;
  v_override_active boolean := false;
  v_effective jsonb;
  v_kind text;
  v_kind_key text;
  v_discount numeric;
  v_interest numeric;
  v_fine_value numeric;
  v_apply_discount boolean;
  v_apply_late boolean;
  v_instruction text;
  v_identity jsonb;
begin
  if p_matricula_id is null then return null; end if;

  select enrollment.* into v_enrollment
  from public.matriculas enrollment
  where enrollment.id = p_matricula_id;
  if not found then return null; end if;

  select class.*
  into v_class
  from public.turmas class
  where class.id = v_enrollment.turma_id;
  if not found then return null; end if;

  select upper(coalesce(course.modalidade, ''))
  into v_modalidade
  from public.cursos course
  where course.id = v_class.curso_id;
  if not found or v_modalidade not in ('TECNICO', 'TÉCNICO') then return null; end if;

  v_kind := case
    when upper(coalesce(p_tipo_lancamento, '')) = 'REMATRICULA'
      or lower(coalesce(p_descricao, '')) like '%rematricula%'
      or lower(coalesce(p_descricao, '')) like '%rematrícula%'
      then 'REMATRICULA'
    when upper(coalesce(p_tipo_lancamento, '')) = 'MATRICULA'
      or lower(coalesce(p_descricao, '')) like '%matricula%'
      or lower(coalesce(p_descricao, '')) like '%matrícula%'
      then 'MATRICULA'
    else 'MENSALIDADE'
  end;
  v_kind_key := case v_kind
    when 'MATRICULA' then 'matricula'
    when 'REMATRICULA' then 'rematricula'
    else 'mensalidade'
  end;

  select config.override_ativo
  into v_override_active
  from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = p_matricula_id;
  v_has_config := found;

  if v_has_config and not p_preservar_politica_legada then
    v_effective := internal_academic.technical_financial_effective_rule(p_matricula_id);
    v_discount := greatest(0, coalesce((v_effective -> 'encargos' ->> 'descontoPontualidade')::numeric, 0));
    v_interest := greatest(0, coalesce((v_effective -> 'encargos' ->> 'jurosAtrasoPercentual')::numeric, 0));
    v_fine_value := round(
      greatest(0, coalesce(p_valor, 0))
      * greatest(0, coalesce((v_effective -> 'encargos' ->> 'multaAtrasoPercentual')::numeric, 0))
      / 100.0,
      2
    );
    v_apply_discount := coalesce((v_effective -> 'aplicacao' -> v_kind_key ->> 'desconto')::boolean, false);
    v_apply_late := coalesce((v_effective -> 'aplicacao' -> v_kind_key ->> 'multaJuros')::boolean, false);
    v_instruction := v_effective -> 'boleto' ->> 'instrucao';
    v_identity := v_effective -> 'identidade';
  else
    -- O backfill congela exatamente a política que o portal aplicava antes
    -- desta migration. Nenhum título legado muda de valor na implantação.
    v_discount := greatest(0, coalesce(
      v_enrollment.desconto_pontualidade_individual,
      v_class.desconto_pontualidade,
      0
    ));
    v_interest := greatest(0, coalesce(
      v_enrollment.juros_atraso_individual,
      v_class.juros_atraso,
      0
    ));
    v_fine_value := greatest(0, coalesce(
      v_enrollment.multa_atraso_individual,
      v_class.multa_atraso,
      0
    ));
    v_apply_discount := case v_kind
      when 'MATRICULA' then v_class.aplicar_desconto_matricula is true
      when 'REMATRICULA' then v_class.aplicar_desconto_rematricula is not false
      else v_class.aplicar_desconto_mensalidade is not false
    end;
    v_apply_late := case v_kind
      when 'MATRICULA' then v_class.aplicar_multa_juros_matricula is not false
      when 'REMATRICULA' then v_class.aplicar_multa_juros_rematricula is not false
      else v_class.aplicar_multa_juros_mensalidade is not false
    end;
    v_instruction := v_class.instrucao_boleto_carne;
    v_identity := jsonb_build_object(
      'turmaRevisao', v_class.regra_financeira_revisao,
      'turmaFingerprint', v_class.regra_financeira_fingerprint,
      'overrideRevisao', null,
      'overrideFingerprint', null,
      'efetivaFingerprint', null
    );
  end if;

  return jsonb_build_object(
    'versao', 1,
    'origem', case
      when p_preservar_politica_legada then 'LEGADO_CONGELADO'
      when v_override_active then 'INDIVIDUAL'
      else 'TURMA'
    end,
    'overrideAtivo', case when p_preservar_politica_legada then null else v_override_active end,
    'tipoLancamento', v_kind,
    'valorBase', round(greatest(0, coalesce(p_valor, 0)), 2),
    'descontoPontualidade', round(v_discount, 2),
    'jurosAtrasoPercentual', round(v_interest, 6),
    'multaAtrasoValor', round(v_fine_value, 2),
    'aplicarDesconto', v_apply_discount,
    'aplicarMultaJuros', v_apply_late,
    'instrucaoBoleto', v_instruction,
    'identidade', v_identity,
    'capturadoEm', now()
  );
end;
$function$;

revoke all on function internal_academic.build_technical_receivable_policy_snapshot(
  uuid, text, text, numeric, boolean
) from public, anon, authenticated, service_role;

create or replace function public.salvar_regra_financeira_turma_tecnica_secure(
  p_turma_id uuid,
  p_request_id uuid,
  p_expected_revisao integer,
  p_expected_fingerprint text,
  p_regra jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma public.turmas%rowtype;
  v_rule jsonb;
  v_current jsonb;
  v_payload_hash text;
  v_existing record;
  v_response jsonb;
begin
  if p_request_id is null then
    raise exception 'requestId é obrigatório.' using errcode = '22023';
  end if;
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then
    raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501';
  end if;
  v_rule := internal_academic.validate_technical_financial_rule_input(p_regra);
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'turmaId', p_turma_id,
      'expectedRevisao', p_expected_revisao,
      'expectedFingerprint', p_expected_fingerprint,
      'regra', v_rule
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('technical-finance-request:' || p_request_id::text, 0)
  );
  select request.operation, request.actor_id, request.payload_hash, request.response
  into v_existing
  from internal_academic.technical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'SALVAR_REGRA_TURMA'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;

  select class.* into v_turma from public.turmas class
  where class.id = p_turma_id for update;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;
  if upper(coalesce(v_turma.status, '')) not in ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO') then
    raise exception 'O estado da turma não permite editar a regra financeira.' using errcode = '22023';
  end if;
  v_current := internal_academic.technical_financial_rule(p_turma_id);
  if p_expected_revisao is null or coalesce(p_expected_fingerprint, '') = ''
    or (v_current -> 'identidade' ->> 'turmaRevisao')::integer <> p_expected_revisao
    or v_current -> 'identidade' ->> 'turmaFingerprint' <> p_expected_fingerprint
  then
    raise exception 'A regra financeira da turma mudou. Recarregue antes de salvar.'
      using errcode = '40001';
  end if;

  perform set_config('app.technical_financial_request_id', p_request_id::text, true);
  perform set_config('app.technical_financial_origin', 'MUTATION', true);
  update public.turmas class set
    cobrar_matricula = (v_rule ->> 'cobrarMatricula')::boolean,
    valor_matricula = (v_rule ->> 'valorMatricula')::numeric,
    qtd_parcelas = (v_rule ->> 'qtdMensalidades')::integer,
    valor_parcela = (v_rule ->> 'valorMensalidade')::numeric,
    cobrar_rematricula = (v_rule ->> 'cobrarRematricula')::boolean,
    valor_rematricula = (v_rule ->> 'valorRematricula')::numeric,
    dia_vencimento_padrao = (v_rule ->> 'diaVencimento')::integer,
    desconto_pontualidade = (v_rule ->> 'descontoPontualidade')::numeric,
    juros_atraso = (v_rule ->> 'jurosAtrasoPercentual')::numeric,
    multa_atraso_percentual = (v_rule ->> 'multaAtrasoPercentual')::numeric,
    aplicar_desconto_matricula = (v_rule ->> 'aplicarDescontoMatricula')::boolean,
    aplicar_multa_juros_matricula = (v_rule ->> 'aplicarMultaJurosMatricula')::boolean,
    aplicar_desconto_mensalidade = (v_rule ->> 'aplicarDescontoMensalidade')::boolean,
    aplicar_multa_juros_mensalidade = (v_rule ->> 'aplicarMultaJurosMensalidade')::boolean,
    aplicar_desconto_rematricula = (v_rule ->> 'aplicarDescontoRematricula')::boolean,
    aplicar_multa_juros_rematricula = (v_rule ->> 'aplicarMultaJurosRematricula')::boolean,
    instrucao_boleto_carne = v_rule ->> 'instrucaoBoleto'
  where class.id = p_turma_id;

  v_current := internal_academic.technical_financial_rule(p_turma_id);
  insert into public.historico_turma_financeira(
    turma_id, matricula_id, evento, regra, observacao
  ) values (
    p_turma_id, null, 'REGRA_TECNICA_ATUALIZADA', v_current,
    'Regra viva alterada sem reprecificar títulos já emitidos.'
  );
  v_response := jsonb_build_object(
    'operacao', 'SALVAR_REGRA_TURMA',
    'requestId', p_request_id,
    'replayed', false,
    'regra', v_current,
    'workspace', public.obter_financeiro_matricula_tecnica_workspace_secure(p_turma_id, null)
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (
    p_request_id, 'SALVAR_REGRA_TURMA', auth.uid(), v_payload_hash, v_response
  );
  return v_response;
end;
$function$;

create or replace function internal_academic.validate_technical_financial_override_input(
  p_override jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_unknown text;
  v_key text;
  v_value text;
begin
  if p_override is null or jsonb_typeof(p_override) <> 'object' then
    raise exception 'O override financeiro deve ser um objeto.' using errcode = '22023';
  end if;
  select key into v_unknown from jsonb_object_keys(p_override) key
  where key not in (
    'cobrarMatricula', 'valorMatricula', 'qtdMensalidades',
    'valorMensalidade', 'cobrarRematricula', 'valorRematricula',
    'diaVencimento', 'descontoPontualidade', 'jurosAtrasoPercentual',
    'multaAtrasoPercentual', 'aplicarDescontoMatricula',
    'aplicarMultaJurosMatricula', 'aplicarDescontoMensalidade',
    'aplicarMultaJurosMensalidade', 'aplicarDescontoRematricula',
    'aplicarMultaJurosRematricula', 'instrucaoBoleto'
  ) limit 1;
  if v_unknown is not null then
    raise exception 'Campo de override não suportado: %.', v_unknown using errcode = '22023';
  end if;
  for v_key in select key from jsonb_object_keys(p_override) key loop
    if jsonb_typeof(p_override -> v_key) = 'null' then continue; end if;
    v_value := p_override ->> v_key;
    begin
      if v_key in (
        'cobrarMatricula', 'cobrarRematricula',
        'aplicarDescontoMatricula', 'aplicarMultaJurosMatricula',
        'aplicarDescontoMensalidade', 'aplicarMultaJurosMensalidade',
        'aplicarDescontoRematricula', 'aplicarMultaJurosRematricula'
      ) then perform v_value::boolean;
      elsif v_key in ('qtdMensalidades', 'diaVencimento') then perform v_value::integer;
      elsif v_key <> 'instrucaoBoleto' then perform v_value::numeric;
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Override financeiro contém valor inválido em %.', v_key using errcode = '22023';
    end;
  end loop;
  if p_override ? 'qtdMensalidades'
    and jsonb_typeof(p_override -> 'qtdMensalidades') <> 'null'
    and (p_override ->> 'qtdMensalidades')::integer not between 1 and 60
  then raise exception 'Quantidade individual deve ficar entre 1 e 60.' using errcode = '22023'; end if;
  if p_override ? 'diaVencimento'
    and jsonb_typeof(p_override -> 'diaVencimento') <> 'null'
    and (p_override ->> 'diaVencimento')::integer not between 1 and 31
  then raise exception 'Dia individual deve ficar entre 1 e 31.' using errcode = '22023'; end if;
  if p_override ? 'instrucaoBoleto'
    and jsonb_typeof(p_override -> 'instrucaoBoleto') <> 'null'
    and pg_catalog.length(pg_catalog.btrim(p_override ->> 'instrucaoBoleto')) not between 1 and 180
  then
    raise exception 'Instrução individual deve ter de 1 a 180 caracteres.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each_text(p_override) item
    where item.key in (
      'valorMatricula','valorMensalidade','valorRematricula','descontoPontualidade',
      'jurosAtrasoPercentual','multaAtrasoPercentual'
    ) and item.value is not null and item.value::numeric < 0
  ) then raise exception 'Override financeiro não aceita valor negativo.' using errcode = '22023'; end if;
  if (p_override ? 'valorMensalidade')
    and jsonb_typeof(p_override -> 'valorMensalidade') <> 'null'
    and (p_override ->> 'valorMensalidade')::numeric <= 0
  then raise exception 'Mensalidade individual deve ser positiva.' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_each_text(p_override) item
    where item.key in ('jurosAtrasoPercentual','multaAtrasoPercentual')
      and item.value is not null and item.value::numeric > 100
  ) then raise exception 'Percentual individual deve ficar entre 0 e 100.' using errcode = '22023'; end if;
  return p_override;
end;
$function$;

revoke all on function internal_academic.validate_technical_financial_override_input(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.salvar_override_financeiro_matricula_tecnica_secure(
  p_matricula_id uuid,
  p_request_id uuid,
  p_expected_turma_revisao integer,
  p_expected_turma_fingerprint text,
  p_expected_override_revisao integer,
  p_expected_override_fingerprint text,
  p_override jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_override jsonb;
  v_current jsonb;
  v_effective jsonb;
  v_effective_fingerprint text;
  v_override_fingerprint text;
  v_payload_hash text;
  v_existing record;
  v_response jsonb;
begin
  if p_request_id is null then raise exception 'requestId é obrigatório.' using errcode = '22023'; end if;
  select enrollment.turma_id into v_turma_id
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(v_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501'; end if;
  v_override := internal_academic.validate_technical_financial_override_input(p_override);
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'matriculaId', p_matricula_id,
      'expectedTurmaRevisao', p_expected_turma_revisao,
      'expectedTurmaFingerprint', p_expected_turma_fingerprint,
      'expectedOverrideRevisao', p_expected_override_revisao,
      'expectedOverrideFingerprint', p_expected_override_fingerprint,
      'override', v_override
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('technical-finance-request:' || p_request_id::text, 0)
  );
  select request.operation, request.actor_id, request.payload_hash, request.response
  into v_existing from internal_academic.technical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'SALVAR_OVERRIDE_MATRICULA'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023'; end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;

  perform 1 from public.turmas class where class.id = v_turma_id for update;
  perform 1 from public.matriculas enrollment where enrollment.id = p_matricula_id for update;
  perform 1 from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = p_matricula_id for update;
  if not found then raise exception 'Financeiro técnico não configurado.' using errcode = '22023'; end if;
  v_current := internal_academic.technical_financial_effective_rule(p_matricula_id);
  if p_expected_turma_revisao is null or coalesce(p_expected_turma_fingerprint, '') = ''
    or (v_current -> 'identidade' ->> 'turmaRevisao')::integer <> p_expected_turma_revisao
    or v_current -> 'identidade' ->> 'turmaFingerprint' <> p_expected_turma_fingerprint
    or p_expected_override_revisao is null or coalesce(p_expected_override_fingerprint, '') = ''
    or (v_current -> 'identidade' ->> 'overrideRevisao')::integer <> p_expected_override_revisao
    or v_current -> 'identidade' ->> 'overrideFingerprint' <> p_expected_override_fingerprint
  then
    raise exception 'A regra efetiva da matrícula mudou. Recarregue antes de salvar.'
      using errcode = '40001';
  end if;

  perform set_config('app.technical_financial_request_id', p_request_id::text, true);
  perform set_config('app.technical_financial_origin', 'MUTATION', true);
  perform internal_academic.authorize_matricula_control_update(p_matricula_id);
  update public.matriculas enrollment set
    cobrar_matricula_individual = case when jsonb_typeof(v_override -> 'cobrarMatricula') = 'null' then null else (v_override ->> 'cobrarMatricula')::boolean end,
    valor_matricula_individual = case when jsonb_typeof(v_override -> 'valorMatricula') = 'null' then null else (v_override ->> 'valorMatricula')::numeric end,
    qtd_parcelas_individual = case when jsonb_typeof(v_override -> 'qtdMensalidades') = 'null' then null else (v_override ->> 'qtdMensalidades')::integer end,
    valor_parcela_individual = case when jsonb_typeof(v_override -> 'valorMensalidade') = 'null' then null else (v_override ->> 'valorMensalidade')::numeric end,
    cobrar_rematricula_individual = case when jsonb_typeof(v_override -> 'cobrarRematricula') = 'null' then null else (v_override ->> 'cobrarRematricula')::boolean end,
    valor_rematricula_individual = case when jsonb_typeof(v_override -> 'valorRematricula') = 'null' then null else (v_override ->> 'valorRematricula')::numeric end,
    dia_vencimento_individual = case when jsonb_typeof(v_override -> 'diaVencimento') = 'null' then null else (v_override ->> 'diaVencimento')::integer end,
    desconto_pontualidade_individual = case when jsonb_typeof(v_override -> 'descontoPontualidade') = 'null' then null else (v_override ->> 'descontoPontualidade')::numeric end,
    juros_atraso_individual = case when jsonb_typeof(v_override -> 'jurosAtrasoPercentual') = 'null' then null else (v_override ->> 'jurosAtrasoPercentual')::numeric end,
    multa_atraso_percentual_individual = case when jsonb_typeof(v_override -> 'multaAtrasoPercentual') = 'null' then null else (v_override ->> 'multaAtrasoPercentual')::numeric end,
    aplicar_desconto_matricula_individual = case when jsonb_typeof(v_override -> 'aplicarDescontoMatricula') = 'null' then null else (v_override ->> 'aplicarDescontoMatricula')::boolean end,
    aplicar_multa_juros_matricula_individual = case when jsonb_typeof(v_override -> 'aplicarMultaJurosMatricula') = 'null' then null else (v_override ->> 'aplicarMultaJurosMatricula')::boolean end,
    aplicar_desconto_mensalidade_individual = case when jsonb_typeof(v_override -> 'aplicarDescontoMensalidade') = 'null' then null else (v_override ->> 'aplicarDescontoMensalidade')::boolean end,
    aplicar_multa_juros_mensalidade_individual = case when jsonb_typeof(v_override -> 'aplicarMultaJurosMensalidade') = 'null' then null else (v_override ->> 'aplicarMultaJurosMensalidade')::boolean end,
    aplicar_desconto_rematricula_individual = case when jsonb_typeof(v_override -> 'aplicarDescontoRematricula') = 'null' then null else (v_override ->> 'aplicarDescontoRematricula')::boolean end,
    aplicar_multa_juros_rematricula_individual = case when jsonb_typeof(v_override -> 'aplicarMultaJurosRematricula') = 'null' then null else (v_override ->> 'aplicarMultaJurosRematricula')::boolean end,
    instrucao_boleto_carne_individual = case when jsonb_typeof(v_override -> 'instrucaoBoleto') = 'null' then null else pg_catalog.btrim(v_override ->> 'instrucaoBoleto') end
  where enrollment.id = p_matricula_id;

  update public.matriculas_tecnicas_financeiro_config config set
    override_ativo = true,
    override_revisao = config.override_revisao + 1
  where config.matricula_id = p_matricula_id;
  v_effective := internal_academic.technical_financial_effective_rule(p_matricula_id);
  perform internal_academic.authorize_matricula_control_update(p_matricula_id);
  update public.matriculas enrollment set
    multa_atraso_individual = round(
      (v_effective -> 'cobranca' -> 'mensalidade' ->> 'valor')::numeric
      * (v_effective -> 'encargos' ->> 'multaAtrasoPercentual')::numeric / 100.0,
      2
    )
  where enrollment.id = p_matricula_id;
  v_override_fingerprint := internal_academic.technical_financial_override_fingerprint(p_matricula_id);
  v_effective := internal_academic.technical_financial_effective_rule(p_matricula_id);
  v_effective_fingerprint := v_effective -> 'identidade' ->> 'efetivaFingerprint';
  update public.matriculas_tecnicas_financeiro_config config set
    override_fingerprint = v_override_fingerprint,
    regra_efetiva_fingerprint = v_effective_fingerprint
  where config.matricula_id = p_matricula_id;

  insert into public.historico_turma_financeira(
    turma_id, matricula_id, evento, regra, observacao
  ) values (
    v_turma_id, p_matricula_id, 'REGRA_TECNICA_INDIVIDUAL_ATUALIZADA', v_effective,
    'Override por campo atualizado; títulos existentes permanecem imutáveis.'
  );
  v_response := jsonb_build_object(
    'operacao', 'SALVAR_OVERRIDE_MATRICULA',
    'requestId', p_request_id,
    'replayed', false,
    'matriculaId', p_matricula_id,
    'matricula', internal_academic.technical_financial_row(p_matricula_id),
    'workspace', public.obter_financeiro_matricula_tecnica_workspace_secure(v_turma_id, null)
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (
    p_request_id, 'SALVAR_OVERRIDE_MATRICULA', auth.uid(), v_payload_hash, v_response
  );
  return v_response;
end;
$function$;

create or replace function public.remover_override_financeiro_matricula_tecnica_secure(
  p_matricula_id uuid,
  p_request_id uuid,
  p_expected_turma_revisao integer,
  p_expected_turma_fingerprint text,
  p_expected_override_revisao integer,
  p_expected_override_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_current jsonb;
  v_effective jsonb;
  v_override_fingerprint text;
  v_payload_hash text;
  v_existing record;
  v_response jsonb;
begin
  if p_request_id is null then raise exception 'requestId é obrigatório.' using errcode = '22023'; end if;
  select enrollment.turma_id into v_turma_id
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(v_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501'; end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'matriculaId', p_matricula_id,
      'expectedTurmaRevisao', p_expected_turma_revisao,
      'expectedTurmaFingerprint', p_expected_turma_fingerprint,
      'expectedOverrideRevisao', p_expected_override_revisao,
      'expectedOverrideFingerprint', p_expected_override_fingerprint
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('technical-finance-request:' || p_request_id::text, 0)
  );
  select request.operation, request.actor_id, request.payload_hash, request.response
  into v_existing from internal_academic.technical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'REMOVER_OVERRIDE_MATRICULA'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023'; end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;

  perform 1 from public.turmas class where class.id = v_turma_id for update;
  perform 1 from public.matriculas enrollment where enrollment.id = p_matricula_id for update;
  perform 1 from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = p_matricula_id for update;
  if not found then raise exception 'Financeiro técnico não configurado.' using errcode = '22023'; end if;
  v_current := internal_academic.technical_financial_effective_rule(p_matricula_id);
  if p_expected_turma_revisao is null or coalesce(p_expected_turma_fingerprint, '') = ''
    or (v_current -> 'identidade' ->> 'turmaRevisao')::integer <> p_expected_turma_revisao
    or v_current -> 'identidade' ->> 'turmaFingerprint' <> p_expected_turma_fingerprint
    or p_expected_override_revisao is null or coalesce(p_expected_override_fingerprint, '') = ''
    or (v_current -> 'identidade' ->> 'overrideRevisao')::integer <> p_expected_override_revisao
    or v_current -> 'identidade' ->> 'overrideFingerprint' <> p_expected_override_fingerprint
  then raise exception 'A regra efetiva da matrícula mudou. Recarregue antes de remover.' using errcode = '40001'; end if;

  perform set_config('app.technical_financial_request_id', p_request_id::text, true);
  perform set_config('app.technical_financial_origin', 'MUTATION', true);
  update public.matriculas_tecnicas_financeiro_config config set
    override_ativo = false,
    override_revisao = config.override_revisao + 1
  where config.matricula_id = p_matricula_id;
  v_override_fingerprint := internal_academic.technical_financial_override_fingerprint(p_matricula_id);
  v_effective := internal_academic.technical_financial_effective_rule(p_matricula_id);
  update public.matriculas_tecnicas_financeiro_config config set
    override_fingerprint = v_override_fingerprint,
    regra_efetiva_fingerprint = v_effective -> 'identidade' ->> 'efetivaFingerprint'
  where config.matricula_id = p_matricula_id;
  insert into public.historico_turma_financeira(
    turma_id, matricula_id, evento, regra, observacao
  ) values (
    v_turma_id, p_matricula_id, 'REGRA_TECNICA_INDIVIDUAL_REMOVIDA', v_effective,
    'Override desativado sem apagar valores históricos nem reprecificar títulos.'
  );
  v_response := jsonb_build_object(
    'operacao', 'REMOVER_OVERRIDE_MATRICULA',
    'requestId', p_request_id,
    'replayed', false,
    'matriculaId', p_matricula_id,
    'matricula', internal_academic.technical_financial_row(p_matricula_id),
    'workspace', public.obter_financeiro_matricula_tecnica_workspace_secure(v_turma_id, null)
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (
    p_request_id, 'REMOVER_OVERRIDE_MATRICULA', auth.uid(), v_payload_hash, v_response
  );
  return v_response;
end;
$function$;

create or replace function internal_academic.technical_financial_row(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_row record;
  v_effective jsonb;
  v_override jsonb;
  v_situation text;
  v_progress numeric;
begin
  select
    enrollment.id as matricula_id,
    enrollment.aluno_id,
    student.nome as aluno_nome,
    enrollment.status as status_academico,
    config.status_financeiro,
    config.primeiro_vencimento,
    config.ativar_em,
    config.regra_revisao,
    config.regra_fingerprint,
    config.regra_efetiva_fingerprint,
    config.updated_at,
    title.id as titulo_id,
    title.status as titulo_status,
    title.valor as titulo_valor,
    title.data_vencimento as titulo_vencimento,
    coalesce(receivables.total_parcelas, 0)::integer as total_parcelas,
    coalesce(receivables.parcelas_pagas, 0)::integer as parcelas_pagas,
    coalesce(receivables.has_overdue, false) as has_overdue,
    coalesce(receivables.valor_total, 0) as valor_total,
    coalesce(receivables.valor_recebido, 0) as valor_recebido,
    coalesce(receivables.valor_inadimplente, 0) as valor_inadimplente
  into v_row
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  left join public.matriculas_tecnicas_financeiro_config config
    on config.matricula_id = enrollment.id
  left join public.contas_receber title on title.id = config.titulo_matricula_id
  left join lateral (
    select
      count(*)::integer total_parcelas,
      count(*) filter (where receivable.status = 'PAGO')::integer parcelas_pagas,
      bool_or(
        receivable.status = 'VENCIDO'
        or (receivable.status = 'PENDENTE' and receivable.data_vencimento < (pg_catalog.timezone('America/Maceio', now()))::date)
      ) has_overdue,
      coalesce(sum(receivable.valor), 0) valor_total,
      coalesce(sum(coalesce(receivable.valor_pago, receivable.valor)) filter (where receivable.status = 'PAGO'), 0) valor_recebido,
      coalesce(sum(receivable.valor) filter (
        where receivable.status = 'VENCIDO'
          or (receivable.status = 'PENDENTE' and receivable.data_vencimento < (pg_catalog.timezone('America/Maceio', now()))::date)
      ), 0) valor_inadimplente
    from public.contas_receber receivable
    where receivable.matricula_id = enrollment.id
  ) receivables on true
  where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;

  if v_row.status_financeiro is not null then
    v_effective := internal_academic.technical_financial_effective_rule(p_matricula_id);
    v_override := internal_academic.render_technical_financial_override(p_matricula_id);
  end if;
  v_progress := case when v_row.total_parcelas > 0
    then round(v_row.parcelas_pagas::numeric * 100.0 / v_row.total_parcelas, 2)
    else 0 end;
  v_situation := case
    when v_row.status_financeiro is null then 'SEM_CONFIGURACAO'
    when v_row.has_overdue then 'INADIMPLENTE'
    when v_row.status_financeiro = 'PENDENTE' then 'PENDENTE'
    when v_row.status_financeiro = 'AGENDADA' then 'AGENDADA'
    when v_row.status_financeiro in ('ATIVADA', 'GERADA') then 'EM_DIA'
    else v_row.status_financeiro
  end;
  return jsonb_build_object(
    'matriculaId', v_row.matricula_id,
    'matriculaExibicao', upper(pg_catalog.left(pg_catalog.replace(v_row.matricula_id::text, '-', ''), 8)),
    'alunoId', v_row.aluno_id,
    'alunoNome', v_row.aluno_nome,
    'statusAcademico', v_row.status_academico,
    'situacaoFinanceira', v_situation,
    'valorMatriculaEfetivo', case when v_effective is null then null else v_effective -> 'cobranca' -> 'matricula' ->> 'valor' end,
    'valorMensalidadeEfetivo', case when v_effective is null then null else v_effective -> 'cobranca' -> 'mensalidade' ->> 'valor' end,
    'parcelasPagas', v_row.parcelas_pagas,
    'totalParcelas', v_row.total_parcelas,
    'progressoPercentual', pg_catalog.to_char(v_progress, 'FM999999990.00'),
    'totais', jsonb_build_object(
      'total', pg_catalog.to_char(v_row.valor_total, 'FM999999990.00'),
      'recebido', pg_catalog.to_char(v_row.valor_recebido, 'FM999999990.00'),
      'inadimplencia', pg_catalog.to_char(v_row.valor_inadimplente, 'FM999999990.00')
    ),
    'overrideAtivo', coalesce((v_override ->> 'ativo')::boolean, false),
    'override', v_override,
    'regraEfetiva', v_effective,
    'financeiro', jsonb_build_object(
      'status', coalesce(v_row.status_financeiro, 'NAO_CONFIGURADO'),
      'primeiroVencimento', v_row.primeiro_vencimento,
      'ativarEm', v_row.ativar_em,
      'regraRevisao', v_row.regra_revisao,
      'regraFingerprint', v_row.regra_fingerprint,
      'regraEfetivaFingerprint', v_row.regra_efetiva_fingerprint,
      'regraDesatualizada', case when v_effective is null then false else
        v_row.regra_efetiva_fingerprint is distinct from (v_effective -> 'identidade' ->> 'efetivaFingerprint') end,
      'titulo', case when v_row.titulo_id is null then null else jsonb_build_object(
        'id', v_row.titulo_id,
        'status', v_row.titulo_status,
        'valor', pg_catalog.to_char(v_row.titulo_valor, 'FM999999990.00'),
        'vencimento', pg_catalog.to_char(v_row.titulo_vencimento, 'YYYY-MM-DD')
      ) end,
      'updatedAt', v_row.updated_at
    )
  );
end;
$function$;

revoke all on function internal_academic.technical_financial_row(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.obter_financeiro_matricula_tecnica_workspace_secure(
  p_turma_id uuid,
  p_aluno_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_aluno jsonb := null;
  v_rows jsonb;
  v_total numeric;
  v_received numeric;
  v_overdue numeric;
  v_received_percent numeric;
  v_overdue_percent numeric;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then raise exception 'Sem permissão para consultar esta turma.' using errcode = '42501'; end if;
  select class.id, class.codigo, class.nome, class.polo_id, class.status,
    upper(coalesce(course.modalidade, '')) as modalidade
  into v_turma
  from public.turmas class join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if not found or v_turma.modalidade not in ('TECNICO', 'TÉCNICO') then
    raise exception 'Turma técnica não encontrada.' using errcode = '22023';
  end if;
  if p_aluno_id is not null then
    select jsonb_build_object('alunoId', student.id, 'nome', student.nome)
    into v_aluno from public.parceiros student
    where student.id = p_aluno_id and student.tipo = 'Aluno';
    if v_aluno is null then raise exception 'Aluno não encontrado.' using errcode = '22023'; end if;
  end if;

  select
    coalesce(sum(receivable.valor), 0),
    coalesce(sum(coalesce(receivable.valor_pago, receivable.valor)) filter (where receivable.status = 'PAGO'), 0),
    coalesce(sum(receivable.valor) filter (
      where receivable.status = 'VENCIDO'
        or (receivable.status = 'PENDENTE' and receivable.data_vencimento < (pg_catalog.timezone('America/Maceio', now()))::date)
    ), 0)
  into v_total, v_received, v_overdue
  from public.contas_receber receivable
  where receivable.turma_id = p_turma_id;
  v_received_percent := case when v_total > 0 then round(v_received * 100.0 / v_total, 2) else 0 end;
  v_overdue_percent := case when v_total > 0 then round(v_overdue * 100.0 / v_total, 2) else 0 end;

  select coalesce(jsonb_agg(
    internal_academic.technical_financial_row(enrollment.id)
    order by student.nome, enrollment.id
  ), '[]'::jsonb)
  into v_rows
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  where enrollment.turma_id = p_turma_id
    and (p_aluno_id is null or enrollment.aluno_id = p_aluno_id);

  return jsonb_build_object(
    'turma', jsonb_build_object(
      'turmaId', v_turma.id, 'codigo', v_turma.codigo, 'nome', v_turma.nome,
      'poloId', v_turma.polo_id, 'status', v_turma.status
    ),
    'regra', internal_academic.technical_financial_rule(p_turma_id),
    'resumo', jsonb_build_object(
      'total', pg_catalog.to_char(v_total, 'FM999999990.00'),
      'recebido', pg_catalog.to_char(v_received, 'FM999999990.00'),
      'inadimplencia', pg_catalog.to_char(v_overdue, 'FM999999990.00'),
      'recebidoPercentual', pg_catalog.to_char(v_received_percent, 'FM999999990.00'),
      'inadimplenciaPercentual', pg_catalog.to_char(v_overdue_percent, 'FM999999990.00')
    ),
    'aluno', v_aluno,
    'matriculas', v_rows
  );
end;
$function$;

create or replace function internal_academic.generate_technical_enrollment_fee(
  p_matricula_id uuid
)
returns public.contas_receber
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_effective jsonb;
  v_title public.contas_receber%rowtype;
  v_value numeric;
  v_due date;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  select class.* into v_class from public.turmas class where class.id = v_enrollment.turma_id;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.matriculas_tecnicas_financeiro_config config
    where config.matricula_id = p_matricula_id
  ) then
    raise exception 'Configuração financeira técnica não encontrada.' using errcode = '22023';
  end if;
  v_effective := internal_academic.technical_financial_effective_rule(p_matricula_id);
  if not (v_effective -> 'cobranca' -> 'matricula' ->> 'habilitada')::boolean then
    return null;
  end if;
  v_value := (v_effective -> 'cobranca' -> 'matricula' ->> 'valor')::numeric;
  if v_value <= 0 then return null; end if;
  v_due := coalesce(
    v_enrollment.data_primeiro_vencimento_financeiro,
    (v_effective -> 'vencimento' ->> 'primeiroVencimentoSugerido')::date,
    (pg_catalog.timezone('America/Maceio', now()))::date
  );

  select * into v_title from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
    and receivable.origem_cronograma_id = 'matricula'
  limit 1;
  if found then return v_title; end if;
  insert into public.contas_receber(
    polo_id, descricao, valor, data_vencimento, status, categoria,
    cliente_id, matricula_id, turma_id, tipo_lancamento,
    parcela_numero, origem_cronograma_id
  ) values (
    v_class.polo_id,
    'Matrícula inicial - ' || v_class.nome,
    v_value,
    v_due,
    case when v_due < (pg_catalog.timezone('America/Maceio', now()))::date
      then 'VENCIDO' else 'PENDENTE' end,
    'MENSALIDADE',
    v_enrollment.aluno_id,
    v_enrollment.id,
    v_enrollment.turma_id,
    'MATRICULA',
    0,
    'matricula'
  )
  on conflict (matricula_id, origem_cronograma_id)
    where matricula_id is not null and origem_cronograma_id is not null
  do nothing
  returning * into v_title;
  if v_title.id is null then
    select * into v_title from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and receivable.origem_cronograma_id = 'matricula'
    limit 1;
  end if;
  return v_title;
end;
$function$;

revoke all on function internal_academic.generate_technical_enrollment_fee(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.gerar_parcelas_matricula(
  p_matricula_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_effective jsonb;
  v_last_cycle integer;
  v_new_cycle integer;
  v_count integer;
  v_base date;
  v_day integer;
  v_value numeric;
  v_due date;
  v_number integer;
  v_offset integer;
  v_inserted integer := 0;
  v_row_count integer;
  v_has_matricula boolean;
  v_has_rematricula boolean;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  select class.* into v_class from public.turmas class where class.id = v_enrollment.turma_id;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.matriculas_tecnicas_financeiro_config config
    where config.matricula_id = p_matricula_id
  ) then return 0; end if;
  if not coalesce(v_enrollment.gerar_cobranca_futura, false) then return 0; end if;
  v_effective := internal_academic.technical_financial_effective_rule(p_matricula_id);
  v_count := (v_effective -> 'cobranca' -> 'mensalidade' ->> 'quantidade')::integer;
  v_day := (v_effective -> 'vencimento' ->> 'diaBase')::integer;
  v_value := (v_effective -> 'cobranca' -> 'mensalidade' ->> 'valor')::numeric;
  v_has_matricula := (v_effective -> 'cobranca' -> 'matricula' ->> 'habilitada')::boolean;
  v_has_rematricula := (v_effective -> 'cobranca' -> 'rematricula' ->> 'habilitada')::boolean;
  if v_count not between 1 and 60 or v_value <= 0 then return 0; end if;
  if exists (
    select 1 from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and receivable.tipo_lancamento in ('PARCELA', 'REMATRICULA')
      and receivable.status <> 'PAGO'
  ) then return 0; end if;

  select coalesce(max((pg_catalog.regexp_match(
    receivable.origem_cronograma_id, '^ciclo-([0-9]+)-parc-[0-9]+$'
  ))[1]::integer), 0)
  into v_last_cycle
  from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
    and receivable.tipo_lancamento = 'PARCELA'
    and receivable.origem_cronograma_id ~ '^ciclo-[0-9]+-parc-[0-9]+$';

  if v_last_cycle = 0 then
    if v_has_matricula then
      select max(coalesce(receivable.data_pagamento, receivable.data_vencimento))
      into v_base from public.contas_receber receivable
      where receivable.matricula_id = p_matricula_id
        and receivable.tipo_lancamento = 'MATRICULA'
        and receivable.status = 'PAGO';
      if v_base is null then return 0; end if;
      v_offset := 1;
    else
      select config.primeiro_vencimento into v_base
      from public.matriculas_tecnicas_financeiro_config config
      where config.matricula_id = p_matricula_id;
      v_base := coalesce(v_base, (v_effective -> 'vencimento' ->> 'primeiroVencimentoSugerido')::date);
      v_offset := 0;
    end if;
  else
    -- Sem rematrícula o ciclo termina definitivamente após as N mensalidades.
    if not v_has_rematricula then return 0; end if;
    select max(coalesce(receivable.data_pagamento, receivable.data_vencimento))
    into v_base from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and receivable.tipo_lancamento = 'REMATRICULA'
      and receivable.origem_cronograma_id = 'ciclo-' || v_last_cycle || '-rematricula'
      and receivable.status = 'PAGO';
    if v_base is null then return 0; end if;
    v_offset := 1;
  end if;

  v_new_cycle := v_last_cycle + 1;
  for v_number in 1..v_count loop
    v_due := public.data_vencimento_mensal(v_base, v_day, v_offset + v_number - 1);
    insert into public.contas_receber(
      polo_id, descricao, valor, data_vencimento, status, categoria,
      cliente_id, matricula_id, turma_id, tipo_lancamento,
      parcela_numero, origem_cronograma_id
    ) values (
      v_class.polo_id,
      'Mensalidade ' || v_number || '/' || v_count || ' - Ciclo ' || v_new_cycle || ' - ' || v_class.nome,
      v_value,
      v_due,
      case when v_due < (pg_catalog.timezone('America/Maceio', now()))::date then 'VENCIDO' else 'PENDENTE' end,
      'MENSALIDADE', v_enrollment.aluno_id, v_enrollment.id, v_enrollment.turma_id,
      'PARCELA', v_number, 'ciclo-' || v_new_cycle || '-parc-' || v_number
    )
    on conflict (matricula_id, origem_cronograma_id)
      where matricula_id is not null and origem_cronograma_id is not null
    do nothing;
    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
  end loop;
  return v_inserted;
end;
$function$;

revoke all on function public.gerar_parcelas_matricula(uuid)
  from public, anon, authenticated;
grant execute on function public.gerar_parcelas_matricula(uuid) to service_role;

create or replace function public.gerar_rematricula_apos_parcelas(
  p_matricula_id uuid
)
returns public.contas_receber
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_effective jsonb;
  v_title public.contas_receber%rowtype;
  v_cycle integer;
  v_total integer;
  v_paid integer;
  v_distinct_numbers integer;
  v_first_number integer;
  v_last_number integer;
  v_base date;
  v_due date;
  v_value numeric;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  select class.* into v_class from public.turmas class where class.id = v_enrollment.turma_id;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.matriculas_tecnicas_financeiro_config config
    where config.matricula_id = p_matricula_id
  ) then return null; end if;
  if not coalesce(v_enrollment.gerar_cobranca_futura, false) then return null; end if;
  v_effective := internal_academic.technical_financial_effective_rule(p_matricula_id);
  if not (v_effective -> 'cobranca' -> 'rematricula' ->> 'habilitada')::boolean then
    return null;
  end if;
  v_value := (v_effective -> 'cobranca' -> 'rematricula' ->> 'valor')::numeric;
  if v_value <= 0 then return null; end if;
  select coalesce(max((pg_catalog.regexp_match(
    receivable.origem_cronograma_id, '^ciclo-([0-9]+)-parc-[0-9]+$'
  ))[1]::integer), 0)
  into v_cycle
  from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
    and receivable.tipo_lancamento = 'PARCELA'
    and receivable.origem_cronograma_id ~ '^ciclo-[0-9]+-parc-[0-9]+$';
  if v_cycle = 0 then return null; end if;
  select * into v_title from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
    and receivable.origem_cronograma_id = 'ciclo-' || v_cycle || '-rematricula'
  limit 1;
  if found then return v_title; end if;
  select
    count(*),
    count(*) filter (where receivable.status = 'PAGO'),
    count(distinct receivable.parcela_numero),
    min(receivable.parcela_numero),
    max(receivable.parcela_numero),
    max(coalesce(receivable.data_pagamento, receivable.data_vencimento))
      filter (where receivable.status = 'PAGO')
  into v_total, v_paid, v_distinct_numbers, v_first_number, v_last_number, v_base
  from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
    and receivable.tipo_lancamento = 'PARCELA'
    and receivable.origem_cronograma_id like 'ciclo-' || v_cycle || '-parc-%';
  if v_total <= 0 or v_paid <> v_total or v_distinct_numbers <> v_total
    or v_first_number <> 1 or v_last_number <> v_total or v_base is null
  then return null; end if;
  v_due := public.data_vencimento_mensal(
    v_base,
    (v_effective -> 'vencimento' ->> 'diaBase')::integer,
    1
  );
  insert into public.contas_receber(
    polo_id, descricao, valor, data_vencimento, status, categoria,
    cliente_id, matricula_id, turma_id, tipo_lancamento,
    parcela_numero, origem_cronograma_id
  ) values (
    v_class.polo_id,
    'Rematrícula - Ciclo ' || v_cycle || ' - ' || v_class.nome,
    v_value,
    v_due,
    case when v_due < (pg_catalog.timezone('America/Maceio', now()))::date then 'VENCIDO' else 'PENDENTE' end,
    'MENSALIDADE', v_enrollment.aluno_id, v_enrollment.id, v_enrollment.turma_id,
    'REMATRICULA', 0, 'ciclo-' || v_cycle || '-rematricula'
  )
  on conflict (matricula_id, origem_cronograma_id)
    where matricula_id is not null and origem_cronograma_id is not null
  do nothing
  returning * into v_title;
  if v_title.id is null then
    select * into v_title from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and receivable.origem_cronograma_id = 'ciclo-' || v_cycle || '-rematricula'
    limit 1;
  end if;
  return v_title;
end;
$function$;

revoke all on function public.gerar_rematricula_apos_parcelas(uuid)
  from public, anon, authenticated;
grant execute on function public.gerar_rematricula_apos_parcelas(uuid) to service_role;

create or replace function internal_academic.assert_expected_technical_effective_rule(
  p_matricula_id uuid,
  p_expected_turma_revisao integer,
  p_expected_turma_fingerprint text,
  p_expected_override_revisao integer,
  p_expected_override_fingerprint text,
  p_expected_effective_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rule jsonb := internal_academic.technical_financial_effective_rule(p_matricula_id);
begin
  if p_expected_turma_revisao is null or coalesce(p_expected_turma_fingerprint, '') = ''
    or p_expected_override_revisao is null or coalesce(p_expected_override_fingerprint, '') = ''
    or coalesce(p_expected_effective_fingerprint, '') = ''
    or (v_rule -> 'identidade' ->> 'turmaRevisao')::integer <> p_expected_turma_revisao
    or v_rule -> 'identidade' ->> 'turmaFingerprint' <> p_expected_turma_fingerprint
    or (v_rule -> 'identidade' ->> 'overrideRevisao')::integer <> p_expected_override_revisao
    or v_rule -> 'identidade' ->> 'overrideFingerprint' <> p_expected_override_fingerprint
    or v_rule -> 'identidade' ->> 'efetivaFingerprint' <> p_expected_effective_fingerprint
  then
    raise exception 'A regra efetiva da matrícula mudou. Recarregue e confirme novamente.'
      using errcode = '40001';
  end if;
  return v_rule;
end;
$function$;

revoke all on function internal_academic.assert_expected_technical_effective_rule(
  uuid, integer, text, integer, text, text
) from public, anon, authenticated, service_role;

create or replace function internal_academic.activate_technical_financial_enrollment(
  p_matricula_id uuid,
  p_mode text,
  p_activate_at timestamptz default null,
  p_require_matching_scheduled_rule boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_class public.turmas%rowtype;
  v_enrollment public.matriculas%rowtype;
  v_config public.matriculas_tecnicas_financeiro_config%rowtype;
  v_effective jsonb;
  v_title public.contas_receber%rowtype;
  v_floor date;
  v_due date;
  v_has_matricula boolean;
  v_inserted integer;
begin
  select enrollment.turma_id into v_enrollment.turma_id
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  select class.* into v_class from public.turmas class
  where class.id = v_enrollment.turma_id for update;
  if upper(coalesce(v_class.status, '')) not in ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO') then
    raise exception 'O estado da turma não permite ativar ou agendar o financeiro.' using errcode = '22023';
  end if;
  select enrollment.* into v_enrollment from public.matriculas enrollment
  where enrollment.id = p_matricula_id for update;
  select config.* into v_config from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = p_matricula_id for update;
  if not found then raise exception 'Financeiro técnico não configurado.' using errcode = '22023'; end if;
  v_effective := internal_academic.technical_financial_effective_rule(p_matricula_id);
  if upper(coalesce(v_enrollment.fluxo_operacional, 'REGULAR')) = 'IMPLANTACAO'
    or exists (
      select 1 from public.matricula_liberacoes_diario release
      where release.matricula_id = p_matricula_id and release.revogado_em is null
    )
  then raise exception 'Matrícula em implantação não pode ativar financeiro.' using errcode = '22023'; end if;
  if upper(coalesce(v_enrollment.status, '')) not in ('PENDENTE', 'ATIVO') then
    raise exception 'O estado acadêmico da matrícula não permite ativar financeiro.' using errcode = '22023';
  end if;
  if p_require_matching_scheduled_rule
    and v_config.regra_efetiva_fingerprint is distinct from (v_effective -> 'identidade' ->> 'efetivaFingerprint')
  then
    update public.matriculas_tecnicas_financeiro_config config set
      status_financeiro = 'PENDENTE', ativar_em = null,
      last_error = 'A regra efetiva mudou; é necessária nova confirmação.'
    where config.matricula_id = p_matricula_id;
    return internal_academic.technical_financial_row(p_matricula_id);
  end if;
  if v_config.status_financeiro in ('GERADA', 'ATIVADA') then
    if upper(coalesce(p_mode, '')) = 'AGORA' then
      return internal_academic.technical_financial_row(p_matricula_id);
    end if;
    raise exception 'Financeiro já ativado não pode voltar para agendado.' using errcode = '22023';
  end if;

  if upper(coalesce(p_mode, '')) = 'AGENDADA' then
    if p_activate_at is null or p_activate_at <= now() then
      raise exception 'A ativação agendada deve usar data e hora futuras.' using errcode = '22023';
    end if;
    v_floor := (pg_catalog.timezone('America/Maceio', p_activate_at))::date;
    v_due := internal_academic.normalize_technical_first_due(v_config.primeiro_vencimento, v_floor);
    update public.matriculas_tecnicas_financeiro_config config set
      status_financeiro = 'AGENDADA', primeiro_vencimento = v_due,
      ativar_em = p_activate_at,
      regra_revisao = (v_effective -> 'identidade' ->> 'turmaRevisao')::integer,
      regra_fingerprint = v_effective -> 'identidade' ->> 'turmaFingerprint',
      override_revisao = (v_effective -> 'identidade' ->> 'overrideRevisao')::integer,
      override_fingerprint = v_effective -> 'identidade' ->> 'overrideFingerprint',
      regra_efetiva_fingerprint = v_effective -> 'identidade' ->> 'efetivaFingerprint',
      titulo_matricula_id = null, last_error = null
    where config.matricula_id = p_matricula_id;
    return internal_academic.technical_financial_row(p_matricula_id);
  elsif upper(coalesce(p_mode, '')) <> 'AGORA' then
    raise exception 'Modo de ativação inválido.' using errcode = '22023';
  end if;
  if p_activate_at is not null then raise exception 'AGORA não aceita agendamento.' using errcode = '22023'; end if;

  v_floor := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_due := internal_academic.normalize_technical_first_due(v_config.primeiro_vencimento, v_floor);
  v_has_matricula := (v_effective -> 'cobranca' -> 'matricula' ->> 'habilitada')::boolean;
  perform internal_academic.authorize_matricula_control_update(p_matricula_id);
  update public.matriculas enrollment set
    data_primeiro_vencimento_financeiro = v_due,
    financeiro_herdado = false,
    gerar_cobranca_inicial = v_has_matricula,
    gerar_cobranca_futura = true,
    sincronizar_asaas = false
  where enrollment.id = p_matricula_id;

  if v_has_matricula then
    v_title := internal_academic.generate_technical_enrollment_fee(p_matricula_id);
    if v_title.id is null then
      raise exception 'Não foi possível gerar a matrícula habilitada.' using errcode = 'P0001';
    end if;
    update public.matriculas_tecnicas_financeiro_config config set
      status_financeiro = 'GERADA', titulo_matricula_id = v_title.id
    where config.matricula_id = p_matricula_id;
  else
    v_inserted := public.gerar_parcelas_matricula(p_matricula_id);
    if v_inserted <= 0 then
      raise exception 'Não foi possível gerar o primeiro ciclo de mensalidades.' using errcode = 'P0001';
    end if;
    update public.matriculas_tecnicas_financeiro_config config set
      status_financeiro = 'ATIVADA', titulo_matricula_id = null
    where config.matricula_id = p_matricula_id;
  end if;
  update public.matriculas_tecnicas_financeiro_config config set
    primeiro_vencimento = v_due, ativar_em = null,
    regra_revisao = (v_effective -> 'identidade' ->> 'turmaRevisao')::integer,
    regra_fingerprint = v_effective -> 'identidade' ->> 'turmaFingerprint',
    override_revisao = (v_effective -> 'identidade' ->> 'overrideRevisao')::integer,
    override_fingerprint = v_effective -> 'identidade' ->> 'overrideFingerprint',
    regra_efetiva_fingerprint = v_effective -> 'identidade' ->> 'efetivaFingerprint',
    last_error = null, tentativas = config.tentativas + 1
  where config.matricula_id = p_matricula_id;
  perform public.registrar_turma_financeiro_auditoria(
    p_matricula_id,
    'MATRICULA_TECNICA_FINANCEIRO_ATIVADO',
    v_effective,
    case when v_has_matricula
      then 'Matrícula local gerada; overrides preservados.'
      else 'Sem matrícula: primeiro ciclo mensal gerado, sem título fictício.' end
  );
  return internal_academic.technical_financial_row(p_matricula_id);
end;
$function$;

revoke all on function internal_academic.activate_technical_financial_enrollment(
  uuid, text, timestamptz, boolean
) from public, anon, authenticated, service_role;

create or replace function public.ativar_financeiro_matricula_tecnica_flexivel_secure(
  p_matricula_id uuid,
  p_modo text,
  p_request_id uuid,
  p_ativar_em timestamptz,
  p_expected_turma_revisao integer,
  p_expected_turma_fingerprint text,
  p_expected_override_revisao integer,
  p_expected_override_fingerprint text,
  p_expected_efetiva_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_rule jsonb;
  v_row jsonb;
  v_payload_hash text;
  v_existing record;
  v_response jsonb;
begin
  if p_request_id is null then raise exception 'requestId é obrigatório.' using errcode = '22023'; end if;
  select enrollment.turma_id into v_turma_id from public.matriculas enrollment
  where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(v_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501'; end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'matriculaId', p_matricula_id, 'modo', upper(coalesce(p_modo, '')),
      'ativarEm', p_ativar_em, 'turmaRevisao', p_expected_turma_revisao,
      'turmaFingerprint', p_expected_turma_fingerprint,
      'overrideRevisao', p_expected_override_revisao,
      'overrideFingerprint', p_expected_override_fingerprint,
      'efetivaFingerprint', p_expected_efetiva_fingerprint
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('technical-finance-request:' || p_request_id::text, 0));
  select request.operation, request.actor_id, request.payload_hash, request.response into v_existing
  from internal_academic.technical_financial_requests request where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'ATIVACAO_INDIVIDUAL_FLEXIVEL'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023'; end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;
  perform 1 from public.turmas class where class.id = v_turma_id for update;
  perform 1 from public.matriculas enrollment where enrollment.id = p_matricula_id for update;
  perform 1 from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = p_matricula_id for update;
  v_rule := internal_academic.assert_expected_technical_effective_rule(
    p_matricula_id, p_expected_turma_revisao, p_expected_turma_fingerprint,
    p_expected_override_revisao, p_expected_override_fingerprint,
    p_expected_efetiva_fingerprint
  );
  perform set_config('app.technical_financial_request_id', p_request_id::text, true);
  perform set_config('app.technical_financial_origin', 'MUTATION', true);
  v_row := internal_academic.activate_technical_financial_enrollment(
    p_matricula_id, upper(p_modo), p_ativar_em, false
  );
  v_response := jsonb_build_object(
    'operacao', 'ATIVACAO_INDIVIDUAL_FLEXIVEL', 'modo', upper(p_modo),
    'requestId', p_request_id, 'replayed', false, 'matricula', v_row,
    'regraAplicada', v_rule,
    'workspace', public.obter_financeiro_matricula_tecnica_workspace_secure(v_turma_id, null)
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (p_request_id, 'ATIVACAO_INDIVIDUAL_FLEXIVEL', auth.uid(), v_payload_hash, v_response);
  return v_response;
end;
$function$;

create or replace function public.ativar_financeiro_matriculas_tecnicas_flexivel_lote_secure(
  p_turma_id uuid,
  p_matricula_ids uuid[],
  p_modo text,
  p_request_id uuid,
  p_ativar_em timestamptz,
  p_expected_turma_revisao integer,
  p_expected_turma_fingerprint text,
  p_expected_regras jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_expected jsonb;
  v_row jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count integer;
  v_payload_hash text;
  v_existing record;
  v_response jsonb;
begin
  if p_request_id is null then raise exception 'requestId é obrigatório.' using errcode = '22023'; end if;
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501'; end if;
  if p_matricula_ids is null or cardinality(p_matricula_ids) not between 1 and 100
    or jsonb_typeof(p_expected_regras) <> 'array'
  then raise exception 'Lote flexível inválido.' using errcode = '22023'; end if;
  select count(distinct item) into v_count from unnest(p_matricula_ids) item;
  if v_count <> cardinality(p_matricula_ids)
    or jsonb_array_length(p_expected_regras) <> cardinality(p_matricula_ids)
  then raise exception 'Lote contém identidade ausente ou duplicada.' using errcode = '22023'; end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'turmaId', p_turma_id,
      'matriculaIds', (select jsonb_agg(item order by item) from unnest(p_matricula_ids) item),
      'modo', upper(coalesce(p_modo, '')), 'ativarEm', p_ativar_em,
      'turmaRevisao', p_expected_turma_revisao,
      'turmaFingerprint', p_expected_turma_fingerprint,
      'regras', p_expected_regras
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('technical-finance-request:' || p_request_id::text, 0));
  select request.operation, request.actor_id, request.payload_hash, request.response into v_existing
  from internal_academic.technical_financial_requests request where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'ATIVACAO_LOTE_FLEXIVEL'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023'; end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;
  perform 1 from public.turmas class where class.id = p_turma_id for update;
  if (internal_academic.technical_financial_rule(p_turma_id) -> 'identidade' ->> 'turmaRevisao')::integer
      <> p_expected_turma_revisao
    or internal_academic.technical_financial_rule(p_turma_id) -> 'identidade' ->> 'turmaFingerprint'
      <> p_expected_turma_fingerprint
  then raise exception 'A regra da turma mudou. Recarregue o lote.' using errcode = '40001'; end if;
  select count(*) into v_count from public.matriculas enrollment
  join public.matriculas_tecnicas_financeiro_config config on config.matricula_id = enrollment.id
  where enrollment.id = any(p_matricula_ids) and enrollment.turma_id = p_turma_id;
  if v_count <> cardinality(p_matricula_ids) then
    raise exception 'Lote contém matrícula fora da turma ou sem configuração.' using errcode = '22023';
  end if;

  for v_id in select item from unnest(p_matricula_ids) item order by item loop
    perform 1 from public.matriculas enrollment where enrollment.id = v_id for update;
    perform 1 from public.matriculas_tecnicas_financeiro_config config
      where config.matricula_id = v_id for update;
    select expected into v_expected
    from jsonb_array_elements(p_expected_regras) expected
    where expected ->> 'matriculaId' = v_id::text;
    if v_expected is null then raise exception 'Identidade ausente para matrícula %.', v_id using errcode = '22023'; end if;
    perform internal_academic.assert_expected_technical_effective_rule(
      v_id,
      p_expected_turma_revisao,
      p_expected_turma_fingerprint,
      (v_expected ->> 'overrideRevisao')::integer,
      v_expected ->> 'overrideFingerprint',
      v_expected ->> 'efetivaFingerprint'
    );
  end loop;
  perform set_config('app.technical_financial_request_id', p_request_id::text, true);
  perform set_config('app.technical_financial_origin', 'MUTATION', true);
  for v_id in select item from unnest(p_matricula_ids) item order by item loop
    v_row := internal_academic.activate_technical_financial_enrollment(
      v_id, upper(p_modo), p_ativar_em, false
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'matriculaId', v_id,
      'status', v_row -> 'financeiro' ->> 'status',
      'situacaoFinanceira', v_row ->> 'situacaoFinanceira',
      'titulo', v_row -> 'financeiro' -> 'titulo'
    ));
  end loop;
  v_response := jsonb_build_object(
    'operacao', 'ATIVACAO_LOTE_FLEXIVEL', 'modo', upper(p_modo),
    'requestId', p_request_id, 'replayed', false,
    'turmaId', p_turma_id, 'total', jsonb_array_length(v_results),
    'resultados', v_results,
    'workspace', public.obter_financeiro_matricula_tecnica_workspace_secure(p_turma_id, null)
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (p_request_id, 'ATIVACAO_LOTE_FLEXIVEL', auth.uid(), v_payload_hash, v_response);
  return v_response;
end;
$function$;

-- O prelink legado da migration anterior copiava a regra da turma para as
-- colunas individuais. O trigger normaliza somente novas configurações: cópia
-- idêntica vira herança (NULL); diferença real vira override explícito.
create or replace function internal_academic.normalize_new_technical_financial_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_is_copy boolean;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment where enrollment.id = new.matricula_id;
  select class.* into v_class from public.turmas class where class.id = new.turma_id;
  if v_enrollment.id is null or v_class.id is null then return new; end if;
  v_is_copy :=
    (v_enrollment.valor_matricula_individual is null or v_enrollment.valor_matricula_individual = v_class.valor_matricula)
    and (v_enrollment.valor_rematricula_individual is null or v_enrollment.valor_rematricula_individual = v_class.valor_rematricula)
    and (v_enrollment.valor_parcela_individual is null or v_enrollment.valor_parcela_individual = v_class.valor_parcela)
    and (v_enrollment.dia_vencimento_individual is null or v_enrollment.dia_vencimento_individual = v_class.dia_vencimento_padrao)
    and (v_enrollment.desconto_pontualidade_individual is null or v_enrollment.desconto_pontualidade_individual = v_class.desconto_pontualidade)
    and (v_enrollment.juros_atraso_individual is null or v_enrollment.juros_atraso_individual = v_class.juros_atraso)
    and (v_enrollment.multa_atraso_percentual_individual is null or v_enrollment.multa_atraso_percentual_individual = v_class.multa_atraso_percentual);
  if v_is_copy then
    perform internal_academic.authorize_matricula_control_update(new.matricula_id);
    update public.matriculas enrollment set
      valor_matricula_individual = null,
      valor_rematricula_individual = null,
      valor_parcela_individual = null,
      dia_vencimento_individual = null,
      desconto_pontualidade_individual = null,
      juros_atraso_individual = null,
      multa_atraso_individual = null,
      multa_atraso_percentual_individual = null
    where enrollment.id = new.matricula_id;
    new.override_ativo := false;
    new.override_revisao := 0;
  else
    new.override_ativo := true;
    new.override_revisao := greatest(coalesce(new.override_revisao, 0), 1);
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.normalize_new_technical_financial_override()
  from public, anon, authenticated, service_role;

drop trigger if exists normalize_new_technical_financial_override
  on public.matriculas_tecnicas_financeiro_config;
create trigger normalize_new_technical_financial_override
before insert on public.matriculas_tecnicas_financeiro_config
for each row execute function internal_academic.normalize_new_technical_financial_override();

-- Metadado conservador para registros anteriores: só marca override quando há
-- divergência demonstrável. Não altera os valores individuais nem recebíveis.
update public.matriculas_tecnicas_financeiro_config config
set override_ativo = true,
    override_revisao = greatest(config.override_revisao, 1)
from public.matriculas enrollment, public.turmas class
where enrollment.id = config.matricula_id
  and class.id = enrollment.turma_id
  and (
    (enrollment.valor_matricula_individual is not null and enrollment.valor_matricula_individual is distinct from class.valor_matricula)
    or (enrollment.valor_rematricula_individual is not null and enrollment.valor_rematricula_individual is distinct from class.valor_rematricula)
    or (enrollment.valor_parcela_individual is not null and enrollment.valor_parcela_individual is distinct from class.valor_parcela)
    or (enrollment.dia_vencimento_individual is not null and enrollment.dia_vencimento_individual is distinct from class.dia_vencimento_padrao)
    or (enrollment.desconto_pontualidade_individual is not null and enrollment.desconto_pontualidade_individual is distinct from class.desconto_pontualidade)
    or (enrollment.juros_atraso_individual is not null and enrollment.juros_atraso_individual is distinct from class.juros_atraso)
    or (enrollment.multa_atraso_percentual_individual is not null and enrollment.multa_atraso_percentual_individual is distinct from class.multa_atraso_percentual)
  );

-- Congela a política monetária dos títulos técnicos preexistentes sem alterar
-- valor, vencimento, status ou qualquer histórico de pagamento. No projeto
-- atual o conjunto é vazio, mas o backfill mantém instalações antigas seguras.
update public.contas_receber receivable
set regra_financeira_tecnica_snapshot =
  internal_academic.build_technical_receivable_policy_snapshot(
    receivable.matricula_id,
    receivable.tipo_lancamento,
    receivable.descricao,
    receivable.valor,
    true
  )
from public.matriculas enrollment
join public.turmas class on class.id = enrollment.turma_id
join public.cursos course on course.id = class.curso_id
where enrollment.id = receivable.matricula_id
  and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO')
  and receivable.regra_financeira_tecnica_snapshot is null;

create or replace function internal_academic.guard_technical_receivable_policy_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot jsonb;
begin
  if tg_op = 'INSERT' then
    v_snapshot := internal_academic.build_technical_receivable_policy_snapshot(
      new.matricula_id,
      new.tipo_lancamento,
      new.descricao,
      new.valor,
      false
    );
    if v_snapshot is not null then
      new.regra_financeira_tecnica_snapshot := v_snapshot;
    end if;
    return new;
  end if;

  if old.regra_financeira_tecnica_snapshot is not null then
    if new.regra_financeira_tecnica_snapshot is distinct from old.regra_financeira_tecnica_snapshot
      or new.valor is distinct from old.valor
      or new.matricula_id is distinct from old.matricula_id
      or new.tipo_lancamento is distinct from old.tipo_lancamento
    then
      raise exception 'A política e o valor de um título técnico emitido são imutáveis.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  v_snapshot := internal_academic.build_technical_receivable_policy_snapshot(
    new.matricula_id,
    new.tipo_lancamento,
    new.descricao,
    new.valor,
    false
  );
  if v_snapshot is not null then
    new.regra_financeira_tecnica_snapshot := v_snapshot;
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_technical_receivable_policy_snapshot()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_technical_receivable_policy_snapshot
  on public.contas_receber;
create trigger guard_technical_receivable_policy_snapshot
before insert or update of
  regra_financeira_tecnica_snapshot, valor, matricula_id, tipo_lancamento
on public.contas_receber
for each row execute function internal_academic.guard_technical_receivable_policy_snapshot();

-- Reutiliza o Broadcast privado já aplicado: topic
-- `financeiro-matricula:turma:{turma_uuid}` e eventos correlacionáveis
-- `rule-changed`, `config-changed`, `title-changed`.
create or replace function internal_academic.broadcast_technical_financial_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_matricula_id uuid := coalesce(new.matricula_id, old.matricula_id);
  v_turma_id uuid;
begin
  if v_matricula_id is null then return coalesce(new, old); end if;
  select config.turma_id into v_turma_id
  from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = v_matricula_id;
  if v_turma_id is not null then
    perform internal_academic.send_technical_financial_changed(
      'title-changed', v_turma_id, v_matricula_id
    );
  end if;
  return coalesce(new, old);
end;
$function$;

revoke all on function internal_academic.broadcast_technical_financial_title()
  from public, anon, authenticated, service_role;

-- O portal preserva o mesmo contrato JSON/visual, mas valores derivados usam a
-- política congelada no título. O fallback legado existe somente para contas
-- não técnicas ou registros antigos ainda sem snapshot.
create or replace function public.get_aluno_financeiro_portal_secure(
  p_aluno_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_rows jsonb;
begin
  if p_aluno_id is null then
    raise exception 'Aluno obrigatorio para consultar o extrato financeiro.'
      using errcode = '22004';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      public.current_aluno_id() is null
      or p_aluno_id is distinct from public.current_aluno_id()
    )
  then
    raise exception 'Extrato financeiro do aluno nao autorizado.'
      using errcode = '42501';
  end if;

  with source_rows as (
    select
      receivable.*,
      enrollment.desconto_pontualidade_individual,
      enrollment.juros_atraso_individual,
      enrollment.multa_atraso_individual,
      class.id as class_id,
      class.curso_id as class_course_id,
      class.nome as class_name,
      class.valor_parcela as class_installment_value,
      class.qtd_parcelas as class_installment_count,
      class.desconto_pontualidade,
      class.juros_atraso,
      class.multa_atraso,
      class.aplicar_desconto_matricula,
      class.aplicar_multa_juros_matricula,
      class.aplicar_desconto_mensalidade,
      class.aplicar_multa_juros_mensalidade,
      class.aplicar_desconto_rematricula,
      class.aplicar_multa_juros_rematricula,
      course.id as course_id,
      course.nome as course_name,
      upper(coalesce(course.modalidade, '')) as course_modality,
      student.nome as student_name,
      student.cpf_cnpj as student_document
    from public.contas_receber receivable
    left join public.matriculas enrollment on enrollment.id = receivable.matricula_id
    left join public.turmas class on class.id = receivable.turma_id
    left join public.cursos course on course.id = class.curso_id
    left join public.parceiros student on student.id = receivable.cliente_id
    where receivable.cliente_id = p_aluno_id
  ),
  classified as (
    select
      source_rows.*,
      (
        upper(coalesce(tipo_lancamento, '')) = 'MATRICULA'
        or lower(coalesce(descricao, '')) like '%matricula%'
        or lower(coalesce(descricao, '')) like '%matrícula%'
      ) as is_enrollment,
      (
        upper(coalesce(tipo_lancamento, '')) = 'REMATRICULA'
        or lower(coalesce(descricao, '')) like '%rematricula%'
        or lower(coalesce(descricao, '')) like '%rematrícula%'
      ) as is_reenrollment,
      (
        upper(coalesce(tipo_lancamento, '')) = 'PARCELA'
        or lower(coalesce(descricao, '')) like '%mensalidade%'
      ) as is_installment,
      (
        status = 'VENCIDO'
        or (status = 'PENDENTE' and data_vencimento < current_date)
      ) as is_overdue,
      (
        lower(coalesce(gateway_provider, '')) = 'banese_card'
        and upper(coalesce(gateway_payment_method, '')) = 'BOLETO'
        and length(regexp_replace(coalesce(gateway_boleto_linha_digitavel, ''), '\D', '', 'g')) = 47
        and length(regexp_replace(coalesce(gateway_boleto_codigo_barras, ''), '\D', '', 'g')) = 44
      ) as has_registered_banese_boleto
    from source_rows
  ),
  policies as (
    select
      classified.*,
      case
        when regra_financeira_tecnica_snapshot is not null
          then coalesce((regra_financeira_tecnica_snapshot ->> 'aplicarDesconto')::boolean, false)
        else course_modality <> 'EAD' and (
          (is_enrollment and aplicar_desconto_matricula is true)
          or (is_installment and aplicar_desconto_mensalidade is not false)
          or (is_reenrollment and aplicar_desconto_rematricula is not false)
        )
      end as can_discount,
      case
        when regra_financeira_tecnica_snapshot is not null
          then coalesce((regra_financeira_tecnica_snapshot ->> 'aplicarMultaJuros')::boolean, false)
        else course_modality <> 'EAD' and (
          (is_enrollment and aplicar_multa_juros_matricula is not false)
          or (is_installment and aplicar_multa_juros_mensalidade is not false)
          or (is_reenrollment and aplicar_multa_juros_rematricula is not false)
        )
      end as can_late_charge,
      case
        when regra_financeira_tecnica_snapshot is not null
          then greatest(0, coalesce((regra_financeira_tecnica_snapshot ->> 'descontoPontualidade')::numeric, 0))
        else greatest(0, coalesce(desconto_pontualidade_individual, desconto_pontualidade, 0))
      end as discount_policy_value,
      case
        when regra_financeira_tecnica_snapshot is not null
          then greatest(0, coalesce((regra_financeira_tecnica_snapshot ->> 'jurosAtrasoPercentual')::numeric, 0))
        else greatest(0, coalesce(juros_atraso_individual, juros_atraso, 0))
      end as interest_policy_percent,
      case
        when regra_financeira_tecnica_snapshot is not null
          then greatest(0, coalesce((regra_financeira_tecnica_snapshot ->> 'multaAtrasoValor')::numeric, 0))
        else greatest(0, coalesce(multa_atraso_individual, multa_atraso, 0))
      end as late_fee_policy_value
    from classified
  ),
  amounts as (
    select
      policies.*,
      case
        when has_registered_banese_boleto or status = 'PAGO' or not can_discount then 0::numeric
        else least(coalesce(valor, 0), discount_policy_value)
      end as punctual_discount,
      case
        when has_registered_banese_boleto or not is_overdue or not can_late_charge then 0::numeric
        else round(
          coalesce(valor, 0)
          * interest_policy_percent
          / 30.0
          / 100.0
          * greatest(current_date - data_vencimento, 0),
          2
        )
      end as interest_value,
      case
        when has_registered_banese_boleto or not is_overdue or not can_late_charge then 0::numeric
        else late_fee_policy_value
      end as late_fee_value
    from policies
  ),
  presented as (
    select
      amounts.*,
      round(greatest(0, coalesce(valor, 0) - punctual_discount), 2) as total_until_due,
      round(coalesce(valor, 0) + interest_value + late_fee_value, 2) as total_with_late
    from amounts
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'cliente_id', cliente_id,
        'matricula_id', matricula_id,
        'turma_id', turma_id,
        'descricao', descricao,
        'categoria', categoria,
        'tipo_lancamento', tipo_lancamento,
        'parcela_numero', parcela_numero,
        'valor', valor,
        'valor_pago', valor_pago,
        'data_vencimento', data_vencimento,
        'data_pagamento', data_pagamento,
        'status', status,
        'forma_pagamento', forma_pagamento,
        'origem_pagamento', origem_pagamento,
        'asaas_invoice_url', asaas_invoice_url,
        'asaas_status', asaas_status,
        'asaas_transaction_receipt_url', asaas_transaction_receipt_url,
        'gateway_provider', gateway_provider,
        'gateway_environment', gateway_environment,
        'gateway_payment_method', gateway_payment_method,
        'gateway_payment_id', gateway_payment_id,
        'gateway_status', gateway_status,
        'gateway_bank_slip_url', gateway_bank_slip_url,
        'gateway_invoice_url', gateway_invoice_url,
        'gateway_boleto_linha_digitavel', gateway_boleto_linha_digitavel,
        'gateway_boleto_codigo_barras', gateway_boleto_codigo_barras,
        'gateway_boleto_nosso_numero', gateway_boleto_nosso_numero,
        'turmas', case
          when class_id is null then null
          else jsonb_build_object(
            'id', class_id,
            'curso_id', class_course_id,
            'nome', class_name,
            'valor_parcela', class_installment_value,
            'qtd_parcelas', class_installment_count,
            'cursos', case
              when course_id is null then null
              else jsonb_build_object(
                'id', course_id,
                'modalidade', course_modality,
                'nome', course_name
              )
            end
          )
        end,
        'parceiros', jsonb_build_object(
          'nome', student_name,
          'cpf_cnpj', student_document
        ),
        'financial_summary', jsonb_build_object(
          'baseValue', coalesce(valor, 0),
          'paidValue', coalesce(valor_pago, valor, 0),
          'punctualDiscount', punctual_discount,
          'totalUntilDue', case when has_registered_banese_boleto then coalesce(valor, 0) else total_until_due end,
          'interestPercent', case
            when has_registered_banese_boleto or not can_late_charge then 0
            else interest_policy_percent
          end,
          'interestValue', interest_value,
          'lateFeeValue', late_fee_value,
          'totalWithLate', case when has_registered_banese_boleto then coalesce(valor, 0) else total_with_late end,
          'highlightValue', case
            when status = 'PAGO' then coalesce(valor_pago, valor, 0)
            when has_registered_banese_boleto then coalesce(valor, 0)
            when is_overdue then total_with_late
            else total_until_due
          end,
          'highlightLabel', case
            when status = 'PAGO' then 'Valor pago'
            when has_registered_banese_boleto then 'Valor do boleto'
            when is_overdue then 'Total em atraso'
            else 'Total até o vencimento'
          end,
          'hasDiscount', punctual_discount > 0,
          'hasLateCharge', interest_value > 0 or late_fee_value > 0,
          'canLateCharge', can_late_charge and not has_registered_banese_boleto
        )
      )
      order by data_vencimento, id
    ),
    '[]'::jsonb
  ) into v_rows
  from presented;

  return jsonb_build_object(
    'rows', v_rows,
    'summary', (
      with elements as (
        select value as row_data
        from jsonb_array_elements(v_rows)
      ),
      open_by_modality as (
        select
          coalesce(nullif(row_data #>> '{turmas,cursos,modalidade}', ''), 'OUTROS') as modality,
          count(*)::integer as item_count,
          coalesce(sum((row_data #>> '{financial_summary,highlightValue}')::numeric), 0) as total_value
        from elements
        where row_data ->> 'status' in ('PENDENTE', 'VENCIDO')
        group by 1
      )
      select jsonb_build_object(
        'totalPaid', coalesce(sum(
          case
            when row_data ->> 'status' = 'PAGO'
              then (row_data #>> '{financial_summary,paidValue}')::numeric
            else 0
          end
        ), 0),
        'totalPending', coalesce(sum(
          case
            when row_data ->> 'status' in ('PENDENTE', 'VENCIDO')
              then (row_data #>> '{financial_summary,highlightValue}')::numeric
            else 0
          end
        ), 0),
        'openByModality', coalesce((
          select jsonb_agg(jsonb_build_object(
            'modality', modality,
            'count', item_count,
            'total', total_value
          ) order by modality)
          from open_by_modality
        ), '[]'::jsonb)
      )
      from elements
    )
  );
end;
$function$;

-- As assinaturas anteriores validavam somente a identidade da regra da turma.
-- Com overrides individuais versionados, mantê-las executáveis permitiria
-- ignorar uma alteração concorrente do aluno. O worker agendado usa o helper
-- interno diretamente e não depende destas RPCs legadas.
revoke all on function public.ativar_financeiro_matricula_tecnica_secure(
  uuid, text, uuid, timestamptz, integer, text
) from public, anon, authenticated, service_role;
revoke all on function public.ativar_financeiro_matriculas_tecnicas_lote_secure(
  uuid, uuid[], text, uuid, timestamptz, integer, text
) from public, anon, authenticated, service_role;

revoke all on function public.obter_regra_financeira_turma_tecnica_secure(uuid)
  from public, anon;
revoke all on function public.prever_regra_financeira_turma_tecnica_secure(uuid, jsonb)
  from public, anon;
revoke all on function public.salvar_regra_financeira_turma_tecnica_secure(
  uuid, uuid, integer, text, jsonb
) from public, anon;
revoke all on function public.salvar_override_financeiro_matricula_tecnica_secure(
  uuid, uuid, integer, text, integer, text, jsonb
) from public, anon;
revoke all on function public.remover_override_financeiro_matricula_tecnica_secure(
  uuid, uuid, integer, text, integer, text
) from public, anon;
revoke all on function public.obter_financeiro_matricula_tecnica_workspace_secure(uuid, uuid)
  from public, anon;
revoke all on function public.ativar_financeiro_matricula_tecnica_flexivel_secure(
  uuid, text, uuid, timestamptz, integer, text, integer, text, text
) from public, anon;
revoke all on function public.ativar_financeiro_matriculas_tecnicas_flexivel_lote_secure(
  uuid, uuid[], text, uuid, timestamptz, integer, text, jsonb
) from public, anon;
revoke all on function public.get_aluno_financeiro_portal_secure(uuid)
  from public, anon;

grant execute on function public.obter_regra_financeira_turma_tecnica_secure(uuid)
  to authenticated, service_role;
grant execute on function public.prever_regra_financeira_turma_tecnica_secure(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.salvar_regra_financeira_turma_tecnica_secure(
  uuid, uuid, integer, text, jsonb
) to authenticated, service_role;
grant execute on function public.salvar_override_financeiro_matricula_tecnica_secure(
  uuid, uuid, integer, text, integer, text, jsonb
) to authenticated, service_role;
grant execute on function public.remover_override_financeiro_matricula_tecnica_secure(
  uuid, uuid, integer, text, integer, text
) to authenticated, service_role;
grant execute on function public.obter_financeiro_matricula_tecnica_workspace_secure(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.ativar_financeiro_matricula_tecnica_flexivel_secure(
  uuid, text, uuid, timestamptz, integer, text, integer, text, text
) to authenticated, service_role;
grant execute on function public.ativar_financeiro_matriculas_tecnicas_flexivel_lote_secure(
  uuid, uuid[], text, uuid, timestamptz, integer, text, jsonb
) to authenticated, service_role;
grant execute on function public.get_aluno_financeiro_portal_secure(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
