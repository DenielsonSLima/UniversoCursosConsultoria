-- ============================================================
-- Migração: Função get_despesas_summary para cálculo no Supabase
-- ============================================================

CREATE OR REPLACE FUNCTION get_despesas_summary(
  p_tipo TEXT,
  p_polo_id UUID DEFAULT NULL,
  p_categoria_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_due_start DATE DEFAULT NULL,
  p_due_end DATE DEFAULT NULL,
  p_status_scope TEXT DEFAULT 'todos',
  p_turma_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_value NUMERIC(15, 2),
  paid_value NUMERIC(15, 2),
  pending_value NUMERIC(15, 2),
  vencidos_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_due_start DATE;
  v_due_end DATE;
BEGIN
  -- Se o status_scope for 'mes_atual', define data inicial e final do mês corrente
  IF p_status_scope = 'mes_atual' THEN
    v_due_start := date_trunc('month', current_date)::date;
    v_due_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  ELSE
    v_due_start := p_due_start;
    v_due_end := p_due_end;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(d.valor), 0.00)::NUMERIC(15,2) AS total_value,
    COALESCE(SUM(CASE WHEN d.status = 'PAGO' THEN COALESCE(d.valor_pago, d.valor) ELSE 0.00 END), 0.00)::NUMERIC(15,2) AS paid_value,
    COALESCE(SUM(CASE WHEN d.status IN ('PENDENTE', 'VENCIDO') THEN d.valor ELSE 0.00 END), 0.00)::NUMERIC(15,2) AS pending_value,
    COUNT(CASE WHEN d.status = 'VENCIDO' OR (d.status = 'PENDENTE' AND d.data_vencimento < CURRENT_DATE) THEN 1 END)::BIGINT AS vencidos_count
  FROM despesas_lancamentos d
  LEFT JOIN categorias_financeiras c ON d.categoria_financeira_id = c.id
  LEFT JOIN parceiros p ON d.fornecedor_id = p.id
  LEFT JOIN polos po ON d.polo_id = po.id
  WHERE d.tipo = p_tipo
    AND (p_polo_id IS NULL OR d.polo_id = p_polo_id)
    AND (p_categoria_id IS NULL OR d.categoria_financeira_id = p_categoria_id)
    AND (p_turma_id IS NULL OR d.turma_id = p_turma_id)
    AND (v_due_start IS NULL OR d.data_vencimento >= v_due_start)
    AND (v_due_end IS NULL OR d.data_vencimento <= v_due_end)
    AND (
      p_status_scope <> 'em_aberto' 
      OR d.status IN ('PENDENTE', 'VENCIDO')
    )
    AND (
      p_search IS NULL OR p_search = '' OR
      d.descricao ILIKE '%' || p_search || '%' OR
      c.nome ILIKE '%' || p_search || '%' OR
      p.nome ILIKE '%' || p_search || '%' OR
      po.nome ILIKE '%' || p_search || '%'
    );
END;
$$;
