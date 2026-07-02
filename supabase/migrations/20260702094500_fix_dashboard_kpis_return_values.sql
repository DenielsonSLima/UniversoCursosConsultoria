-- Corrige o retorno dos KPIs do modulo Inicio.
-- A funcao calculava os valores em variaveis internas, mas retornava colunas nulas.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(p_polo_id UUID DEFAULT NULL)
RETURNS TABLE (
  alunos_ativos BIGINT,
  alunos_ativos_mudanca NUMERIC,
  receita_mes NUMERIC,
  receita_mes_mudanca NUMERIC,
  taxa_inadimplencia NUMERIC,
  taxa_inadimplencia_mudanca NUMERIC,
  novas_matriculas BIGINT,
  novas_matriculas_mudanca NUMERIC
) AS $$
DECLARE
  v_inicio_mes_atual DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_fim_mes_atual DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  v_inicio_mes_anterior DATE := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::DATE;
  v_fim_mes_anterior DATE := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::DATE;

  v_alunos_ativos BIGINT;
  v_alunos_ativos_anterior BIGINT;
  v_receita_mes NUMERIC;
  v_receita_mes_anterior NUMERIC;
  v_total_vencido_nao_pago NUMERIC;
  v_total_recebido NUMERIC;
  v_taxa_inadimplencia NUMERIC;
  v_total_vencido_nao_pago_anterior NUMERIC;
  v_total_recebido_anterior NUMERIC;
  v_taxa_inadimplencia_anterior NUMERIC;
  v_novas_matriculas BIGINT;
  v_novas_matriculas_anterior BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_alunos_ativos
  FROM public.parceiros p
  WHERE p.tipo = 'Aluno'
    AND upper(p.status) = 'ATIVO'
    AND (
      p_polo_id IS NULL
      OR p.polo_id = p_polo_id
      OR p_polo_id = ANY(COALESCE(p.polo_ids, ARRAY[]::uuid[]))
      OR EXISTS (
        SELECT 1
        FROM public.matriculas m
        JOIN public.turmas t ON t.id = m.turma_id
        WHERE m.aluno_id = p.id
          AND upper(m.status) IN ('ATIVO', 'CONCLUIDO')
          AND t.polo_id = p_polo_id
      )
    );

  SELECT COUNT(*) INTO v_alunos_ativos_anterior
  FROM public.parceiros p
  WHERE p.tipo = 'Aluno'
    AND upper(p.status) = 'ATIVO'
    AND p.created_at < v_inicio_mes_atual
    AND (
      p_polo_id IS NULL
      OR p.polo_id = p_polo_id
      OR p_polo_id = ANY(COALESCE(p.polo_ids, ARRAY[]::uuid[]))
      OR EXISTS (
        SELECT 1
        FROM public.matriculas m
        JOIN public.turmas t ON t.id = m.turma_id
        WHERE m.aluno_id = p.id
          AND upper(m.status) IN ('ATIVO', 'CONCLUIDO')
          AND t.polo_id = p_polo_id
      )
    );

  SELECT COALESCE(SUM(COALESCE(cr.valor_pago, cr.valor)), 0) INTO v_receita_mes
  FROM public.contas_receber cr
  WHERE upper(cr.status) = 'PAGO'
    AND (
      (cr.data_pagamento >= v_inicio_mes_atual AND cr.data_pagamento <= v_fim_mes_atual)
      OR (cr.data_pagamento IS NULL AND cr.data_vencimento >= v_inicio_mes_atual AND cr.data_vencimento <= v_fim_mes_atual)
    )
    AND (
      p_polo_id IS NULL
      OR cr.polo_id = p_polo_id
      OR (
        cr.matricula_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.matriculas m
          JOIN public.turmas t ON t.id = m.turma_id
          WHERE m.id = cr.matricula_id
            AND t.polo_id = p_polo_id
        )
      )
    );

  SELECT COALESCE(SUM(COALESCE(cr.valor_pago, cr.valor)), 0) INTO v_receita_mes_anterior
  FROM public.contas_receber cr
  WHERE upper(cr.status) = 'PAGO'
    AND (
      (cr.data_pagamento >= v_inicio_mes_anterior AND cr.data_pagamento <= v_fim_mes_anterior)
      OR (cr.data_pagamento IS NULL AND cr.data_vencimento >= v_inicio_mes_anterior AND cr.data_vencimento <= v_fim_mes_anterior)
    )
    AND (
      p_polo_id IS NULL
      OR cr.polo_id = p_polo_id
      OR (
        cr.matricula_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.matriculas m
          JOIN public.turmas t ON t.id = m.turma_id
          WHERE m.id = cr.matricula_id
            AND t.polo_id = p_polo_id
        )
      )
    );

  SELECT COALESCE(SUM(cr.valor), 0) INTO v_total_vencido_nao_pago
  FROM public.contas_receber cr
  WHERE upper(cr.status) <> 'PAGO'
    AND cr.data_vencimento < CURRENT_DATE
    AND (
      p_polo_id IS NULL
      OR cr.polo_id = p_polo_id
      OR (
        cr.matricula_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.matriculas m
          JOIN public.turmas t ON t.id = m.turma_id
          WHERE m.id = cr.matricula_id
            AND t.polo_id = p_polo_id
        )
      )
    );

  SELECT COALESCE(SUM(COALESCE(cr.valor_pago, cr.valor)), 0) INTO v_total_recebido
  FROM public.contas_receber cr
  WHERE upper(cr.status) = 'PAGO'
    AND (
      p_polo_id IS NULL
      OR cr.polo_id = p_polo_id
      OR (
        cr.matricula_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.matriculas m
          JOIN public.turmas t ON t.id = m.turma_id
          WHERE m.id = cr.matricula_id
            AND t.polo_id = p_polo_id
        )
      )
    );

  v_taxa_inadimplencia := ROUND(
    ((v_total_vencido_nao_pago::NUMERIC / COALESCE(NULLIF(v_total_recebido + v_total_vencido_nao_pago, 0), 1)) * 100),
    1
  );

  SELECT COALESCE(SUM(cr.valor), 0) INTO v_total_vencido_nao_pago_anterior
  FROM public.contas_receber cr
  WHERE upper(cr.status) <> 'PAGO'
    AND cr.data_vencimento <= v_fim_mes_anterior
    AND (
      p_polo_id IS NULL
      OR cr.polo_id = p_polo_id
      OR (
        cr.matricula_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.matriculas m
          JOIN public.turmas t ON t.id = m.turma_id
          WHERE m.id = cr.matricula_id
            AND t.polo_id = p_polo_id
        )
      )
    );

  SELECT COALESCE(SUM(COALESCE(cr.valor_pago, cr.valor)), 0) INTO v_total_recebido_anterior
  FROM public.contas_receber cr
  WHERE upper(cr.status) = 'PAGO'
    AND (
      cr.data_pagamento <= v_fim_mes_anterior
      OR (cr.data_pagamento IS NULL AND cr.data_vencimento <= v_fim_mes_anterior)
    )
    AND (
      p_polo_id IS NULL
      OR cr.polo_id = p_polo_id
      OR (
        cr.matricula_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.matriculas m
          JOIN public.turmas t ON t.id = m.turma_id
          WHERE m.id = cr.matricula_id
            AND t.polo_id = p_polo_id
        )
      )
    );

  v_taxa_inadimplencia_anterior := ROUND(
    ((v_total_vencido_nao_pago_anterior::NUMERIC / COALESCE(NULLIF(v_total_recebido_anterior + v_total_vencido_nao_pago_anterior, 0), 1)) * 100),
    1
  );

  SELECT COUNT(*) INTO v_novas_matriculas
  FROM public.matriculas m
  JOIN public.parceiros p ON m.aluno_id = p.id
  JOIN public.turmas t ON m.turma_id = t.id
  WHERE m.data_matricula >= v_inicio_mes_atual
    AND m.data_matricula <= v_fim_mes_atual
    AND (
      p_polo_id IS NULL
      OR p.polo_id = p_polo_id
      OR p_polo_id = ANY(COALESCE(p.polo_ids, ARRAY[]::uuid[]))
      OR t.polo_id = p_polo_id
    );

  SELECT COUNT(*) INTO v_novas_matriculas_anterior
  FROM public.matriculas m
  JOIN public.parceiros p ON m.aluno_id = p.id
  JOIN public.turmas t ON m.turma_id = t.id
  WHERE m.data_matricula >= v_inicio_mes_anterior
    AND m.data_matricula <= v_fim_mes_anterior
    AND (
      p_polo_id IS NULL
      OR p.polo_id = p_polo_id
      OR p_polo_id = ANY(COALESCE(p.polo_ids, ARRAY[]::uuid[]))
      OR t.polo_id = p_polo_id
    );

  alunos_ativos := v_alunos_ativos;
  alunos_ativos_mudanca := ROUND((((v_alunos_ativos - v_alunos_ativos_anterior)::NUMERIC / COALESCE(NULLIF(v_alunos_ativos_anterior, 0), 1)) * 100), 1);
  receita_mes := v_receita_mes;
  receita_mes_mudanca := ROUND((((v_receita_mes - v_receita_mes_anterior)::NUMERIC / COALESCE(NULLIF(v_receita_mes_anterior, 0), 1)) * 100), 1);
  taxa_inadimplencia := v_taxa_inadimplencia;
  taxa_inadimplencia_mudanca := ROUND(v_taxa_inadimplencia - v_taxa_inadimplencia_anterior, 1);
  novas_matriculas := v_novas_matriculas;
  novas_matriculas_mudanca := ROUND((((v_novas_matriculas - v_novas_matriculas_anterior)::NUMERIC / COALESCE(NULLIF(v_novas_matriculas_anterior, 0), 1)) * 100), 1);

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID) TO authenticated, service_role;

COMMIT;
