BEGIN;

CREATE OR REPLACE FUNCTION public.get_caixa_prestacao_mensal_visual_secure(
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
  v_payload jsonb;
  v_movimentacao jsonb;
  v_receitas jsonb;
  v_despesas jsonb;
  v_saldos jsonb;
BEGIN
  -- Esta chamada é a guarda canônica. Ela valida identidade, módulo e polo
  -- antes de devolver qualquer dado financeiro; este wrapper só projeta JSON.
  v_payload := public.get_caixa_prestacao_mensal_secure(
    p_polo_id,
    p_competencia,
    6
  );

  WITH pontos AS MATERIALIZED (
    SELECT
      item,
      ordinal,
      item ->> 'competencia' AS competencia,
      item ->> 'rotulo' AS rotulo,
      coalesce((item ->> 'entradas')::numeric, 0) AS entradas,
      coalesce((item ->> 'saidas')::numeric, 0) AS saidas,
      coalesce((item ->> 'resultado')::numeric, 0) AS resultado,
      coalesce((item ->> 'inadimplencia')::numeric, 0) AS inadimplencia,
      count(*) OVER ()::numeric AS quantidade
    FROM pg_catalog.jsonb_array_elements(
      coalesce(v_payload -> 'serie_mensal', '[]'::jsonb)
    ) WITH ORDINALITY AS serie(item, ordinal)
  ), limites AS (
    SELECT
      least(0, coalesce(min(resultado), 0)) AS minimo,
      greatest(
        0,
        coalesce(max(entradas), 0),
        coalesce(max(saidas), 0),
        coalesce(max(resultado), 0),
        coalesce(max(inadimplencia), 0)
      ) AS maximo
    FROM pontos
  ), escala AS (
    SELECT
      minimo,
      maximo,
      maximo - minimo AS amplitude,
      CASE
        WHEN maximo - minimo = 0 THEN 100::numeric
        ELSE pg_catalog.round(maximo / (maximo - minimo) * 100, 2)
      END AS base_y
    FROM limites
  ), geometria AS MATERIALIZED (
    SELECT
      pontos.*,
      escala.minimo,
      escala.maximo,
      escala.base_y,
      pg_catalog.round(
        (pontos.ordinal::numeric - 0.5) / pontos.quantidade * 100,
        2
      ) AS x,
      CASE WHEN escala.amplitude = 0 THEN 0::numeric ELSE
        pg_catalog.round(pontos.entradas / escala.amplitude * 100, 2)
      END AS entradas_altura,
      CASE WHEN escala.amplitude = 0 THEN 0::numeric ELSE
        pg_catalog.round(pontos.saidas / escala.amplitude * 100, 2)
      END AS saidas_altura,
      CASE WHEN escala.amplitude = 0 THEN 100::numeric ELSE
        pg_catalog.round(
          (escala.maximo - pontos.resultado) / escala.amplitude * 100,
          2
        )
      END AS resultado_y,
      CASE WHEN escala.amplitude = 0 THEN 100::numeric ELSE
        pg_catalog.round(
          (escala.maximo - pontos.inadimplencia) / escala.amplitude * 100,
          2
        )
      END AS inadimplencia_y
    FROM pontos
    CROSS JOIN escala
  )
  SELECT pg_catalog.jsonb_build_object(
    'view_box', '0 0 100 100',
    'dominio_minimo', coalesce(
      min(geometria.minimo)::numeric(30, 2)::text, '0.00'
    ),
    'dominio_maximo', coalesce(
      max(geometria.maximo)::numeric(30, 2)::text, '0.00'
    ),
    'base_y', coalesce(max(geometria.base_y), 100),
    'meses', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'competencia', geometria.competencia,
        'rotulo', geometria.rotulo,
        'x', geometria.x,
        'base_y', geometria.base_y,
        'entrada_x', geometria.x - 5.5,
        'saida_x', geometria.x + 0.5,
        'entrada_y', geometria.base_y - geometria.entradas_altura,
        'saida_y', geometria.base_y - geometria.saidas_altura,
        'largura', 5,
        'entradas_valor', geometria.entradas::numeric(30, 2)::text,
        'saidas_valor', geometria.saidas::numeric(30, 2)::text,
        'resultado_valor', geometria.resultado::numeric(30, 2)::text,
        'inadimplencia_valor', geometria.inadimplencia::numeric(30, 2)::text,
        'entradas_altura', geometria.entradas_altura,
        'saidas_altura', geometria.saidas_altura,
        'resultado_y', geometria.resultado_y,
        'inadimplencia_y', geometria.inadimplencia_y
      ) ORDER BY geometria.ordinal
    ), '[]'::jsonb),
    'resultado_pontos', coalesce(pg_catalog.string_agg(
      geometria.x::text || ',' || geometria.resultado_y::text,
      ' ' ORDER BY geometria.ordinal
    ), ''),
    'inadimplencia_pontos', coalesce(pg_catalog.string_agg(
      geometria.x::text || ',' || geometria.inadimplencia_y::text,
      ' ' ORDER BY geometria.ordinal
    ), '')
  )
  INTO v_movimentacao
  FROM geometria;

  WITH itens AS MATERIALIZED (
    SELECT
      item,
      ordinal,
      coalesce((item ->> 'valor')::numeric, 0) AS valor
    FROM pg_catalog.jsonb_array_elements(
      coalesce(v_payload -> 'receitas_por_modalidade', '[]'::jsonb)
    ) WITH ORDINALITY AS origem(item, ordinal)
    WHERE coalesce((item ->> 'valor')::numeric, 0) > 0
  ), limites AS (
    SELECT
      itens.*,
      sum(valor) OVER () AS total,
      coalesce(sum(valor) OVER (
        ORDER BY ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS valor_anterior,
      sum(valor) OVER (
        ORDER BY ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS valor_acumulado
    FROM itens
  ), segmentos AS (
    SELECT
      limites.*,
      pg_catalog.round(valor_anterior / total * 100, 2) AS inicio,
      pg_catalog.round(valor_acumulado / total * 100, 2) AS fim
    FROM limites
  )
  SELECT pg_catalog.jsonb_build_object(
    'total', coalesce(max(total)::numeric(30, 2)::text, '0.00'),
    'itens', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'codigo', item ->> 'codigo',
        'rotulo', item ->> 'rotulo',
        'valor', valor::numeric(30, 2)::text,
        'quantidade', coalesce((item ->> 'quantidade')::integer, 0),
        'percentual', fim - inicio,
        'inicio_percentual', inicio,
        'comprimento_percentual', fim - inicio,
        'offset_percentual', -inicio,
        'gap_percentual', 100 - (fim - inicio)
      ) ORDER BY ordinal
    ), '[]'::jsonb)
  ) INTO v_receitas
  FROM segmentos;

  WITH itens AS MATERIALIZED (
    SELECT
      item,
      ordinal,
      coalesce((item ->> 'valor')::numeric, 0) AS valor
    FROM pg_catalog.jsonb_array_elements(
      coalesce(v_payload -> 'despesas_por_categoria', '[]'::jsonb)
    ) WITH ORDINALITY AS origem(item, ordinal)
    WHERE coalesce((item ->> 'valor')::numeric, 0) > 0
  ), limites AS (
    SELECT
      itens.*,
      sum(valor) OVER () AS total,
      coalesce(sum(valor) OVER (
        ORDER BY ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS valor_anterior,
      sum(valor) OVER (
        ORDER BY ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS valor_acumulado
    FROM itens
  ), segmentos AS (
    SELECT
      limites.*,
      pg_catalog.round(valor_anterior / total * 100, 2) AS inicio,
      pg_catalog.round(valor_acumulado / total * 100, 2) AS fim
    FROM limites
  )
  SELECT pg_catalog.jsonb_build_object(
    'total', coalesce(max(total)::numeric(30, 2)::text, '0.00'),
    'itens', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'codigo', item ->> 'codigo',
        'rotulo', item ->> 'rotulo',
        'valor', valor::numeric(30, 2)::text,
        'quantidade', coalesce((item ->> 'quantidade')::integer, 0),
        'percentual', fim - inicio,
        'inicio_percentual', inicio,
        'comprimento_percentual', fim - inicio,
        'offset_percentual', -inicio,
        'gap_percentual', 100 - (fim - inicio)
      ) ORDER BY ordinal
    ), '[]'::jsonb)
  ) INTO v_despesas
  FROM segmentos;

  WITH itens AS MATERIALIZED (
    SELECT
      item,
      ordinal,
      coalesce((item ->> 'valor_exibido')::numeric, 0) AS valor
    FROM pg_catalog.jsonb_array_elements(
      coalesce(v_payload -> 'contas', '[]'::jsonb)
    ) WITH ORDINALITY AS origem(item, ordinal)
    WHERE coalesce((item ->> 'valor_exibido')::numeric, 0) > 0
  ), limites AS (
    SELECT
      itens.*,
      sum(valor) OVER () AS total,
      coalesce(sum(valor) OVER (
        ORDER BY ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS valor_anterior,
      sum(valor) OVER (
        ORDER BY ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS valor_acumulado
    FROM itens
  ), segmentos AS (
    SELECT
      limites.*,
      pg_catalog.round(valor_anterior / total * 100, 2) AS inicio,
      pg_catalog.round(valor_acumulado / total * 100, 2) AS fim
    FROM limites
  )
  SELECT pg_catalog.jsonb_build_object(
    'total_positivo', coalesce(max(total)::numeric(30, 2)::text, '0.00'),
    'itens', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', item ->> 'id',
        'banco', item ->> 'banco',
        'conta', item ->> 'conta',
        'titular', item ->> 'titular',
        'natureza', item ->> 'natureza',
        'valor', valor::numeric(30, 2)::text,
        'percentual', fim - inicio,
        'inicio_percentual', inicio,
        'comprimento_percentual', fim - inicio,
        'offset_percentual', -inicio,
        'gap_percentual', 100 - (fim - inicio)
      ) ORDER BY ordinal
    ), '[]'::jsonb)
  ) INTO v_saldos
  FROM segmentos;

  RETURN v_payload || pg_catalog.jsonb_build_object(
    'visualizacoes', pg_catalog.jsonb_build_object(
      'versao', 1,
      'janela_meses', 6,
      'movimentacao', coalesce(v_movimentacao, '{}'::jsonb),
      'composicao', pg_catalog.jsonb_build_object(
        'receitas', coalesce(v_receitas, '{}'::jsonb),
        'despesas', coalesce(v_despesas, '{}'::jsonb)
      ),
      'saldos_por_conta', coalesce(v_saldos, '{}'::jsonb)
    )
  );
END;
$function$;

ALTER FUNCTION public.get_caixa_prestacao_mensal_visual_secure(uuid, date)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_caixa_prestacao_mensal_visual_secure(
  uuid, date
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_caixa_prestacao_mensal_visual_secure(
  uuid, date
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_caixa_prestacao_mensal_visual_secure(uuid, date)
IS 'Prestação mensal integral com visualizações canônicas de seis meses. Autoriza e isola o escopo exclusivamente pela RPC mensal segura.';

NOTIFY pgrst, 'reload schema';

COMMIT;
