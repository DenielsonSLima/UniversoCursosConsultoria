BEGIN;

CREATE OR REPLACE FUNCTION public.dashboard_aluno_matches_modalidades(
  p_aluno_id UUID,
  p_modalidades TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  IF COALESCE(array_length(p_modalidades, 1), 0) = 0 THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE m.aluno_id = p_aluno_id
      AND c.modalidade = ANY(p_modalidades)
      AND upper(m.status) IN ('ATIVO', 'CONCLUIDO', 'CONCLUÍDO', 'PENDENTE')
  );
END;
$$ LANGUAGE plpgsql STABLE;

DROP FUNCTION IF EXISTS public.get_dashboard_kpis_filtered(UUID, TEXT[]);

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis_filtered(
  p_polo_id UUID DEFAULT NULL,
  p_modalidades TEXT[] DEFAULT NULL
)
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
    AND p.status = 'ATIVO'
    AND (p_polo_id IS NULL OR p.polo_id = p_polo_id OR p_polo_id = ANY(p.polo_ids))
    AND public.dashboard_aluno_matches_modalidades(p.id, p_modalidades);

  SELECT COUNT(*) INTO v_alunos_ativos_anterior
  FROM public.parceiros p
  WHERE p.tipo = 'Aluno'
    AND p.status = 'ATIVO'
    AND p.created_at < v_inicio_mes_atual
    AND (p_polo_id IS NULL OR p.polo_id = p_polo_id OR p_polo_id = ANY(p.polo_ids))
    AND public.dashboard_aluno_matches_modalidades(p.id, p_modalidades);

  SELECT COALESCE(SUM(COALESCE(cr.valor_pago, cr.valor)), 0) INTO v_receita_mes
  FROM public.contas_receber cr
  WHERE cr.status = 'PAGO'
    AND (cr.data_pagamento >= v_inicio_mes_atual AND cr.data_pagamento <= v_fim_mes_atual
      OR (cr.data_pagamento IS NULL AND cr.data_vencimento >= v_inicio_mes_atual AND cr.data_vencimento <= v_fim_mes_atual))
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    AND public.dashboard_aluno_matches_modalidades(cr.cliente_id, p_modalidades);

  SELECT COALESCE(SUM(COALESCE(cr.valor_pago, cr.valor)), 0) INTO v_receita_mes_anterior
  FROM public.contas_receber cr
  WHERE cr.status = 'PAGO'
    AND (cr.data_pagamento >= v_inicio_mes_anterior AND cr.data_pagamento <= v_fim_mes_anterior
      OR (cr.data_pagamento IS NULL AND cr.data_vencimento >= v_inicio_mes_anterior AND cr.data_vencimento <= v_fim_mes_anterior))
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    AND public.dashboard_aluno_matches_modalidades(cr.cliente_id, p_modalidades);

  SELECT COALESCE(SUM(cr.valor), 0) INTO v_total_vencido_nao_pago
  FROM public.contas_receber cr
  WHERE cr.status != 'PAGO'
    AND cr.data_vencimento < CURRENT_DATE
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    AND public.dashboard_aluno_matches_modalidades(cr.cliente_id, p_modalidades);

  SELECT COALESCE(SUM(COALESCE(cr.valor_pago, cr.valor)), 0) INTO v_total_recebido
  FROM public.contas_receber cr
  WHERE cr.status = 'PAGO'
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    AND public.dashboard_aluno_matches_modalidades(cr.cliente_id, p_modalidades);

  v_taxa_inadimplencia := ROUND(
    ((v_total_vencido_nao_pago::NUMERIC / COALESCE(NULLIF(v_total_recebido + v_total_vencido_nao_pago, 0), 1)) * 100),
    1
  );

  SELECT COALESCE(SUM(cr.valor), 0) INTO v_total_vencido_nao_pago_anterior
  FROM public.contas_receber cr
  WHERE cr.status != 'PAGO'
    AND cr.data_vencimento <= v_fim_mes_anterior
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    AND public.dashboard_aluno_matches_modalidades(cr.cliente_id, p_modalidades);

  SELECT COALESCE(SUM(COALESCE(cr.valor_pago, cr.valor)), 0) INTO v_total_recebido_anterior
  FROM public.contas_receber cr
  WHERE cr.status = 'PAGO'
    AND (cr.data_pagamento <= v_fim_mes_anterior OR (cr.data_pagamento IS NULL AND cr.data_vencimento <= v_fim_mes_anterior))
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    AND public.dashboard_aluno_matches_modalidades(cr.cliente_id, p_modalidades);

  v_taxa_inadimplencia_anterior := ROUND(
    ((v_total_vencido_nao_pago_anterior::NUMERIC / COALESCE(NULLIF(v_total_recebido_anterior + v_total_vencido_nao_pago_anterior, 0), 1)) * 100),
    1
  );

  SELECT COUNT(*) INTO v_novas_matriculas
  FROM public.matriculas m
  JOIN public.parceiros p ON p.id = m.aluno_id
  JOIN public.turmas t ON t.id = m.turma_id
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE m.data_matricula >= v_inicio_mes_atual
    AND m.data_matricula <= v_fim_mes_atual
    AND (p_polo_id IS NULL OR p.polo_id = p_polo_id OR p_polo_id = ANY(p.polo_ids))
    AND (COALESCE(array_length(p_modalidades, 1), 0) = 0 OR c.modalidade = ANY(p_modalidades));

  SELECT COUNT(*) INTO v_novas_matriculas_anterior
  FROM public.matriculas m
  JOIN public.parceiros p ON p.id = m.aluno_id
  JOIN public.turmas t ON t.id = m.turma_id
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE m.data_matricula >= v_inicio_mes_anterior
    AND m.data_matricula <= v_fim_mes_anterior
    AND (p_polo_id IS NULL OR p.polo_id = p_polo_id OR p_polo_id = ANY(p.polo_ids))
    AND (COALESCE(array_length(p_modalidades, 1), 0) = 0 OR c.modalidade = ANY(p_modalidades));

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
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.get_dashboard_chart_data_filtered(UUID, INTEGER, TEXT[]);

CREATE OR REPLACE FUNCTION public.get_dashboard_chart_data_filtered(
  p_polo_id UUID DEFAULT NULL,
  p_months INTEGER DEFAULT 6,
  p_modalidades TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  mes_num DOUBLE PRECISION,
  ano_num DOUBLE PRECISION,
  mes_nome TEXT,
  receitas NUMERIC,
  despesas NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH meses AS (
    SELECT
      EXTRACT(MONTH FROM date_series)::DOUBLE PRECISION AS m_num,
      EXTRACT(YEAR FROM date_series)::DOUBLE PRECISION AS a_num,
      date_series::DATE AS m_date
    FROM generate_series(
      date_trunc('month', CURRENT_DATE) - (p_months - 1 || ' month')::INTERVAL,
      date_trunc('month', CURRENT_DATE),
      '1 month'::INTERVAL
    ) date_series
  )
  SELECT
    m.m_num AS mes_num,
    m.a_num AS ano_num,
    CASE m.m_num::INTEGER
      WHEN 1 THEN 'Jan' WHEN 2 THEN 'Fev' WHEN 3 THEN 'Mar' WHEN 4 THEN 'Abr'
      WHEN 5 THEN 'Mai' WHEN 6 THEN 'Jun' WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago'
      WHEN 9 THEN 'Set' WHEN 10 THEN 'Out' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dez'
    END AS mes_nome,
    COALESCE((
      SELECT SUM(COALESCE(cr.valor_pago, cr.valor))::NUMERIC
      FROM public.contas_receber cr
      WHERE cr.status = 'PAGO'
        AND (cr.data_pagamento >= m.m_date AND cr.data_pagamento < (m.m_date + INTERVAL '1 month')::DATE
          OR (cr.data_pagamento IS NULL AND cr.data_vencimento >= m.m_date AND cr.data_vencimento < (m.m_date + INTERVAL '1 month')::DATE))
        AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
        AND public.dashboard_aluno_matches_modalidades(cr.cliente_id, p_modalidades)
    ), 0)::NUMERIC AS receitas,
    COALESCE((
      SELECT SUM(COALESCE(cp.valor_pago, cp.valor))::NUMERIC
      FROM public.contas_pagar cp
      WHERE cp.status = 'PAGO'
        AND (cp.data_pagamento >= m.m_date AND cp.data_pagamento < (m.m_date + INTERVAL '1 month')::DATE
          OR (cp.data_pagamento IS NULL AND cp.data_vencimento >= m.m_date AND cp.data_vencimento < (m.m_date + INTERVAL '1 month')::DATE))
        AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
    ), 0)::NUMERIC AS despesas
  FROM meses m
  ORDER BY m.m_date ASC;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.get_dashboard_recent_activity_filtered(UUID, INTEGER, TEXT[]);

CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity_filtered(
  p_polo_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 5,
  p_modalidades TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  tipo_atividade TEXT,
  titulo TEXT,
  descricao TEXT,
  data_evento TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  (
    SELECT
      'matricula'::TEXT AS tipo_atividade,
      p.nome AS titulo,
      'Realizou matrícula no curso ' || c.nome || ' - ' || t.nome AS descricao,
      m.data_matricula AS data_evento
    FROM public.matriculas m
    JOIN public.parceiros p ON m.aluno_id = p.id
    JOIN public.turmas t ON m.turma_id = t.id
    JOIN public.cursos c ON t.curso_id = c.id
    WHERE (p_polo_id IS NULL OR p.polo_id = p_polo_id OR p_polo_id = ANY(p.polo_ids))
      AND (COALESCE(array_length(p_modalidades, 1), 0) = 0 OR c.modalidade = ANY(p_modalidades))
  )
  UNION ALL
  (
    SELECT
      'pagamento'::TEXT AS tipo_atividade,
      p.nome AS titulo,
      'Efetuou o pagamento de: ' || cr.descricao AS descricao,
      COALESCE(cr.data_pagamento::TIMESTAMPTZ, cr.created_at) AS data_evento
    FROM public.contas_receber cr
    JOIN public.parceiros p ON cr.cliente_id = p.id
    WHERE cr.status = 'PAGO'
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
      AND public.dashboard_aluno_matches_modalidades(cr.cliente_id, p_modalidades)
  )
  ORDER BY data_evento DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.dashboard_aluno_matches_modalidades(UUID, TEXT[]) SET search_path = public;
ALTER FUNCTION public.get_dashboard_kpis_filtered(UUID, TEXT[]) SET search_path = public;
ALTER FUNCTION public.get_dashboard_chart_data_filtered(UUID, INTEGER, TEXT[]) SET search_path = public;
ALTER FUNCTION public.get_dashboard_recent_activity_filtered(UUID, INTEGER, TEXT[]) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.dashboard_aluno_matches_modalidades(UUID, TEXT[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_kpis_filtered(UUID, TEXT[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_chart_data_filtered(UUID, INTEGER, TEXT[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_recent_activity_filtered(UUID, INTEGER, TEXT[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.dashboard_aluno_matches_modalidades(UUID, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis_filtered(UUID, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_chart_data_filtered(UUID, INTEGER, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_activity_filtered(UUID, INTEGER, TEXT[]) TO authenticated, service_role;

COMMIT;
