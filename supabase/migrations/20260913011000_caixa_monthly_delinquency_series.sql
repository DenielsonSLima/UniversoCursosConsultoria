begin;

-- Extend the same RPC/OID: one canonical monthly delinquency line and shared chart scale.
-- The SVG projection is canonical data; the browser only converts its
-- percentages to display coordinates. Negative results share the same domain.
create function internal_contas.caixa_monthly_chart_series(p_points jsonb)
returns jsonb language sql immutable set search_path='' as $$
  with points as materialized (
    select item,ordinal,coalesce((item->>'entradas')::numeric,0) entradas,
      coalesce((item->>'saidas')::numeric,0) saidas,
      coalesce((item->>'resultado')::numeric,0) resultado,
      coalesce((item->>'inadimplencia')::numeric,0) inadimplencia
    from jsonb_array_elements(p_points) with ordinality as point(item,ordinal)
  ), bounds as (
    select least(0,coalesce(min(resultado),0)) minimum,
      greatest(0,coalesce(max(entradas),0),coalesce(max(saidas),0),
        coalesce(max(inadimplencia),0),coalesce(max(resultado),0)) maximum from points
  ), scale as (select bounds.*,maximum-minimum as span from bounds)
  select coalesce(jsonb_agg(point.item || jsonb_build_object(
    'entradas_escala_percentual',case when scale.span=0 then 0 else round(point.entradas/scale.span*100,2) end,
    'saidas_escala_percentual',case when scale.span=0 then 0 else round(point.saidas/scale.span*100,2) end,
    'inadimplencia_escala_percentual',case when scale.span=0 then 0 else round(point.inadimplencia/scale.span*100,2) end,
    'resultado_posicao_percentual',case when scale.span=0 then 100 else round((scale.maximum-point.resultado)/scale.span*100,2) end,
    'inadimplencia_posicao_percentual',case when scale.span=0 then 100 else round((scale.maximum-point.inadimplencia)/scale.span*100,2) end,
    'grafico_zero_posicao_percentual',case when scale.span=0 then 100 else round(scale.maximum/scale.span*100,2) end
  ) order by point.ordinal),'[]'::jsonb) from points point cross join scale;
$$;
revoke all on function internal_contas.caixa_monthly_chart_series(jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_caixa_prestacao_mensal_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE,
  p_meses_historico integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payload jsonb;
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_credito_financiamento numeric := 0;
  v_credito_quantidade integer := 0;
  v_saida_financiamento numeric := 0;
  v_saida_quantidade integer := 0;
  v_resumo jsonb;
  v_entradas numeric := 0;
  v_saidas numeric := 0;
  v_resultado numeric := 0;
  v_recebimentos integer := 0;
  v_pagamentos integer := 0;
  v_receitas_modalidades jsonb := '[]'::jsonb;
  v_despesas_categorias jsonb := '[]'::jsonb;
  v_serie_mensal jsonb := '[]'::jsonb;
BEGIN
  v_payload := public.get_caixa_prestacao_mensal_secure_raw(
    p_polo_id,
    p_competencia,
    p_meses_historico
  );

  SELECT
    coalesce(sum(coalesce(cr.valor_pago, cr.valor, 0)), 0),
    count(*)::integer
  INTO v_credito_financiamento, v_credito_quantidade
  FROM public.emprestimos_financeiros emprestimo
  JOIN public.contas_receber cr ON cr.id = emprestimo.conta_receber_id
  WHERE cr.status = 'PAGO'
    AND cr.data_pagamento >= v_inicio
    AND cr.data_pagamento < v_fim
    AND (p_polo_id IS NULL OR emprestimo.polo_matriz_id = p_polo_id);

  SELECT
    coalesce(sum(coalesce(cp.valor_pago, cp.valor, 0)), 0),
    count(*)::integer
  INTO v_saida_financiamento, v_saida_quantidade
  FROM public.contas_pagar cp
  WHERE cp.status = 'PAGO'
    AND cp.emprestimo_parcela_id IS NOT NULL
    AND cp.data_pagamento >= v_inicio
    AND cp.data_pagamento < v_fim
    AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id);

  v_resumo := coalesce(v_payload -> 'resumo_competencia', '{}'::jsonb);
  v_entradas := greatest(0, coalesce((v_resumo ->> 'entradas_recebidas_brutas')::numeric, 0) - v_credito_financiamento);
  v_saidas := greatest(0, coalesce((v_resumo ->> 'saidas_pagas')::numeric, 0) - v_saida_financiamento);
  v_resultado := v_entradas - v_saidas;
  v_recebimentos := greatest(0, coalesce((v_resumo ->> 'quantidade_recebimentos')::integer, 0) - v_credito_quantidade);
  v_pagamentos := greatest(0, coalesce((v_resumo ->> 'quantidade_pagamentos')::integer, 0) - v_saida_quantidade);

  v_payload := jsonb_set(
    v_payload,
    '{resumo_competencia}',
    v_resumo || jsonb_build_object(
      'entradas_recebidas_brutas', v_entradas,
      'saidas_pagas', v_saidas,
      'resultado', v_resultado,
      'resultado_status', CASE
        WHEN v_resultado > 0 THEN 'POSITIVO'
        WHEN v_resultado < 0 THEN 'NEGATIVO'
        ELSE 'NEUTRO'
      END,
      'quantidade_recebimentos', v_recebimentos,
      'quantidade_pagamentos', v_pagamentos
    ),
    true
  );

  WITH itens AS (
    SELECT item, ordinal, item ->> 'codigo' AS codigo,
      coalesce((item ->> 'valor')::numeric, 0) AS valor,
      coalesce((item ->> 'quantidade')::integer, 0) AS quantidade
    FROM jsonb_array_elements(coalesce(v_payload -> 'receitas_por_modalidade', '[]'::jsonb))
      WITH ORDINALITY AS origem(item, ordinal)
  ), ajustados AS (
    SELECT item, ordinal,
      CASE WHEN codigo = 'OUTROS_CREDITOS' THEN greatest(0, valor - v_credito_financiamento) ELSE valor END AS valor,
      CASE WHEN codigo = 'OUTROS_CREDITOS' THEN greatest(0, quantidade - v_credito_quantidade) ELSE quantidade END AS quantidade
    FROM itens
  ), total AS (
    SELECT coalesce(sum(valor), 0) AS valor FROM ajustados
  )
  SELECT coalesce(jsonb_agg(
    ajustados.item || jsonb_build_object(
      'valor', ajustados.valor,
      'quantidade', ajustados.quantidade,
      'percentual', CASE WHEN total.valor = 0 THEN 0 ELSE round((ajustados.valor / total.valor) * 100, 2) END
    ) ORDER BY ajustados.ordinal
  ), '[]'::jsonb)
  INTO v_receitas_modalidades
  FROM ajustados CROSS JOIN total;

  v_payload := jsonb_set(v_payload, '{receitas_por_modalidade}', v_receitas_modalidades, true);

  WITH itens AS (
    SELECT item, ordinal, item ->> 'codigo' AS codigo,
      coalesce((item ->> 'valor')::numeric, 0) AS valor,
      coalesce((item ->> 'quantidade')::integer, 0) AS quantidade
    FROM jsonb_array_elements(coalesce(v_payload -> 'despesas_por_categoria', '[]'::jsonb))
      WITH ORDINALITY AS origem(item, ordinal)
  ), ajustados AS (
    SELECT item, ordinal,
      CASE WHEN codigo = 'OUTRAS_DESPESAS' THEN greatest(0, valor - v_saida_financiamento) ELSE valor END AS valor,
      CASE WHEN codigo = 'OUTRAS_DESPESAS' THEN greatest(0, quantidade - v_saida_quantidade) ELSE quantidade END AS quantidade
    FROM itens
  ), total AS (
    SELECT coalesce(sum(valor), 0) AS valor FROM ajustados
  )
  SELECT coalesce(jsonb_agg(
    ajustados.item || jsonb_build_object(
      'valor', ajustados.valor,
      'quantidade', ajustados.quantidade,
      'percentual', CASE WHEN total.valor = 0 THEN 0 ELSE round((ajustados.valor / total.valor) * 100, 2) END
    ) ORDER BY ajustados.ordinal
  ), '[]'::jsonb)
  INTO v_despesas_categorias
  FROM ajustados CROSS JOIN total;

  v_payload := jsonb_set(v_payload, '{despesas_por_categoria}', v_despesas_categorias, true);

  WITH serie AS (
    SELECT item, ordinal, (item ->> 'competencia')::date AS competencia,
      coalesce((item ->> 'entradas')::numeric, 0) AS entradas,
      coalesce((item ->> 'saidas')::numeric, 0) AS saidas
    FROM jsonb_array_elements(coalesce(v_payload -> 'serie_mensal', '[]'::jsonb))
      WITH ORDINALITY AS origem(item, ordinal)
  ), financiamento AS (
    SELECT date_trunc('month', cr.data_pagamento)::date AS competencia,
      coalesce(sum(coalesce(cr.valor_pago, cr.valor, 0)), 0) AS entradas,
      0::numeric AS saidas
    FROM public.emprestimos_financeiros emprestimo
    JOIN public.contas_receber cr ON cr.id = emprestimo.conta_receber_id
    WHERE cr.status = 'PAGO'
      AND cr.data_pagamento IS NOT NULL
      AND (p_polo_id IS NULL OR emprestimo.polo_matriz_id = p_polo_id)
    GROUP BY date_trunc('month', cr.data_pagamento)::date

    UNION ALL

    SELECT date_trunc('month', cp.data_pagamento)::date,
      0::numeric,
      coalesce(sum(coalesce(cp.valor_pago, cp.valor, 0)), 0)
    FROM public.contas_pagar cp
    WHERE cp.status = 'PAGO'
      AND cp.emprestimo_parcela_id IS NOT NULL
      AND cp.data_pagamento IS NOT NULL
      AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
    GROUP BY date_trunc('month', cp.data_pagamento)::date
  ), financiamento_mes AS (
    SELECT competencia, sum(entradas) AS entradas, sum(saidas) AS saidas
    FROM financiamento
    GROUP BY competencia
  ), ajustada AS (
    SELECT serie.item, serie.ordinal,
      greatest(0, serie.entradas - coalesce(financiamento_mes.entradas, 0)) AS entradas,
      greatest(0, serie.saidas - coalesce(financiamento_mes.saidas, 0)) AS saidas
    FROM serie
    LEFT JOIN financiamento_mes ON financiamento_mes.competencia = serie.competencia
  ), escala AS (
    SELECT greatest(coalesce(max(entradas), 0), coalesce(max(saidas), 0)) AS maximo
    FROM ajustada
  )
  SELECT coalesce(jsonb_agg(
    ajustada.item || jsonb_build_object(
      'entradas', ajustada.entradas,
      'saidas', ajustada.saidas,
      'resultado', ajustada.entradas - ajustada.saidas,
      'resultado_status', CASE
        WHEN ajustada.entradas - ajustada.saidas > 0 THEN 'POSITIVO'
        WHEN ajustada.entradas - ajustada.saidas < 0 THEN 'NEGATIVO'
        ELSE 'NEUTRO'
      END,
      'entradas_escala_percentual', CASE WHEN escala.maximo = 0 THEN 0 ELSE round((ajustada.entradas / escala.maximo) * 100, 2) END,
      'saidas_escala_percentual', CASE WHEN escala.maximo = 0 THEN 0 ELSE round((ajustada.saidas / escala.maximo) * 100, 2) END
    ) ORDER BY ajustada.ordinal
  ), '[]'::jsonb)
  INTO v_serie_mensal
  FROM ajustada CROSS JOIN escala;

  -- Compute each month's evidence once, after the operational-financing
  -- adjustments. Monetary points and results stay unchanged.
  WITH monthly_evidence AS MATERIALIZED (
    SELECT item,ordinal,internal_contas.caixa_monthly_delinquency(
      p_polo_id,(item->>'competencia')::date,(now() at time zone 'America/Maceio')::date
    ) evidence
    FROM jsonb_array_elements(v_serie_mensal) WITH ORDINALITY AS point(item,ordinal)
  )
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'inadimplencia',coalesce((evidence->>'receber_vencido')::numeric,0),
    'inadimplencia_quantidade_em_conferencia',evidence#>'{inadimplencia_mensal,quantidade_em_conferencia}',
    'inadimplencia_completo',evidence#>'{inadimplencia_mensal,completo}'
  ) ORDER BY ordinal),'[]'::jsonb) INTO v_serie_mensal FROM monthly_evidence;
  v_serie_mensal := internal_contas.caixa_monthly_chart_series(v_serie_mensal);

  v_payload := jsonb_set(v_payload, '{serie_mensal}', v_serie_mensal, true);
  RETURN jsonb_set(v_payload, '{compromissos}',
    coalesce(v_payload->'compromissos','{}'::jsonb) || internal_contas.caixa_monthly_delinquency(
      p_polo_id,p_competencia,(now() at time zone 'America/Maceio')::date),true);
END;
$function$;


notify pgrst,'reload schema';
commit;
