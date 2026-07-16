-- Evita duas buscas laterais por matrícula: as parcelas da turma são lidas
-- uma vez e reutilizadas no resumo, nos agregados e na próxima cobrança.

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

  WITH receivables AS MATERIALIZED (
    SELECT
      cr.id,
      cr.matricula_id,
      cr.valor,
      cr.valor_pago,
      cr.status,
      cr.data_vencimento,
      cr.tipo_lancamento,
      cr.descricao,
      COALESCE(cr.asaas_invoice_url, cr.gateway_invoice_url) AS cobranca_url
    FROM public.contas_receber cr
    WHERE cr.turma_id = p_turma_id
  ),
  summary AS (
    SELECT
      COALESCE(SUM(r.valor), 0) AS total,
      COALESCE(SUM(COALESCE(r.valor_pago, r.valor)) FILTER (WHERE r.status = 'PAGO'), 0) AS received,
      COALESCE(SUM(r.valor) FILTER (
        WHERE r.status = 'VENCIDO'
           OR (r.status = 'PENDENTE' AND r.data_vencimento < (now() AT TIME ZONE 'America/Maceio')::date)
      ), 0) AS overdue
    FROM receivables r
  ),
  financial_by_enrollment AS (
    SELECT
      r.matricula_id,
      MIN(r.valor) FILTER (WHERE r.tipo_lancamento = 'MATRICULA') AS valor_matricula,
      MIN(r.valor) FILTER (WHERE r.tipo_lancamento = 'PARCELA') AS valor_mensalidade,
      BOOL_OR(
        r.status = 'VENCIDO'
        OR (r.status = 'PENDENTE' AND r.data_vencimento < (now() AT TIME ZONE 'America/Maceio')::date)
      ) AS has_overdue,
      COUNT(*) FILTER (WHERE r.status = 'PAGO')::integer AS parcelas_pagas,
      COUNT(*)::integer AS total_parcelas
    FROM receivables r
    WHERE r.matricula_id IS NOT NULL
    GROUP BY r.matricula_id
  ),
  next_charges AS (
    SELECT DISTINCT ON (r.matricula_id)
      r.matricula_id,
      r.cobranca_url,
      r.descricao AS cobranca_descricao
    FROM receivables r
    WHERE r.matricula_id IS NOT NULL
      AND r.status IN ('PENDENTE', 'VENCIDO')
      AND r.cobranca_url IS NOT NULL
    ORDER BY r.matricula_id, r.data_vencimento, r.id
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
      nc.cobranca_url,
      nc.cobranca_descricao
    FROM public.matriculas m
    JOIN public.parceiros pa ON pa.id = m.aluno_id
    LEFT JOIN financial_by_enrollment fin ON fin.matricula_id = m.id
    LEFT JOIN next_charges nc ON nc.matricula_id = m.id
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

COMMIT;
