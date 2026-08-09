begin;

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
  v_valor_matricula text;
  v_valor_mensalidade text;
  v_valor_rematricula text;
  v_quantidade integer;
  v_dia integer;
  v_primeiro_vencimento text;
begin
  v_valor_matricula := pg_catalog.to_char(
    (v_rule ->> 'valorMatricula')::numeric,
    'FM999999990.00'
  );
  v_valor_mensalidade := pg_catalog.to_char(
    (v_rule ->> 'valorMensalidade')::numeric,
    'FM999999990.00'
  );
  v_valor_rematricula := pg_catalog.to_char(
    (v_rule ->> 'valorRematricula')::numeric,
    'FM999999990.00'
  );
  v_quantidade := (v_rule ->> 'qtdMensalidades')::integer;
  v_dia := (v_rule ->> 'diaVencimento')::integer;
  v_primeiro_vencimento := pg_catalog.to_char(p_primeiro_vencimento, 'YYYY-MM-DD');

  return jsonb_build_object(
    'identidade', p_identity,
    'origem', p_origin,
    'cobranca', jsonb_build_object(
      'matricula', jsonb_build_object(
        'habilitada', (v_rule ->> 'cobrarMatricula')::boolean,
        'valor', v_valor_matricula
      ),
      'mensalidade', jsonb_build_object(
        'habilitada', true,
        'quantidade', v_quantidade,
        'valor', v_valor_mensalidade
      ),
      'rematricula', jsonb_build_object(
        'habilitada', (v_rule ->> 'cobrarRematricula')::boolean,
        'valor', v_valor_rematricula
      )
    ),
    'vencimento', jsonb_build_object(
      'diaBase', v_dia,
      'primeiroVencimentoSugerido', v_primeiro_vencimento
    ),
    'encargos', jsonb_build_object(
      'descontoPontualidade', pg_catalog.to_char(
        (v_rule ->> 'descontoPontualidade')::numeric,
        'FM999999990.00'
      ),
      'jurosAtrasoPercentual', pg_catalog.to_char(
        (v_rule ->> 'jurosAtrasoPercentual')::numeric,
        'FM999999990.000000'
      ),
      'multaAtrasoPercentual', pg_catalog.to_char(
        (v_rule ->> 'multaAtrasoPercentual')::numeric,
        'FM999999990.000000'
      )
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
      'mensalidadesPorCiclo', v_quantidade
    ),
    'cronogramaCiclo', internal_academic.build_flexible_technical_financial_schedule(
      p_primeiro_vencimento,
      v_rule
    ),
    -- Aliases legados fazem parte do contrato MatriculaTecnicaRegra usado
    -- tanto para a regra da turma quanto para a regra efetiva do aluno.
    'primeiroVencimentoSugerido', v_primeiro_vencimento,
    'valorMatricula', v_valor_matricula,
    'valorMensalidade', v_valor_mensalidade,
    'valorRematricula', v_valor_rematricula,
    'mensalidadesPorCiclo', v_quantidade,
    'diaVencimento', v_dia
  );
end;
$function$;

revoke all on function internal_academic.render_technical_financial_rule(
  jsonb,
  date,
  jsonb,
  text
) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
