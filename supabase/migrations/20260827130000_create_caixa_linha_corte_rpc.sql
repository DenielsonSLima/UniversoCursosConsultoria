-- ==============================================================================
-- Migração: Painel Canônico de Linha de Corte, Ponto de Equilíbrio e Inadimplência no Caixa
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_caixa_linha_corte_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio date := date_trunc('month', coalesce(p_competencia, CURRENT_DATE))::date;
  v_fim date := (date_trunc('month', coalesce(p_competencia, CURRENT_DATE)) + interval '1 month')::date;

  -- Mês Atual: Receitas
  v_receitas_realizadas numeric := 0;
  v_receitas_previstas numeric := 0;
  v_receitas_totais numeric := 0;

  -- Mês Atual: Inadimplência e Risco
  v_inadimplencia_vencida numeric := 0;
  v_inadimplencia_quantidade integer := 0;
  v_taxa_inadimplencia_mes numeric := 0;
  v_tolerancia_inadimplencia numeric := 0;
  v_impacto_inadimplencia text := 'SEGURO';
  v_diagnostico_inadimplencia text := '';

  -- Mês Atual: Despesas
  v_despesas_fixas numeric := 0;
  v_despesas_variaveis numeric := 0;
  v_despesas_rateadas numeric := 0;
  v_linha_corte_total numeric := 0;

  -- Mês Atual: Cobertura e Margens
  v_ponto_equilibrio_atingido boolean := false;
  v_cobertura_fixa_atingida boolean := false;
  v_percentual_cobertura_realizada numeric := 0;
  v_percentual_cobertura_projetada numeric := 0;
  v_percentual_fixas numeric := 0;
  v_percentual_variaveis_rateios numeric := 0;
  v_margem_atual numeric := 0;
  v_margem_projetada numeric := 0;
  v_valor_faltante numeric := 0;
  v_status_operacional text := 'SEM_MOVIMENTO';

  -- Histórico (Últimos 3 meses com Fallback)
  v_meses_amostra integer := 0;
  v_linha_corte_mes_anterior numeric := 0;
  v_receitas_mes_anterior numeric := 0;
  v_rotulo_mes_anterior text := NULL;
  v_linha_corte_media_historica numeric := 0;
  v_receitas_media_historica numeric := 0;
  v_variacao_mes_anterior_percentual numeric := NULL;
  v_variacao_media_percentual numeric := NULL;
  v_rotulo_amostra text := 'Mês inaugural — sem histórico anterior';
  v_amostra_meses_nomes text := '';
BEGIN
  -- 1. Autorização de Escopo
  IF auth.role() <> 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND public.gestor_has_any_global_module(ARRAY['caixa', 'financeiro'])
       )
       OR (
         p_polo_id IS NOT NULL
         AND public.gestor_has_any_module_for_polo(ARRAY['caixa', 'financeiro'], p_polo_id)
       )
     ) THEN
    RAISE EXCEPTION 'Acesso à linha de corte fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Receitas e Inadimplência da Competência Atual
  SELECT
    coalesce(sum(
      coalesce(
        CASE
          WHEN cr.manual_settlement_id IS NOT NULL
               AND cr.manual_settlement_reversed_at IS NULL
            THEN cr.manual_settlement_received_cents::numeric / 100.0
          ELSE NULL
        END,
        cr.valor_pago,
        cr.valor,
        0
      )
    ) FILTER (
      WHERE cr.status = 'PAGO'
        AND cr.data_pagamento >= v_inicio
        AND cr.data_pagamento < v_fim
    ), 0),
    coalesce(sum(cr.valor) FILTER (
      WHERE cr.status IN ('PENDENTE', 'VENCIDO')
        AND cr.data_vencimento >= v_inicio
        AND cr.data_vencimento < v_fim
    ), 0),
    coalesce(sum(cr.valor) FILTER (
      WHERE cr.status IN ('PENDENTE', 'VENCIDO')
        AND cr.data_vencimento >= v_inicio
        AND cr.data_vencimento < v_fim
        AND cr.data_vencimento < CURRENT_DATE
    ), 0),
    coalesce(count(cr.id) FILTER (
      WHERE cr.status IN ('PENDENTE', 'VENCIDO')
        AND cr.data_vencimento >= v_inicio
        AND cr.data_vencimento < v_fim
        AND cr.data_vencimento < CURRENT_DATE
    ), 0)::integer
  INTO
    v_receitas_realizadas,
    v_receitas_previstas,
    v_inadimplencia_vencida,
    v_inadimplencia_quantidade
  FROM public.contas_receber cr
  WHERE (p_polo_id IS NULL OR cr.polo_id = p_polo_id);

  v_receitas_totais := v_receitas_realizadas + v_receitas_previstas;

  -- 3. Despesas da Competência Atual (Fixas, Variáveis e Rateadas)
  WITH despesas_base AS (
    -- Contas a pagar legadas comuns
    SELECT
      cp.valor,
      cp.status,
      cp.data_vencimento,
      CASE
        WHEN upper(coalesce(cp.categoria, '')) IN ('DESPESA_FIXA', 'ADMINISTRATIVA', 'PESSOAL', 'FOLHA')
          THEN 'FIXA'
        ELSE 'VARIAVEL'
      END AS tipo_despesa,
      false AS is_rateado
    FROM public.contas_pagar cp
    WHERE cp.despesa_lancamento_id IS NULL
      AND cp.emprestimo_parcela_id IS NULL
      AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)

    UNION ALL

    -- Despesas sem rateio
    SELECT
      dl.valor,
      dl.status,
      dl.data_vencimento,
      CASE
        WHEN dl.tipo = 'FIXA' THEN 'FIXA'
        ELSE 'VARIAVEL'
      END AS tipo_despesa,
      false AS is_rateado
    FROM public.despesas_lancamentos dl
    WHERE dl.rateio_modo = 'SEM_RATEIO'
      AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)

    UNION ALL

    -- Despesas rateadas (parcelas econômicas por polo)
    SELECT
      rateio.valor_total AS valor,
      rateio.status,
      dl.data_vencimento,
      'RATEIO' AS tipo_despesa,
      true AS is_rateado
    FROM public.despesas_lancamentos_rateios rateio
    JOIN public.despesas_lancamentos dl
      ON dl.id = rateio.despesa_lancamento_id
    WHERE (p_polo_id IS NULL OR rateio.polo_id = p_polo_id)
  )
  SELECT
    coalesce(sum(d.valor) FILTER (
      WHERE d.status <> 'CANCELADO'
        AND d.data_vencimento >= v_inicio
        AND d.data_vencimento < v_fim
        AND d.tipo_despesa = 'FIXA'
    ), 0),
    coalesce(sum(d.valor) FILTER (
      WHERE d.status <> 'CANCELADO'
        AND d.data_vencimento >= v_inicio
        AND d.data_vencimento < v_fim
        AND d.tipo_despesa = 'VARIAVEL'
    ), 0),
    coalesce(sum(d.valor) FILTER (
      WHERE d.status <> 'CANCELADO'
        AND d.data_vencimento >= v_inicio
        AND d.data_vencimento < v_fim
        AND d.tipo_despesa = 'RATEIO'
    ), 0)
  INTO
    v_despesas_fixas,
    v_despesas_variaveis,
    v_despesas_rateadas
  FROM despesas_base d;

  v_linha_corte_total := v_despesas_fixas + v_despesas_variaveis + v_despesas_rateadas;

  -- 4. Métricas de Inadimplência e Tolerância de Risco
  IF v_receitas_totais > 0 THEN
    v_taxa_inadimplencia_mes := round((v_inadimplencia_vencida / v_receitas_totais) * 100, 1);
    IF v_receitas_totais > v_linha_corte_total THEN
      v_tolerancia_inadimplencia := round(((v_receitas_totais - v_linha_corte_total) / v_receitas_totais) * 100, 1);
    ELSE
      v_tolerancia_inadimplencia := 0;
    END IF;
  ELSE
    v_taxa_inadimplencia_mes := 0;
    v_tolerancia_inadimplencia := 0;
  END IF;

  -- Diagnóstico de impacto da inadimplência
  IF v_receitas_realizadas >= v_linha_corte_total THEN
    v_impacto_inadimplencia := 'SEGURO';
    v_diagnostico_inadimplencia := 'Operação segura: receitas recebidas cobrem a linha de corte mesmo com inadimplência.';
  ELSIF (v_receitas_realizadas + v_inadimplencia_vencida) >= v_linha_corte_total THEN
    v_impacto_inadimplencia := 'RECUPERAVEL';
    v_diagnostico_inadimplencia := 'A recuperação dos títulos vencidos no mês é suficiente para atingir o ponto de equilíbrio.';
  ELSE
    v_impacto_inadimplencia := 'CRITICO';
    v_diagnostico_inadimplencia := 'Abaixo da linha de corte: demanda reforço de captação e recuperação imediata de carnês.';
  END IF;

  -- 5. Métricas e Status de Cobertura do Mês Atual
  IF v_linha_corte_total > 0 THEN
    v_percentual_cobertura_realizada := round((v_receitas_realizadas / v_linha_corte_total) * 100, 1);
    v_percentual_cobertura_projetada := round((v_receitas_totais / v_linha_corte_total) * 100, 1);
    v_percentual_fixas := round((v_despesas_fixas / v_linha_corte_total) * 100, 1);
    v_percentual_variaveis_rateios := round(((v_despesas_variaveis + v_despesas_rateadas) / v_linha_corte_total) * 100, 1);
    v_ponto_equilibrio_atingido := (v_receitas_realizadas >= v_linha_corte_total);
    v_cobertura_fixa_atingida := (v_receitas_realizadas >= v_despesas_fixas);
    v_valor_faltante := greatest(0, v_linha_corte_total - v_receitas_realizadas);
  ELSE
    v_percentual_cobertura_realizada := CASE WHEN v_receitas_realizadas > 0 THEN 100.0 ELSE 0.0 END;
    v_percentual_cobertura_projetada := CASE WHEN v_receitas_totais > 0 THEN 100.0 ELSE 0.0 END;
    v_percentual_fixas := 0;
    v_percentual_variaveis_rateios := 0;
    v_ponto_equilibrio_atingido := (v_receitas_realizadas > 0);
    v_cobertura_fixa_atingida := (v_receitas_realizadas > 0);
    v_valor_faltante := 0;
  END IF;

  v_margem_atual := v_receitas_realizadas - v_linha_corte_total;
  v_margem_projetada := v_receitas_totais - v_linha_corte_total;

  IF v_linha_corte_total = 0 AND v_receitas_realizadas = 0 THEN
    v_status_operacional := 'SEM_MOVIMENTO';
  ELSIF v_receitas_realizadas >= v_linha_corte_total THEN
    v_status_operacional := 'LUCRO';
  ELSIF v_receitas_realizadas >= v_despesas_fixas AND v_despesas_fixas > 0 THEN
    v_status_operacional := 'COBRINDO_FIXAS';
  ELSE
    v_status_operacional := 'ABAIXO_DA_LINHA';
  END IF;

  -- 6. Histórico e Média Móvel dos Últimos 3 Meses com Fallback Inteligente
  WITH meses_offset AS (
    SELECT
      idx,
      (v_inicio - (idx || ' month')::interval)::date AS inicio_m,
      (v_inicio - ((idx - 1) || ' month')::interval)::date AS fim_m,
      (
        CASE extract(month FROM (v_inicio - (idx || ' month')::interval))::integer
          WHEN 1 THEN 'Jan' WHEN 2 THEN 'Fev'
          WHEN 3 THEN 'Mar' WHEN 4 THEN 'Abr'
          WHEN 5 THEN 'Mai' WHEN 6 THEN 'Jun'
          WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago'
          WHEN 9 THEN 'Set' WHEN 10 THEN 'Out'
          WHEN 11 THEN 'Nov' ELSE 'Dez'
        END
      ) AS rotulo_mes
    FROM generate_series(1, 3) AS idx
  ),
  historico_calculado AS (
    SELECT
      mo.idx,
      mo.inicio_m,
      mo.rotulo_mes,
      coalesce((
        SELECT sum(
          coalesce(
            CASE
              WHEN cr.manual_settlement_id IS NOT NULL
                   AND cr.manual_settlement_reversed_at IS NULL
                THEN cr.manual_settlement_received_cents::numeric / 100.0
              ELSE NULL
            END,
            cr.valor_pago,
            cr.valor,
            0
          )
        )
        FROM public.contas_receber cr
        WHERE cr.status = 'PAGO'
          AND cr.data_pagamento >= mo.inicio_m
          AND cr.data_pagamento < mo.fim_m
          AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
      ), 0) AS receitas_mes,
      coalesce((
        WITH d_hist AS (
          SELECT cp.valor, cp.status, cp.data_vencimento
          FROM public.contas_pagar cp
          WHERE cp.despesa_lancamento_id IS NULL
            AND cp.emprestimo_parcela_id IS NULL
            AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
          UNION ALL
          SELECT dl.valor, dl.status, dl.data_vencimento
          FROM public.despesas_lancamentos dl
          WHERE dl.rateio_modo = 'SEM_RATEIO'
            AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
          UNION ALL
          SELECT r.valor_total AS valor, r.status, dl2.data_vencimento
          FROM public.despesas_lancamentos_rateios r
          JOIN public.despesas_lancamentos dl2 ON dl2.id = r.despesa_lancamento_id
          WHERE (p_polo_id IS NULL OR r.polo_id = p_polo_id)
        )
        SELECT sum(d.valor)
        FROM d_hist d
        WHERE d.status <> 'CANCELADO'
          AND d.data_vencimento >= mo.inicio_m
          AND d.data_vencimento < mo.fim_m
      ), 0) AS linha_corte_mes
    FROM meses_offset mo
  ),
  historico_valido AS (
    SELECT *
    FROM historico_calculado
    WHERE (receitas_mes > 0 OR linha_corte_mes > 0)
    ORDER BY idx ASC
  )
  SELECT
    count(*)::integer,
    coalesce(sum(linha_corte_mes) FILTER (WHERE idx = 1), 0),
    coalesce(sum(receitas_mes) FILTER (WHERE idx = 1), 0),
    (SELECT rotulo_mes FROM historico_valido WHERE idx = 1 LIMIT 1),
    coalesce(round(avg(linha_corte_mes), 2), 0),
    coalesce(round(avg(receitas_mes), 2), 0),
    coalesce(string_agg(rotulo_mes, ', ' ORDER BY idx DESC), '')
  INTO
    v_meses_amostra,
    v_linha_corte_mes_anterior,
    v_receitas_mes_anterior,
    v_rotulo_mes_anterior,
    v_linha_corte_media_historica,
    v_receitas_media_historica,
    v_amostra_meses_nomes
  FROM historico_valido;

  IF v_linha_corte_mes_anterior > 0 THEN
    v_variacao_mes_anterior_percentual := round(((v_linha_corte_total - v_linha_corte_mes_anterior) / v_linha_corte_mes_anterior) * 100, 1);
  END IF;

  IF v_linha_corte_media_historica > 0 THEN
    v_variacao_media_percentual := round(((v_linha_corte_total - v_linha_corte_media_historica) / v_linha_corte_media_historica) * 100, 1);
  END IF;

  IF v_meses_amostra = 3 THEN
    v_rotulo_amostra := 'Média dos últimos 3 meses (' || v_amostra_meses_nomes || ')';
  ELSIF v_meses_amostra = 2 THEN
    v_rotulo_amostra := 'Média baseada em 2 meses disponíveis (' || v_amostra_meses_nomes || ')';
  ELSIF v_meses_amostra = 1 THEN
    v_rotulo_amostra := 'Referência do mês anterior (' || coalesce(v_rotulo_mes_anterior, v_amostra_meses_nomes) || ')';
  ELSE
    v_rotulo_amostra := 'Mês inaugural — sem histórico anterior';
  END IF;

  -- 7. Resposta Canônica em JSONB
  RETURN jsonb_build_object(
    'competencia', to_char(v_inicio, 'YYYY-MM-DD'),
    'polo_id', p_polo_id,
    'receitas', jsonb_build_object(
      'realizadas', v_receitas_realizadas,
      'previstas', v_receitas_previstas,
      'totais', v_receitas_totais
    ),
    'inadimplencia', jsonb_build_object(
      'valor_vencido', v_inadimplencia_vencida,
      'quantidade_titulos', v_inadimplencia_quantidade,
      'taxa_inadimplencia_mes', v_taxa_inadimplencia_mes,
      'tolerancia_inadimplencia', v_tolerancia_inadimplencia,
      'impacto', v_impacto_inadimplencia,
      'diagnostico', v_diagnostico_inadimplencia
    ),
    'despesas', jsonb_build_object(
      'fixas', v_despesas_fixas,
      'variaveis', v_despesas_variaveis,
      'rateadas', v_despesas_rateadas,
      'variaveis_e_rateios', v_despesas_variaveis + v_despesas_rateadas,
      'linha_corte_total', v_linha_corte_total,
      'percentual_fixas', v_percentual_fixas,
      'percentual_variaveis_rateios', v_percentual_variaveis_rateios
    ),
    'cobertura', jsonb_build_object(
      'status_operacional', v_status_operacional,
      'ponto_equilibrio_atingido', v_ponto_equilibrio_atingido,
      'cobertura_fixa_atingida', v_cobertura_fixa_atingida,
      'percentual_realizado', v_percentual_cobertura_realizada,
      'percentual_projetado', v_percentual_cobertura_projetada,
      'margem_atual', v_margem_atual,
      'margem_projetada', v_margem_projetada,
      'valor_faltante', v_valor_faltante
    ),
    'historico', jsonb_build_object(
      'meses_amostra', v_meses_amostra,
      'rotulo_amostra', v_rotulo_amostra,
      'mes_anterior', jsonb_build_object(
        'rotulo', v_rotulo_mes_anterior,
        'linha_corte', v_linha_corte_mes_anterior,
        'receitas', v_receitas_mes_anterior,
        'variacao_percentual', v_variacao_mes_anterior_percentual
      ),
      'media_trimestral', jsonb_build_object(
        'linha_corte', v_linha_corte_media_historica,
        'receitas', v_receitas_media_historica,
        'variacao_percentual', v_variacao_media_percentual
      )
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_caixa_linha_corte_secure(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_caixa_linha_corte_secure(uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_caixa_linha_corte_secure(uuid, date) IS
  'Cálculo canônico de linha de corte (ponto de equilíbrio), receitas, inadimplência e tolerância de risco, despesas e histórico com fallback.';
