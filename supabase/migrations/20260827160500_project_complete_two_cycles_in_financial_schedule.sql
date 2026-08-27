-- Projeta o cronograma financeiro completo com os 2 ciclos técnicos (Mensalidades Ciclo 1 + Rematrícula + Mensalidades Ciclo 2)
-- quando a rematrícula estiver habilitada na turma.

create or replace function internal_academic.build_flexible_technical_financial_schedule(
  p_primeiro_vencimento date,
  p_rule jsonb
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  v_rule jsonb := internal_academic.validate_technical_financial_rule_input(p_rule);
  v_result jsonb := '[]'::jsonb;
  v_numero integer;
  v_offset integer;
  v_due date;
  v_value numeric;
  v_qtd integer;
  v_dia integer;
begin
  if p_primeiro_vencimento is null then
    raise exception 'Primeiro vencimento obrigatório para projetar o ciclo.' using errcode = '22023';
  end if;

  v_qtd := (v_rule ->> 'qtdMensalidades')::integer;
  v_dia := (v_rule ->> 'diaVencimento')::integer;

  -- 1. Matrícula inicial
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

  -- 2. Mensalidades do Ciclo 1 (1 a N)
  v_value := (v_rule ->> 'valorMensalidade')::numeric;
  for v_numero in 1..v_qtd loop
    v_due := public.data_vencimento_mensal(
      p_primeiro_vencimento,
      v_dia,
      v_offset + v_numero - 1
    );
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'mensalidade-' || v_numero,
      'tipo', 'MENSALIDADE', 'numero', v_numero,
      'ciclo', 1,
      'label', 'Mensalidade ' || v_numero || '/' || v_qtd,
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

  -- 3. Se rematrícula habilitada: Rematrícula + Mensalidades do Ciclo 2
  if (v_rule ->> 'cobrarRematricula')::boolean then
    v_value := (v_rule ->> 'valorRematricula')::numeric;
    v_due := public.data_vencimento_mensal(
      p_primeiro_vencimento,
      v_dia,
      v_offset + v_qtd
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

    -- Mensalidades do Ciclo 2 (1 a N do Ciclo 2)
    v_value := (v_rule ->> 'valorMensalidade')::numeric;
    for v_numero in 1..v_qtd loop
      v_due := public.data_vencimento_mensal(
        p_primeiro_vencimento,
        v_dia,
        v_offset + v_qtd + v_numero
      );
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'id', 'ciclo-2-mensalidade-' || v_numero,
        'tipo', 'MENSALIDADE', 'numero', v_numero,
        'ciclo', 2,
        'label', 'Mensalidade ' || v_numero || '/' || v_qtd || ' (Ciclo 2)',
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
  end if;

  return v_result;
end;
$function$;

-- 2. Atualiza a RPC de preview do Gestor
create or replace function public.build_gestao_financial_schedule(
  p_data_inicio date,
  p_valor_matricula numeric,
  p_valor_parcela numeric,
  p_valor_rematricula numeric,
  p_qtd_parcelas integer,
  p_dia_vencimento integer
)
returns jsonb
language plpgsql
immutable
security definer
as $function$
declare
  v_result jsonb := '[]'::jsonb;
  v_index integer;
  v_month_start date;
  v_due_date date;
  v_last_day integer;
begin
  if coalesce(p_valor_matricula, 0) < 0
     or coalesce(p_valor_parcela, 0) < 0
     or coalesce(p_valor_rematricula, 0) < 0
     or coalesce(p_qtd_parcelas, 0) not between 1 and 60
     or coalesce(p_dia_vencimento, 0) not between 1 and 31
  then
    raise exception 'Parâmetros inválidos para gerar o cronograma financeiro.'
      using errcode = '22023';
  end if;

  if coalesce(p_valor_matricula, 0) > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'matr',
      'tipo', 'MATRICULA',
      'label', 'Matrícula Inicial',
      'valor', round(coalesce(p_valor_matricula, 0), 2),
      'dataVencimento', coalesce(to_char(p_data_inicio, 'YYYY-MM-DD'), '')
    ));
  end if;

  for v_index in 1..p_qtd_parcelas loop
    v_month_start := (
      date_trunc('month', p_data_inicio)::date
      + make_interval(months => v_index)
    )::date;
    v_last_day := extract(
      day from (v_month_start + interval '1 month - 1 day')
    )::integer;
    v_due_date := v_month_start + (least(p_dia_vencimento, v_last_day) - 1);

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'parc-' || v_index,
      'tipo', 'PARCELA',
      'label', 'Mensalidade ' || v_index || '/' || p_qtd_parcelas,
      'valor', round(coalesce(p_valor_parcela, 0), 2),
      'numero', v_index,
      'dataVencimento', coalesce(to_char(v_due_date, 'YYYY-MM-DD'), '')
    ));
  end loop;

  if coalesce(p_valor_rematricula, 0) > 0 then
    v_month_start := (
      date_trunc('month', p_data_inicio)::date
      + make_interval(months => p_qtd_parcelas + 1)
    )::date;
    v_last_day := extract(
      day from (v_month_start + interval '1 month - 1 day')
    )::integer;
    v_due_date := v_month_start + (least(p_dia_vencimento, v_last_day) - 1);

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'rem-apos-ciclo',
      'tipo', 'REMATRICULA',
      'label', 'Rematrícula após o ciclo',
      'valor', round(coalesce(p_valor_rematricula, 0), 2),
      'dataVencimento', coalesce(to_char(v_due_date, 'YYYY-MM-DD'), '')
    ));

    for v_index in 1..p_qtd_parcelas loop
      v_month_start := (
        date_trunc('month', p_data_inicio)::date
        + make_interval(months => p_qtd_parcelas + 1 + v_index)
      )::date;
      v_last_day := extract(
        day from (v_month_start + interval '1 month - 1 day')
      )::integer;
      v_due_date := v_month_start + (least(p_dia_vencimento, v_last_day) - 1);

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'id', 'ciclo-2-parc-' || v_index,
        'tipo', 'PARCELA',
        'label', 'Mensalidade ' || v_index || '/' || p_qtd_parcelas || ' (Ciclo 2)',
        'valor', round(coalesce(p_valor_parcela, 0), 2),
        'numero', v_index,
        'dataVencimento', coalesce(to_char(v_due_date, 'YYYY-MM-DD'), '')
      ));
    end loop;
  end if;

  return v_result;
end;
$function$;

-- 3. Atualiza o cronograma_financeiro das turmas técnicas ativas
update public.turmas
set nome = nome
where id in (
  select t.id from public.turmas t
  join public.cursos c on c.id = t.curso_id
  where upper(coalesce(c.modalidade, '')) in ('TECNICO', 'TÉCNICO')
);
