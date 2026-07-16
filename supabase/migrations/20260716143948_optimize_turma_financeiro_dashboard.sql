-- Consolida resumo e situação financeira dos alunos de uma turma em uma única
-- leitura agregada. A autorização é validada uma vez antes de acessar os dados.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_turma_financeiro_dashboard_secure(
  p_turma_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.can_write_turma(p_turma_id) THEN
    RAISE EXCEPTION 'Acesso financeiro à turma fora do escopo autorizado.' USING ERRCODE = '42501';
  END IF;

  WITH summary AS (
    SELECT
      COALESCE(SUM(cr.valor), 0) AS total,
      COALESCE(SUM(COALESCE(cr.valor_pago, cr.valor)) FILTER (WHERE cr.status = 'PAGO'), 0) AS received,
      COALESCE(SUM(cr.valor) FILTER (
        WHERE cr.status = 'VENCIDO'
           OR (cr.status = 'PENDENTE' AND cr.data_vencimento < (now() AT TIME ZONE 'America/Maceio')::date)
      ), 0) AS overdue
    FROM public.contas_receber cr
    WHERE cr.turma_id = p_turma_id
  ),
  students AS (
    SELECT
      m.id,
      pa.nome,
      m.data_matricula,
      pa.polo_id,
      COALESCE(fin.valor_matricula, 0) AS valor_matricula,
      COALESCE(fin.valor_mensalidade, 0) AS valor_mensalidade,
      CASE WHEN COALESCE(fin.has_overdue, false) THEN 'inadimplente' ELSE 'em_dia' END AS status,
      COALESCE(fin.parcelas_pagas, 0) AS parcelas_pagas,
      COALESCE(fin.total_parcelas, 0) AS total_parcelas,
      next_charge.cobranca_url,
      next_charge.cobranca_descricao
    FROM public.matriculas m
    JOIN public.parceiros pa ON pa.id = m.aluno_id
    LEFT JOIN LATERAL (
      SELECT
        MIN(cr.valor) FILTER (WHERE cr.tipo_lancamento = 'MATRICULA') AS valor_matricula,
        MIN(cr.valor) FILTER (WHERE cr.tipo_lancamento = 'PARCELA') AS valor_mensalidade,
        BOOL_OR(
          cr.status = 'VENCIDO'
          OR (cr.status = 'PENDENTE' AND cr.data_vencimento < (now() AT TIME ZONE 'America/Maceio')::date)
        ) AS has_overdue,
        COUNT(*) FILTER (WHERE cr.status = 'PAGO')::integer AS parcelas_pagas,
        COUNT(*)::integer AS total_parcelas
      FROM public.contas_receber cr
      WHERE cr.matricula_id = m.id
    ) fin ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(cr.asaas_invoice_url, cr.gateway_invoice_url) AS cobranca_url,
        cr.descricao AS cobranca_descricao
      FROM public.contas_receber cr
      WHERE cr.matricula_id = m.id
        AND cr.status IN ('PENDENTE', 'VENCIDO')
        AND COALESCE(cr.asaas_invoice_url, cr.gateway_invoice_url) IS NOT NULL
      ORDER BY cr.data_vencimento, cr.id
      LIMIT 1
    ) next_charge ON TRUE
    WHERE m.turma_id = p_turma_id
    ORDER BY pa.nome, m.id
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'total', s.total,
      'received', s.received,
      'overdue', s.overdue
    ),
    'students', COALESCE((SELECT jsonb_agg(to_jsonb(st) ORDER BY st.nome, st.id) FROM students st), '[]'::jsonb)
  )
  INTO v_result
  FROM summary s;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_turma_financeiro_dashboard_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_turma_financeiro_dashboard_secure(uuid) TO authenticated, service_role;

COMMIT;
