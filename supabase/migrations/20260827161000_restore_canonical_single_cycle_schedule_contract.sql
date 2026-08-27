-- Restaura o contrato canônico de internal_academic.build_flexible_technical_financial_schedule
-- onde cronogramaCiclo projeta o ciclo canônico 1 (Matrícula + Mensalidades 1..N + Rematrícula),
-- preservando a validação de contrato estrita do Portal de Gestão.

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

-- Recalcula o cronograma_financeiro canônico nas turmas
update public.turmas
set nome = nome
where id in (
  select t.id from public.turmas t
  join public.cursos c on c.id = t.curso_id
  where upper(coalesce(c.modalidade, '')) in ('TECNICO', 'TÉCNICO')
);
