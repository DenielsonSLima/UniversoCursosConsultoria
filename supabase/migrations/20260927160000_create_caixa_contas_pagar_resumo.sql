BEGIN;

CREATE OR REPLACE FUNCTION public.get_caixa_contas_pagar_resumo_secure(
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
  v_hoje date := pg_catalog.timezone(
    'America/Maceio', pg_catalog.now()
  )::date;
  v_competencia date := pg_catalog.date_trunc(
    'month', coalesce(p_competencia, v_hoje)
  )::date;
  v_fim date;
  v_data_corte date;
  v_resultado jsonb;
BEGIN
  v_fim := (v_competencia + interval '1 month')::date;
  v_data_corte := least(v_hoje, v_fim - 1);

  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND (
           public.gestor_has_any_global_module(ARRAY['caixa'])
           OR (
             public.gestor_has_any_global_module(ARRAY['financeiro'])
             AND public.gestor_has_effective_financeiro_tab('despesas')
           )
         )
       )
       OR (
         p_polo_id IS NOT NULL
         AND (
           public.gestor_has_any_module_for_polo(ARRAY['caixa'], p_polo_id)
           OR (
             public.gestor_has_any_module_for_polo(
               ARRAY['financeiro'], p_polo_id
             )
             AND public.gestor_has_effective_financeiro_tab('despesas')
           )
         )
       )
     ) THEN
    RAISE EXCEPTION 'Acesso ao resumo de contas a pagar fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  WITH obrigacoes AS MATERIALIZED (
    -- Contas legadas sem vínculo com Despesas ou Financiamento.
    SELECT
      'CONTA_PAGAR:' || conta.id::text AS chave,
      conta.polo_id,
      round(coalesce(conta.valor, 0), 2) AS valor_programado,
      round(coalesce(conta.valor_pago, conta.valor, 0), 2) AS valor_pago,
      conta.data_vencimento,
      conta.data_pagamento,
      conta.status,
      conta.created_at::date AS data_registro
    FROM public.contas_pagar conta
    WHERE conta.despesa_lancamento_id IS NULL
      AND conta.emprestimo_parcela_id IS NULL
      AND conta.status <> 'CANCELADO'
      AND (p_polo_id IS NULL OR conta.polo_id = p_polo_id)

    UNION ALL

    -- Despesa própria: somente a linha econômica do polo que a contraiu.
    SELECT
      'DESPESA:' || despesa.id::text,
      despesa.polo_id,
      round(coalesce(despesa.valor, 0), 2),
      round(coalesce(despesa.valor_pago, despesa.valor, 0), 2),
      despesa.data_vencimento,
      despesa.data_pagamento,
      despesa.status,
      despesa.created_at::date
    FROM public.despesas_lancamentos despesa
    WHERE despesa.rateio_modo = 'SEM_RATEIO'
      AND despesa.excluido_em IS NULL
      AND despesa.status <> 'CANCELADO'
      AND (p_polo_id IS NULL OR despesa.polo_id = p_polo_id)

    UNION ALL

    -- Despesa rateada: o título físico da Matriz não reaparece. As frações
    -- permanecem separadas para preservar pagamentos e vigência no corte.
    SELECT
      'DESPESA:' || despesa.id::text,
      rateio.polo_id,
      round(coalesce(rateio.valor_total, 0), 2),
      round(coalesce(rateio.valor_total, 0), 2),
      despesa.data_vencimento,
      rateio.data_pagamento,
      rateio.status,
      greatest(despesa.created_at::date, rateio.created_at::date)
    FROM public.despesas_lancamentos_rateios rateio
    JOIN public.despesas_lancamentos despesa
      ON despesa.id = rateio.despesa_lancamento_id
    WHERE despesa.rateio_modo IN ('TODOS', 'SELECIONADOS')
      AND despesa.excluido_em IS NULL
      AND despesa.status <> 'CANCELADO'
      AND rateio.status <> 'CANCELADO'
      AND (p_polo_id IS NULL OR rateio.polo_id = p_polo_id)
  ),
  base AS MATERIALIZED (
    SELECT
      obrigacao.*,
      (
        obrigacao.data_registro <= v_data_corte
        AND (
          obrigacao.status IN ('PENDENTE', 'VENCIDO', 'ESTORNADO')
          OR (
            obrigacao.status = 'PAGO'
            AND obrigacao.data_pagamento > v_data_corte
          )
        )
      ) AS aberta_no_corte
    FROM obrigacoes obrigacao
    WHERE obrigacao.data_vencimento IS NOT NULL
      AND obrigacao.data_registro IS NOT NULL
      AND obrigacao.data_registro <= v_data_corte
  ),
  titulos AS MATERIALIZED (
    SELECT
      chave,
      bool_and(
        status = 'PAGO'
        AND data_pagamento IS NOT NULL
        AND data_pagamento <= v_data_corte
      ) AS totalmente_pago_no_corte,
      max(data_pagamento) FILTER (
        WHERE status = 'PAGO' AND data_pagamento <= v_data_corte
      ) AS data_quitacao
    FROM base
    GROUP BY chave
  ),
  metricas AS (
    SELECT
      coalesce(sum(valor_programado) FILTER (
        WHERE data_vencimento >= v_competencia
          AND data_vencimento < v_fim
      ), 0) AS contas_valor,
      count(DISTINCT chave) FILTER (
        WHERE data_vencimento >= v_competencia
          AND data_vencimento < v_fim
      )::integer AS contas_quantidade,
      coalesce(sum(valor_pago) FILTER (
        WHERE status = 'PAGO'
          AND data_pagamento >= v_competencia
          AND data_pagamento < v_fim
          AND data_pagamento <= v_data_corte
      ), 0) AS pagas_valor,
      (
        SELECT count(*)::integer
        FROM titulos titulo
        WHERE titulo.totalmente_pago_no_corte
          AND titulo.data_quitacao >= v_competencia
          AND titulo.data_quitacao < v_fim
      ) AS pagas_quantidade,
      coalesce(sum(valor_programado) FILTER (
        WHERE aberta_no_corte
          AND data_vencimento >= greatest(v_competencia, v_data_corte)
          AND data_vencimento < v_fim
      ), 0) AS a_vencer_valor,
      count(DISTINCT chave) FILTER (
        WHERE aberta_no_corte
          AND data_vencimento >= greatest(v_competencia, v_data_corte)
          AND data_vencimento < v_fim
      )::integer AS a_vencer_quantidade,
      coalesce(sum(valor_programado) FILTER (
        WHERE aberta_no_corte AND data_vencimento < v_data_corte
      ), 0) AS atraso_valor,
      count(DISTINCT chave) FILTER (
        WHERE aberta_no_corte AND data_vencimento < v_data_corte
      )::integer AS atraso_quantidade,
      min(data_vencimento) FILTER (
        WHERE aberta_no_corte AND data_vencimento < v_data_corte
      ) AS atraso_data_mais_antiga,
      coalesce(sum(valor_programado) FILTER (
        WHERE aberta_no_corte AND data_vencimento = v_data_corte
      ), 0) AS hoje_valor,
      count(DISTINCT chave) FILTER (
        WHERE aberta_no_corte AND data_vencimento = v_data_corte
      )::integer AS hoje_quantidade,
      coalesce(sum(valor_programado) FILTER (
        WHERE aberta_no_corte
          AND data_vencimento > v_data_corte
          AND data_vencimento <= v_data_corte + 7
      ), 0) AS sete_dias_valor,
      count(DISTINCT chave) FILTER (
        WHERE aberta_no_corte
          AND data_vencimento > v_data_corte
          AND data_vencimento <= v_data_corte + 7
      )::integer AS sete_dias_quantidade
    FROM base
  ),
  dias AS (
    SELECT (v_data_corte + indice)::date AS data
    FROM pg_catalog.generate_series(0, 7) AS serie(indice)
  ),
  agenda_por_dia AS (
    SELECT
      dia.data,
      coalesce(sum(base.valor_programado) FILTER (
        WHERE base.aberta_no_corte
      ), 0) AS valor,
      count(DISTINCT base.chave) FILTER (
        WHERE base.aberta_no_corte
      )::integer AS quantidade
    FROM dias dia
    LEFT JOIN base ON base.data_vencimento = dia.data
    GROUP BY dia.data
  ),
  agenda_dias AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'data', pg_catalog.to_char(item.data, 'YYYY-MM-DD'),
          'valor', round(item.valor, 2)::text,
          'quantidade', item.quantidade
        )
        ORDER BY item.data
      ),
      '[]'::jsonb
    ) AS itens
    FROM agenda_por_dia item
  )
  SELECT jsonb_build_object(
    'versao', 1,
    'competencia', pg_catalog.to_char(v_competencia, 'YYYY-MM-DD'),
    'periodo_inicio', pg_catalog.to_char(v_competencia, 'YYYY-MM-DD'),
    'periodo_fim_exclusivo', pg_catalog.to_char(v_fim, 'YYYY-MM-DD'),
    'data_corte', pg_catalog.to_char(v_data_corte, 'YYYY-MM-DD'),
    'escopo_tipo', CASE WHEN p_polo_id IS NULL THEN 'GLOBAL' ELSE 'POLO' END,
    'polo_id', p_polo_id,
    'criterio', 'POSICAO_REEXPRESSA_NO_CORTE',
    'contas_competencia', jsonb_build_object(
      'valor', round(metricas.contas_valor, 2)::text,
      'quantidade', metricas.contas_quantidade
    ),
    'pagas_competencia', jsonb_build_object(
      'valor', round(metricas.pagas_valor, 2)::text,
      'quantidade', metricas.pagas_quantidade
    ),
    'a_vencer_competencia', jsonb_build_object(
      'valor', round(metricas.a_vencer_valor, 2)::text,
      'quantidade', metricas.a_vencer_quantidade
    ),
    'em_atraso', jsonb_build_object(
      'valor', round(metricas.atraso_valor, 2)::text,
      'quantidade', metricas.atraso_quantidade,
      'data_mais_antiga', CASE
        WHEN metricas.atraso_data_mais_antiga IS NULL THEN NULL
        ELSE pg_catalog.to_char(metricas.atraso_data_mais_antiga, 'YYYY-MM-DD')
      END
    ),
    'agenda_financeira', jsonb_build_object(
      'hoje', jsonb_build_object(
        'data', pg_catalog.to_char(v_data_corte, 'YYYY-MM-DD'),
        'valor', round(metricas.hoje_valor, 2)::text,
        'quantidade', metricas.hoje_quantidade
      ),
      'proximos_sete_dias', jsonb_build_object(
        'periodo_inicio', pg_catalog.to_char(v_data_corte + 1, 'YYYY-MM-DD'),
        'periodo_fim_exclusivo', pg_catalog.to_char(v_data_corte + 8, 'YYYY-MM-DD'),
        'valor', round(metricas.sete_dias_valor, 2)::text,
        'quantidade', metricas.sete_dias_quantidade
      ),
      'dias', agenda_dias.itens
    )
  )
  INTO v_resultado
  FROM metricas
  CROSS JOIN agenda_dias;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_caixa_contas_pagar_resumo_secure(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_contas_pagar_resumo_secure(uuid, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_caixa_contas_pagar_resumo_secure(uuid, date) IS
  'Posição econômica reexpressa de contas a pagar no corte institucional de America/Maceio. Pagamentos posteriores são recompostos quando há data; cancelamentos e exclusões sem vigência histórica permanecem refletidos pelo estado atual. Restrita a Caixa ou Financeiro/Despesas, sem duplicar baixa física de rateios ou misturar financiamento.';

COMMIT;
