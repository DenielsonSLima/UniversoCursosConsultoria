-- Migration: Create get_dashboard_kpis, get_dashboard_chart_data and get_dashboard_recent_activity RPCs
-- Date: 2026-06-19

BEGIN;

-- 1. Function: get_dashboard_kpis
DROP FUNCTION IF EXISTS public.get_dashboard_kpis(UUID);

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
  v_alunos_ativos_mudanca NUMERIC;
  
  v_receita_mes NUMERIC;
  v_receita_mes_anterior NUMERIC;
  v_receita_mes_mudanca NUMERIC;
  
  v_total_vencido_nao_pago NUMERIC;
  v_total_recebido NUMERIC;
  v_taxa_inadimplencia NUMERIC;
  
  v_total_vencido_nao_pago_anterior NUMERIC;
  v_total_recebido_anterior NUMERIC;
  v_taxa_inadimplencia_anterior NUMERIC;
  v_taxa_inadimplencia_mudanca NUMERIC;
  
  v_novas_matriculas BIGINT;
  v_novas_matriculas_anterior BIGINT;
  v_novas_matriculas_mudanca NUMERIC;
BEGIN
  -- 1. Alunos Ativos
  SELECT COUNT(*) INTO v_alunos_ativos 
  FROM public.parceiros 
  WHERE tipo = 'Aluno' 
    AND status = 'ATIVO' 
    AND (p_polo_id IS NULL OR polo_id = p_polo_id OR p_polo_id = ANY(polo_ids));
    
  SELECT COUNT(*) INTO v_alunos_ativos_anterior 
  FROM public.parceiros 
  WHERE tipo = 'Aluno' 
    AND status = 'ATIVO' 
    AND created_at < v_inicio_mes_atual 
    AND (p_polo_id IS NULL OR polo_id = p_polo_id OR p_polo_id = ANY(polo_ids));
    
  v_alunos_ativos_mudanca := ROUND(
    (((v_alunos_ativos - v_alunos_ativos_anterior)::NUMERIC / COALESCE(NULLIF(v_alunos_ativos_anterior, 0), 1)) * 100),
    1
  );

  -- 2. Receita do Mês (Valores pagos no mês atual vs mês anterior)
  SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0) INTO v_receita_mes 
  FROM public.contas_receber 
  WHERE status = 'PAGO' 
    AND (data_pagamento >= v_inicio_mes_atual AND data_pagamento <= v_fim_mes_atual 
         OR (data_pagamento IS NULL AND data_vencimento >= v_inicio_mes_atual AND data_vencimento <= v_fim_mes_atual))
    AND (p_polo_id IS NULL OR polo_id = p_polo_id);
    
  SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0) INTO v_receita_mes_anterior 
  FROM public.contas_receber 
  WHERE status = 'PAGO' 
    AND (data_pagamento >= v_inicio_mes_anterior AND data_pagamento <= v_fim_mes_anterior
         OR (data_pagamento IS NULL AND data_vencimento >= v_inicio_mes_anterior AND data_vencimento <= v_fim_mes_anterior))
    AND (p_polo_id IS NULL OR polo_id = p_polo_id);
    
  v_receita_mes_mudanca := ROUND(
    (((v_receita_mes - v_receita_mes_anterior)::NUMERIC / COALESCE(NULLIF(v_receita_mes_anterior, 0), 1)) * 100),
    1
  );

  -- 3. Inadimplência
  SELECT COALESCE(SUM(valor), 0) INTO v_total_vencido_nao_pago 
  FROM public.contas_receber 
  WHERE status != 'PAGO' 
    AND data_vencimento < CURRENT_DATE
    AND (p_polo_id IS NULL OR polo_id = p_polo_id);
    
  SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0) INTO v_total_recebido 
  FROM public.contas_receber 
  WHERE status = 'PAGO' 
    AND (p_polo_id IS NULL OR polo_id = p_polo_id);
    
  v_taxa_inadimplencia := ROUND(
    ((v_total_vencido_nao_pago::NUMERIC / COALESCE(NULLIF(v_total_recebido + v_total_vencido_nao_pago, 0), 1)) * 100),
    1
  );
  
  -- Mes Anterior
  SELECT COALESCE(SUM(valor), 0) INTO v_total_vencido_nao_pago_anterior 
  FROM public.contas_receber 
  WHERE status != 'PAGO' 
    AND data_vencimento <= v_fim_mes_anterior
    AND (p_polo_id IS NULL OR polo_id = p_polo_id);
    
  SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0) INTO v_total_recebido_anterior 
  FROM public.contas_receber 
  WHERE status = 'PAGO' 
    AND (data_pagamento <= v_fim_mes_anterior 
         OR (data_pagamento IS NULL AND data_vencimento <= v_fim_mes_anterior))
    AND (p_polo_id IS NULL OR polo_id = p_polo_id);
    
  v_taxa_inadimplencia_anterior := ROUND(
    ((v_total_vencido_nao_pago_anterior::NUMERIC / COALESCE(NULLIF(v_total_recebido_anterior + v_total_vencido_nao_pago_anterior, 0), 1)) * 100),
    1
  );
  
  v_taxa_inadimplencia_mudanca := ROUND(v_taxa_inadimplencia - v_taxa_inadimplencia_anterior, 1);

  -- 4. Novas Matrículas
  SELECT COUNT(*) INTO v_novas_matriculas 
  FROM public.matriculas m
  JOIN public.parceiros p ON m.aluno_id = p.id
  WHERE m.data_matricula >= v_inicio_mes_atual AND m.data_matricula <= v_fim_mes_atual
    AND (p_polo_id IS NULL OR p.polo_id = p_polo_id OR p_polo_id = ANY(p.polo_ids));
    
  SELECT COUNT(*) INTO v_novas_matriculas_anterior 
  FROM public.matriculas m
  JOIN public.parceiros p ON m.aluno_id = p.id
  WHERE m.data_matricula >= v_inicio_mes_anterior AND m.data_matricula <= v_fim_mes_anterior
    AND (p_polo_id IS NULL OR p.polo_id = p_polo_id OR p_polo_id = ANY(p.polo_ids));
    
  v_novas_matriculas_mudanca := ROUND(
    (((v_novas_matriculas - v_novas_matriculas_anterior)::NUMERIC / COALESCE(NULLIF(v_novas_matriculas_anterior, 0), 1)) * 100),
    1
  );

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;


-- 2. Function: get_dashboard_chart_data
DROP FUNCTION IF EXISTS public.get_dashboard_chart_data(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_dashboard_chart_data(
  p_polo_id UUID DEFAULT NULL,
  p_months INTEGER DEFAULT 6
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
      SELECT SUM(COALESCE(valor_pago, valor))::NUMERIC
      FROM public.contas_receber
      WHERE status = 'PAGO'
        AND (data_pagamento >= m.m_date AND data_pagamento < (m.m_date + INTERVAL '1 month')::DATE
             OR (data_pagamento IS NULL AND data_vencimento >= m.m_date AND data_vencimento < (m.m_date + INTERVAL '1 month')::DATE))
        AND (p_polo_id IS NULL OR polo_id = p_polo_id)
    ), 0)::NUMERIC AS receitas,
    COALESCE((
      SELECT SUM(COALESCE(valor_pago, valor))::NUMERIC
      FROM public.contas_pagar
      WHERE status = 'PAGO'
        AND (data_pagamento >= m.m_date AND data_pagamento < (m.m_date + INTERVAL '1 month')::DATE
             OR (data_pagamento IS NULL AND data_vencimento >= m.m_date AND data_vencimento < (m.m_date + INTERVAL '1 month')::DATE))
        AND (p_polo_id IS NULL OR polo_id = p_polo_id)
    ), 0)::NUMERIC AS despesas
  FROM meses m
  ORDER BY m.m_date ASC;
END;
$$ LANGUAGE plpgsql;


-- 3. Function: get_dashboard_recent_activity
DROP FUNCTION IF EXISTS public.get_dashboard_recent_activity(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity(
  p_polo_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
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
    -- A. Novas Matrículas
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
  )
  UNION ALL
  (
    -- B. Pagamentos Recebidos
    SELECT 
      'pagamento'::TEXT AS tipo_atividade,
      p.nome AS titulo,
      'Efetuou o pagamento de: ' || cr.descricao AS descricao,
      COALESCE(cr.data_pagamento::TIMESTAMPTZ, cr.created_at) AS data_evento
    FROM public.contas_receber cr
    JOIN public.parceiros p ON cr.cliente_id = p.id
    WHERE cr.status = 'PAGO' 
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
  )
  UNION ALL
  (
    -- C. Novos Documentos Biblioteca
    SELECT 
      'documento'::TEXT AS tipo_atividade,
      d.author_name AS titulo,
      'Enviou o documento: ' || d.titulo AS descricao,
      d.created_at AS data_evento
    FROM public.biblioteca_documentos d
    WHERE (p_polo_id IS NULL OR d.polo_id = p_polo_id OR d.polo_id IS NULL)
  )
  ORDER BY data_evento DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMIT;
