BEGIN;

-- O evento é propositalmente leve: perfis com acesso ao Caixa podem receber
-- apenas a invalidação do polo permitido, sem liberar as linhas financeiras.
DROP POLICY IF EXISTS finance_realtime_events_select
  ON public.finance_realtime_events;

CREATE POLICY finance_realtime_events_select
  ON public.finance_realtime_events
  FOR SELECT
  TO authenticated
  USING (
    (
      aluno_id IS NOT NULL
      AND aluno_id = public.current_aluno_id()
    )
    OR (
      (
        (polo_id IS NULL AND public.is_gestor_global())
        OR (polo_id IS NOT NULL AND public.is_gestor_for_polo(polo_id))
      )
      AND (
        public.gestor_has_module('caixa')
        OR public.gestor_has_financeiro_tab('resumo')
        OR public.gestor_has_financeiro_tab('receber')
        OR public.gestor_has_tab('secretaria', 'recebimentos')
      )
    )
  );

-- Nenhuma baixa pode existir sem os fatos mínimos que compõem o Caixa.
ALTER TABLE public.contas_pagar
  ADD CONSTRAINT contas_pagar_pagamento_completo_chk
  CHECK (
    upper(status) <> 'PAGO'
    OR (
      conta_bancaria_id IS NOT NULL
      AND data_pagamento IS NOT NULL
      AND valor_pago IS NOT NULL
      AND valor_pago >= 0
    )
  ) NOT VALID;

ALTER TABLE public.contas_pagar
  VALIDATE CONSTRAINT contas_pagar_pagamento_completo_chk;

ALTER TABLE public.despesas_lancamentos
  ADD CONSTRAINT despesas_lancamentos_pagamento_completo_chk
  CHECK (
    upper(status) <> 'PAGO'
    OR (
      conta_bancaria_id IS NOT NULL
      AND data_pagamento IS NOT NULL
      AND valor_pago IS NOT NULL
      AND valor_pago >= 0
    )
  ) NOT VALID;

ALTER TABLE public.despesas_lancamentos
  VALIDATE CONSTRAINT despesas_lancamentos_pagamento_completo_chk;

-- Preserva o cálculo canônico já implantado e envolve a função com:
-- - guarda fail-closed mesmo sem claims;
-- - indicadores de conciliação que não contam pendências como conciliadas;
-- - contadores de qualidade que também detectam baixas sem data/conta.
ALTER FUNCTION public.get_caixa_prestacao_mensal_secure(uuid, date, integer)
  RENAME TO get_caixa_prestacao_mensal_v2_core;

REVOKE ALL ON FUNCTION public.get_caixa_prestacao_mensal_v2_core(
  uuid,
  date,
  integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_caixa_prestacao_mensal_v2_core(
  uuid,
  date,
  integer
) TO service_role;

CREATE FUNCTION public.get_caixa_prestacao_mensal_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE,
  p_meses_historico integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_inicio date;
  v_fim date;
  v_recebimentos_conciliados integer := 0;
  v_recebimentos_pendentes integer := 0;
  v_pagamentos_conciliados integer := 0;
  v_pagamentos_pendentes integer := 0;
  v_movimentos_sem_data integer := 0;
  v_movimentos_sem_polo integer := 0;
  v_receitas_sem_modalidade integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND public.gestor_has_any_global_module(ARRAY['caixa', 'financeiro'])
       )
       OR (
         p_polo_id IS NOT NULL
         AND public.gestor_has_any_module_for_polo(
           ARRAY['caixa', 'financeiro'],
           p_polo_id
         )
       )
     ) THEN
    RAISE EXCEPTION 'Acesso ao caixa fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  v_payload := public.get_caixa_prestacao_mensal_v2_core(
    p_polo_id,
    p_competencia,
    p_meses_historico
  );
  v_inicio := date_trunc('month', p_competencia)::date;
  v_fim := (v_inicio + interval '1 month')::date;

  SELECT
    count(*) FILTER (
      WHERE cr.conta_bancaria_id IS NOT NULL
        AND cr.polo_id IS NOT NULL
    )::integer,
    count(*) FILTER (
      WHERE cr.conta_bancaria_id IS NULL
        OR cr.polo_id IS NULL
    )::integer,
    count(*) FILTER (
      WHERE cr.polo_id IS NULL
    )::integer,
    count(*) FILTER (
      WHERE curso.modalidade IS NULL
        AND upper(coalesce(cr.categoria, '')) <> 'OUTROS_CREDITOS'
    )::integer
  INTO
    v_recebimentos_conciliados,
    v_recebimentos_pendentes,
    v_movimentos_sem_polo,
    v_receitas_sem_modalidade
  FROM public.contas_receber cr
  LEFT JOIN public.matriculas matricula
    ON matricula.id = cr.matricula_id
  LEFT JOIN public.turmas turma
    ON turma.id = coalesce(cr.turma_id, matricula.turma_id)
  LEFT JOIN public.cursos curso
    ON curso.id = turma.curso_id
  WHERE cr.status = 'PAGO'
    AND cr.data_pagamento >= v_inicio
    AND cr.data_pagamento < v_fim
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id);

  WITH pagamentos AS (
    SELECT
      cp.polo_id,
      cp.conta_bancaria_id,
      cp.data_pagamento
    FROM public.contas_pagar cp
    WHERE cp.status = 'PAGO'
      AND cp.despesa_lancamento_id IS NULL
      AND cp.data_pagamento >= v_inicio
      AND cp.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)

    UNION ALL

    SELECT
      dl.polo_id,
      dl.conta_bancaria_id,
      dl.data_pagamento
    FROM public.despesas_lancamentos dl
    WHERE dl.status = 'PAGO'
      AND dl.data_pagamento >= v_inicio
      AND dl.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
  )
  SELECT
    count(*) FILTER (
      WHERE conta_bancaria_id IS NOT NULL
        AND polo_id IS NOT NULL
    )::integer,
    count(*) FILTER (
      WHERE conta_bancaria_id IS NULL
        OR polo_id IS NULL
    )::integer,
    v_movimentos_sem_polo
      + count(*) FILTER (WHERE polo_id IS NULL)::integer
  INTO
    v_pagamentos_conciliados,
    v_pagamentos_pendentes,
    v_movimentos_sem_polo
  FROM pagamentos;

  SELECT
    (
      SELECT count(*)::integer
      FROM public.contas_receber cr
      WHERE cr.status = 'PAGO'
        AND cr.data_pagamento IS NULL
        AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    )
    + (
      SELECT count(*)::integer
      FROM public.contas_pagar cp
      WHERE cp.status = 'PAGO'
        AND cp.data_pagamento IS NULL
        AND cp.despesa_lancamento_id IS NULL
        AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
    )
    + (
      SELECT count(*)::integer
      FROM public.despesas_lancamentos dl
      WHERE dl.status = 'PAGO'
        AND dl.data_pagamento IS NULL
        AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
    )
  INTO v_movimentos_sem_data;

  v_payload := jsonb_set(
    v_payload,
    '{conciliacao,recebimentos_conciliados}',
    to_jsonb(v_recebimentos_conciliados),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{conciliacao,pagamentos_conciliados}',
    to_jsonb(v_pagamentos_conciliados),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{conciliacao,pendentes}',
    to_jsonb(
      v_recebimentos_pendentes
      + v_pagamentos_pendentes
      + v_movimentos_sem_data
    ),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{qualidade_dados,movimentos_sem_polo}',
    to_jsonb(v_movimentos_sem_polo),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{qualidade_dados,pagamentos_sem_conta}',
    to_jsonb(v_recebimentos_pendentes + v_pagamentos_pendentes),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{qualidade_dados,pagamentos_sem_data}',
    to_jsonb(v_movimentos_sem_data),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{qualidade_dados,receitas_sem_modalidade}',
    to_jsonb(v_receitas_sem_modalidade),
    true
  );

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_caixa_prestacao_mensal_secure(
  uuid,
  date,
  integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_caixa_prestacao_mensal_secure(
  uuid,
  date,
  integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_caixa_prestacao_mensal_secure(
  uuid,
  date,
  integer
) IS
  'Prestação mensal canônica do Caixa com autorização fail-closed e conciliação validada.';

COMMIT;
