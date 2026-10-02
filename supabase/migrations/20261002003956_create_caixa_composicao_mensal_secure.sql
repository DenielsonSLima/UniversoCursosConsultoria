BEGIN;

-- Projeção leve dos mesmos movimentos e componentes usados pelo PDF.
-- O wrapper mensal existente continua sendo a guarda canônica de identidade,
-- módulo e polo. Os cores detalhados não são expostos ao cliente.
CREATE FUNCTION public.get_caixa_composicao_mensal_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT pg_catalog.timezone(
    'America/Maceio', pg_catalog.now()
  )::date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inicio date;
  v_fim date;
  v_statement jsonb;
  v_resumo jsonb;
  v_statement_recebimentos numeric;
  v_statement_despesas numeric;
  v_statement_quantidade_recebimentos integer;
  v_statement_quantidade_despesas integer;
  v_recebimentos_total numeric := 0;
  v_recebimentos_quantidade integer := 0;
  v_recebimentos_base numeric := 0;
  v_recebimentos_juros numeric := 0;
  v_recebimentos_multa numeric := 0;
  v_recebimentos_acrescimo numeric := 0;
  v_recebimentos_desconto numeric := 0;
  v_recebimentos_diferenca numeric := 0;
  v_recebimentos_a_conferir integer := 0;
  v_despesas_total numeric := 0;
  v_despesas_quantidade integer := 0;
  v_despesas_base numeric := 0;
  v_despesas_juros numeric := 0;
  v_despesas_multa numeric := 0;
  v_despesas_acrescimo numeric := 0;
  v_despesas_desconto numeric := 0;
  v_despesas_diferenca numeric := 0;
  v_despesas_a_conferir integer := 0;
BEGIN
  IF p_competencia IS NULL THEN
    RAISE EXCEPTION 'Competência obrigatória para a composição mensal do Caixa.'
      USING ERRCODE = '22023';
  END IF;

  v_inicio := pg_catalog.date_trunc('month', p_competencia)::date;
  v_fim := (v_inicio + pg_catalog.make_interval(months => 1))::date;

  -- Autoriza antes de consultar qualquer core privilegiado e preserva
  -- exatamente o recorte operacional da tela mensal.
  v_statement := public.get_caixa_prestacao_mensal_secure(
    p_polo_id,
    v_inicio,
    1
  );
  v_resumo := v_statement -> 'resumo_competencia';

  IF pg_catalog.jsonb_typeof(v_resumo) IS DISTINCT FROM 'object'
    OR NOT v_resumo ?& ARRAY[
      'entradas_recebidas_brutas',
      'saidas_pagas',
      'quantidade_recebimentos',
      'quantidade_pagamentos'
    ]
  THEN
    RAISE EXCEPTION 'Resumo canônico do Caixa sem campos de conciliação.'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_statement_recebimentos :=
      (v_resumo ->> 'entradas_recebidas_brutas')::numeric;
    v_statement_despesas := (v_resumo ->> 'saidas_pagas')::numeric;
    v_statement_quantidade_recebimentos :=
      (v_resumo ->> 'quantidade_recebimentos')::integer;
    v_statement_quantidade_despesas :=
      (v_resumo ->> 'quantidade_pagamentos')::integer;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Resumo canônico do Caixa com campos de conciliação inválidos.'
        USING ERRCODE = 'P0001';
  END;

  IF v_statement_recebimentos IS NULL
    OR v_statement_despesas IS NULL
    OR v_statement_quantidade_recebimentos IS NULL
    OR v_statement_quantidade_despesas IS NULL
  THEN
    RAISE EXCEPTION 'Resumo canônico do Caixa com conciliação nula.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT
    coalesce(pg_catalog.sum(recebimento.valor_recebido), 0),
    pg_catalog.count(*)::integer,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE recebimento.valor_base IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(recebimento.valor_base), 0)
    END,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE recebimento.juros IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(recebimento.juros), 0)
    END,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE recebimento.multa IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(recebimento.multa), 0)
    END,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE recebimento.acrescimo IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(recebimento.acrescimo), 0)
    END,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE recebimento.desconto IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(recebimento.desconto), 0)
    END,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE recebimento.diferenca_nao_discriminada IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(recebimento.diferenca_nao_discriminada), 0)
    END,
    pg_catalog.count(*) FILTER (
      WHERE recebimento.composicao_status IS NULL
        OR recebimento.valor_base IS NULL
        OR recebimento.juros IS NULL
        OR recebimento.multa IS NULL
        OR recebimento.acrescimo IS NULL
        OR recebimento.desconto IS NULL
        OR recebimento.diferenca_nao_discriminada IS NULL
        OR recebimento.composicao_status IN (
          'NAO_DISCRIMINADA_PELO_GATEWAY',
          'NAO_DISCRIMINADA',
          'PARCIAL_POR_API_PROESC'
        )
        OR (
          recebimento.composicao_status IN (
            'CALCULADO_REGRA_INFORMADA_PROESC',
            'API_E_REGRA_INFORMADA_PROESC'
          )
          AND coalesce(recebimento.diferenca_nao_discriminada, 0) <> 0
        )
    )::integer
  INTO
    v_recebimentos_total,
    v_recebimentos_quantidade,
    v_recebimentos_base,
    v_recebimentos_juros,
    v_recebimentos_multa,
    v_recebimentos_acrescimo,
    v_recebimentos_desconto,
    v_recebimentos_diferenca,
    v_recebimentos_a_conferir
  FROM public.get_caixa_relatorio_recebimentos_core(
    p_polo_id,
    v_inicio,
    v_fim
  ) recebimento;

  SELECT
    coalesce(pg_catalog.sum(despesa.valor_pago), 0),
    pg_catalog.count(*)::integer,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE despesa.valor_base IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(despesa.valor_base), 0)
    END,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE despesa.juros IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(despesa.juros), 0)
    END,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE despesa.multa IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(despesa.multa), 0)
    END,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE despesa.acrescimo IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(despesa.acrescimo), 0)
    END,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE despesa.desconto IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(despesa.desconto), 0)
    END,
    CASE
      WHEN pg_catalog.count(*) = 0 THEN 0::numeric
      WHEN pg_catalog.count(*) FILTER (
        WHERE despesa.diferenca_nao_discriminada IS NULL
      ) > 0 THEN NULL::numeric
      ELSE coalesce(pg_catalog.sum(despesa.diferenca_nao_discriminada), 0)
    END,
    pg_catalog.count(*) FILTER (
      WHERE despesa.composicao_status IS NULL
        OR despesa.valor_base IS NULL
        OR despesa.juros IS NULL
        OR despesa.multa IS NULL
        OR despesa.acrescimo IS NULL
        OR despesa.desconto IS NULL
        OR despesa.diferenca_nao_discriminada IS NULL
        OR despesa.composicao_status = 'NAO_DISCRIMINADA'
    )::integer
  INTO
    v_despesas_total,
    v_despesas_quantidade,
    v_despesas_base,
    v_despesas_juros,
    v_despesas_multa,
    v_despesas_acrescimo,
    v_despesas_desconto,
    v_despesas_diferenca,
    v_despesas_a_conferir
  FROM public.get_caixa_relatorio_despesas_core(
    p_polo_id,
    v_inicio,
    v_fim
  ) despesa;

  IF pg_catalog.round(v_recebimentos_total, 2)
      IS DISTINCT FROM pg_catalog.round(v_statement_recebimentos, 2)
    OR v_recebimentos_quantidade
      IS DISTINCT FROM v_statement_quantidade_recebimentos
    OR pg_catalog.round(v_despesas_total, 2)
      IS DISTINCT FROM pg_catalog.round(v_statement_despesas, 2)
    OR v_despesas_quantidade
      IS DISTINCT FROM v_statement_quantidade_despesas
  THEN
    RAISE EXCEPTION
      'A composição mensal diverge do resumo canônico do Caixa.'
      USING ERRCODE = 'P0001';
  END IF;

  IF (
      v_recebimentos_base IS NOT NULL
      AND v_recebimentos_juros IS NOT NULL
      AND v_recebimentos_multa IS NOT NULL
      AND v_recebimentos_acrescimo IS NOT NULL
      AND v_recebimentos_desconto IS NOT NULL
      AND v_recebimentos_diferenca IS NOT NULL
      AND pg_catalog.abs(
        v_recebimentos_total
        - v_recebimentos_base
        - v_recebimentos_juros
        - v_recebimentos_multa
        - v_recebimentos_acrescimo
        + v_recebimentos_desconto
        - v_recebimentos_diferenca
      ) > 0.005
    ) OR (
      v_despesas_base IS NOT NULL
      AND v_despesas_juros IS NOT NULL
      AND v_despesas_multa IS NOT NULL
      AND v_despesas_acrescimo IS NOT NULL
      AND v_despesas_desconto IS NOT NULL
      AND v_despesas_diferenca IS NOT NULL
      AND pg_catalog.abs(
        v_despesas_total
        - v_despesas_base
        - v_despesas_juros
        - v_despesas_multa
        - v_despesas_acrescimo
        + v_despesas_desconto
        - v_despesas_diferenca
      ) > 0.005
    )
  THEN
    RAISE EXCEPTION 'Componentes financeiros não fecham com os totais mensais.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'versao', 1,
    'competencia', v_inicio,
    'periodo_inicio', v_inicio,
    'periodo_fim_exclusivo', v_fim,
    'escopo_tipo', CASE WHEN p_polo_id IS NULL THEN 'GLOBAL' ELSE 'POLO' END,
    'polo_id', p_polo_id,
    'gerado_em', pg_catalog.statement_timestamp(),
    'recebimentos', pg_catalog.jsonb_build_object(
      'disponivel', true,
      'completo', v_recebimentos_a_conferir = 0,
      'motivo', CASE WHEN v_recebimentos_a_conferir = 0
        THEN NULL ELSE 'DADOS_INCOMPLETOS' END,
      'observacao', CASE WHEN v_recebimentos_a_conferir = 0 THEN NULL
        ELSE pg_catalog.format(
          'Há %s recebimento(s) com composição parcial ou diferença a conferir.',
          v_recebimentos_a_conferir
        ) END,
      'dados', pg_catalog.jsonb_build_object(
        'total', v_recebimentos_total::numeric(30, 2)::text,
        'quantidade', v_recebimentos_quantidade,
        'base', v_recebimentos_base::numeric(30, 2)::text,
        'juros', v_recebimentos_juros::numeric(30, 2)::text,
        'multa', v_recebimentos_multa::numeric(30, 2)::text,
        'acrescimo', v_recebimentos_acrescimo::numeric(30, 2)::text,
        'desconto', v_recebimentos_desconto::numeric(30, 2)::text,
        'diferenca_a_conferir', v_recebimentos_diferenca::numeric(30, 2)::text,
        'quantidade_a_conferir', v_recebimentos_a_conferir
      )
    ),
    'despesas', pg_catalog.jsonb_build_object(
      'disponivel', true,
      'completo', v_despesas_a_conferir = 0,
      'motivo', CASE WHEN v_despesas_a_conferir = 0
        THEN NULL ELSE 'DADOS_INCOMPLETOS' END,
      'observacao', CASE WHEN v_despesas_a_conferir = 0 THEN NULL
        ELSE pg_catalog.format(
          'Há %s pagamento(s) com composição parcial ou diferença a conferir.',
          v_despesas_a_conferir
        ) END,
      'dados', pg_catalog.jsonb_build_object(
        'total', v_despesas_total::numeric(30, 2)::text,
        'quantidade', v_despesas_quantidade,
        'base', v_despesas_base::numeric(30, 2)::text,
        'juros', v_despesas_juros::numeric(30, 2)::text,
        'multa', v_despesas_multa::numeric(30, 2)::text,
        'acrescimo', v_despesas_acrescimo::numeric(30, 2)::text,
        'desconto', v_despesas_desconto::numeric(30, 2)::text,
        'diferenca_a_conferir', v_despesas_diferenca::numeric(30, 2)::text,
        'quantidade_a_conferir', v_despesas_a_conferir
      )
    )
  );
END;
$function$;

ALTER FUNCTION public.get_caixa_composicao_mensal_secure(uuid, date)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_caixa_composicao_mensal_secure(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_caixa_composicao_mensal_secure(uuid, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_caixa_composicao_mensal_secure(uuid, date) IS
  'Composição mensal leve e canônica do Caixa. Reutiliza a autorização da prestação mensal e os mesmos cores do PDF, valida total e quantidade e não limita o volume a 300 movimentos.';

NOTIFY pgrst, 'reload schema';

COMMIT;
