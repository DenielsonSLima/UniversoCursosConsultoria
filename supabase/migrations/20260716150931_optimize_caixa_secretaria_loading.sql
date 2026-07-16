-- Consolida os dados iniciais do Caixa e das carteirinhas da Secretaria em
-- respostas pequenas, eliminando waterfalls e downloads de milhares de linhas.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_caixa_dashboard_secure(
  p_polo_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_principal_polo_id constant uuid := '44444444-4444-4444-4444-444444444444';
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (p_polo_id IS NULL AND public.is_gestor_global())
       OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
     ) THEN
    RAISE EXCEPTION 'Acesso ao caixa fora do escopo autorizado.' USING ERRCODE = '42501';
  END IF;

  WITH account_receipts AS MATERIALIZED (
    SELECT cr.conta_bancaria_id, SUM(COALESCE(cr.valor_pago, cr.valor, 0)) AS total
    FROM public.contas_receber cr
    WHERE cr.status = 'PAGO' AND cr.conta_bancaria_id IS NOT NULL
    GROUP BY cr.conta_bancaria_id
  ),
  account_payments AS MATERIALIZED (
    SELECT cp.conta_bancaria_id, SUM(COALESCE(cp.valor_pago, cp.valor, 0)) AS total
    FROM public.contas_pagar cp
    WHERE cp.status = 'PAGO' AND cp.conta_bancaria_id IS NOT NULL
    GROUP BY cp.conta_bancaria_id
  ),
  transfer_in AS MATERIALIZED (
    SELECT tc.conta_destino_id AS conta_id, SUM(COALESCE(tc.valor, 0)) AS total
    FROM public.transferencias_contas tc
    WHERE tc.conta_destino_id IS NOT NULL
    GROUP BY tc.conta_destino_id
  ),
  transfer_out AS MATERIALIZED (
    SELECT tc.conta_origem_id AS conta_id, SUM(COALESCE(tc.valor, 0)) AS total
    FROM public.transferencias_contas tc
    WHERE tc.conta_origem_id IS NOT NULL
    GROUP BY tc.conta_origem_id
  ),
  accounts AS MATERIALIZED (
    SELECT
      cb.id,
      cb.banco,
      cb.agencia,
      cb.conta,
      cb.polo_id,
      COALESCE(po.nome, 'Polo Geral') AS polo_nome,
      (
        COALESCE(cb.saldo_inicial, 0)
        + COALESCE(ar.total, 0)
        - COALESCE(ap.total, 0)
        + COALESCE(ti.total, 0)
        - COALESCE(tout.total, 0)
      ) AS saldo_atual
    FROM public.contas_bancarias cb
    LEFT JOIN public.polos po ON po.id = cb.polo_id
    LEFT JOIN account_receipts ar ON ar.conta_bancaria_id = cb.id
    LEFT JOIN account_payments ap ON ap.conta_bancaria_id = cb.id
    LEFT JOIN transfer_in ti ON ti.conta_id = cb.id
    LEFT JOIN transfer_out tout ON tout.conta_id = cb.id
    WHERE p_polo_id IS NULL
       OR cb.polo_id = p_polo_id
       OR (p_polo_id = v_principal_polo_id AND cb.polo_id IS NULL)
  ),
  receivables_open AS MATERIALIZED (
    SELECT cr.categoria, cr.valor, cr.status, cr.data_vencimento
    FROM public.contas_receber cr
    WHERE cr.status IN ('PENDENTE', 'VENCIDO')
      AND (
        p_polo_id IS NULL
        OR cr.polo_id = p_polo_id
        OR (p_polo_id = v_principal_polo_id AND cr.polo_id IS NULL)
      )
  ),
  payables_open AS MATERIALIZED (
    SELECT cp.categoria, cp.valor
    FROM public.contas_pagar cp
    WHERE cp.status IN ('PENDENTE', 'VENCIDO')
      AND (
        p_polo_id IS NULL
        OR cp.polo_id = p_polo_id
        OR (p_polo_id = v_principal_polo_id AND cp.polo_id IS NULL)
      )
  ),
  receivable_categories AS (
    SELECT category, SUM(value) AS value
    FROM (
      VALUES
        ('MENSALIDADE'::text, 0::numeric),
        ('OUTROS_CREDITOS'::text, 0::numeric),
        ('ADIANTAMENTO_TOMADO'::text, 0::numeric)
      UNION ALL
      SELECT COALESCE(ro.categoria, 'OUTROS_CREDITOS'), COALESCE(ro.valor, 0)
      FROM receivables_open ro
    ) source(category, value)
    GROUP BY category
  ),
  payable_categories AS (
    SELECT category, SUM(value) AS value
    FROM (
      VALUES
        ('DESPESA_VARIAVEL'::text, 0::numeric),
        ('DESPESA_ADMINISTRATIVA'::text, 0::numeric),
        ('OUTRAS_DESPESAS'::text, 0::numeric),
        ('ADIANTAMENTO_CEDIDO'::text, 0::numeric)
      UNION ALL
      SELECT COALESCE(po.categoria, 'OUTRAS_DESPESAS'), COALESCE(po.valor, 0)
      FROM payables_open po
    ) source(category, value)
    GROUP BY category
  ),
  months AS (
    SELECT
      idx,
      (date_trunc('month', CURRENT_DATE) - ((2 - idx) * INTERVAL '1 month'))::date AS month_start
    FROM generate_series(0, 2) idx
  ),
  paid_receivables AS MATERIALIZED (
    SELECT date_trunc('month', cr.data_pagamento)::date AS month_start,
           SUM(COALESCE(cr.valor_pago, 0)) AS total
    FROM public.contas_receber cr
    WHERE cr.status = 'PAGO'
      AND cr.data_pagamento >= (date_trunc('month', CURRENT_DATE) - INTERVAL '2 months')::date
      AND cr.data_pagamento < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    GROUP BY date_trunc('month', cr.data_pagamento)::date
  ),
  paid_payables AS MATERIALIZED (
    SELECT date_trunc('month', cp.data_pagamento)::date AS month_start,
           SUM(COALESCE(cp.valor_pago, 0)) AS total
    FROM public.contas_pagar cp
    WHERE cp.status = 'PAGO'
      AND cp.data_pagamento >= (date_trunc('month', CURRENT_DATE) - INTERVAL '2 months')::date
      AND cp.data_pagamento < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
      AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
    GROUP BY date_trunc('month', cp.data_pagamento)::date
  ),
  monthly_flow AS (
    SELECT
      m.idx,
      TO_CHAR(m.month_start, 'MM') AS mes,
      EXTRACT(YEAR FROM m.month_start)::integer AS ano,
      CASE EXTRACT(MONTH FROM m.month_start)::integer
        WHEN 1 THEN 'Janeiro' WHEN 2 THEN 'Fevereiro' WHEN 3 THEN 'Março'
        WHEN 4 THEN 'Abril' WHEN 5 THEN 'Maio' WHEN 6 THEN 'Junho'
        WHEN 7 THEN 'Julho' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Setembro'
        WHEN 10 THEN 'Outubro' WHEN 11 THEN 'Novembro' ELSE 'Dezembro'
      END AS mes_nome,
      COALESCE(pr.total, 0) AS creditos,
      COALESCE(pp.total, 0) AS debitos
    FROM months m
    LEFT JOIN paid_receivables pr ON pr.month_start = m.month_start
    LEFT JOIN paid_payables pp ON pp.month_start = m.month_start
  )
  SELECT jsonb_build_object(
    'saldo_total_contas', COALESCE((SELECT SUM(a.saldo_atual) FROM accounts a), 0),
    'saldos_individuais', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'banco', a.banco,
        'agencia', a.agencia,
        'conta', a.conta,
        'saldo_atual', a.saldo_atual,
        'polo_nome', a.polo_nome,
        'polo_id', a.polo_id
      ) ORDER BY a.polo_nome, a.banco, a.conta)
      FROM accounts a
    ), '[]'::jsonb),
    'total_receber', COALESCE((SELECT SUM(ro.valor) FROM receivables_open ro), 0),
    'receber_por_tipo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('categoria', rc.category, 'valor', rc.value) ORDER BY rc.category)
      FROM receivable_categories rc
    ), '[]'::jsonb),
    'total_pagar', COALESCE((SELECT SUM(po.valor) FROM payables_open po), 0),
    'pagar_por_tipo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('categoria', pc.category, 'valor', pc.value) ORDER BY pc.category)
      FROM payable_categories pc
    ), '[]'::jsonb),
    'mensalidades_em_atraso', jsonb_build_object(
      'quantidade', (SELECT COUNT(*) FROM receivables_open ro WHERE ro.categoria = 'MENSALIDADE' AND (ro.status = 'VENCIDO' OR (ro.status = 'PENDENTE' AND ro.data_vencimento < CURRENT_DATE))),
      'valor_total', COALESCE((SELECT SUM(ro.valor) FROM receivables_open ro WHERE ro.categoria = 'MENSALIDADE' AND (ro.status = 'VENCIDO' OR (ro.status = 'PENDENTE' AND ro.data_vencimento < CURRENT_DATE))), 0)
    ),
    'fluxo_3_meses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'mes', mf.mes,
        'ano', mf.ano,
        'mes_nome', mf.mes_nome,
        'creditos', mf.creditos,
        'debitos', mf.debitos
      ) ORDER BY mf.idx)
      FROM monthly_flow mf
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_secretaria_carteirinha_workspace_secure(
  p_polo_id uuid
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
  IF auth.role() <> 'service_role' AND NOT public.is_gestor_for_polo(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso às carteirinhas fora do escopo autorizado.' USING ERRCODE = '42501';
  END IF;

  WITH eligible AS MATERIALIZED (
    SELECT
      m.id AS enrollment_id,
      m.data_matricula,
      m.turma_id,
      t.nome AS turma_nome,
      t.codigo AS turma_codigo,
      t.polo_id,
      c.nome AS curso_nome,
      p.id AS aluno_id,
      p.nome AS aluno_nome,
      p.cpf_cnpj,
      p.rg,
      p.data_nascimento,
      p.foto_url,
      p.tipo_documento
    FROM public.matriculas m
    JOIN public.parceiros p ON p.id = m.aluno_id
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE m.status = 'ATIVO'
      AND t.status = 'EM_ANDAMENTO'
      AND t.polo_id = p_polo_id
      AND c.modalidade = 'TECNICO'
  ),
  technical_classes AS MATERIALIZED (
    SELECT t.id, t.codigo, t.nome, t.polo_id, t.turno, c.nome AS curso_nome
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.status = 'EM_ANDAMENTO'
      AND t.polo_id = p_polo_id
      AND c.modalidade = 'TECNICO'
  )
  SELECT jsonb_build_object(
    'enrollments', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.data_matricula DESC, e.enrollment_id)
      FROM eligible e
    ), '[]'::jsonb),
    'classes', COALESCE((
      SELECT jsonb_agg(to_jsonb(tc) ORDER BY tc.nome, tc.id)
      FROM technical_classes tc
    ), '[]'::jsonb),
    'institutional_data', public.get_dados_institucionais_polo(p_polo_id),
    'academic_config', COALESCE((
      SELECT dt.conteudo FROM public.documentos_templates dt WHERE dt.id = 'academicos_config'
    ), '{}'::jsonb),
    'template', COALESCE((
      SELECT dt.conteudo FROM public.documentos_templates dt WHERE dt.id = 'carteirinha'
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_caixa_dashboard_secure(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_secretaria_carteirinha_workspace_secure(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_caixa_dashboard_secure(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_secretaria_carteirinha_workspace_secure(uuid) TO authenticated, service_role;

COMMIT;
