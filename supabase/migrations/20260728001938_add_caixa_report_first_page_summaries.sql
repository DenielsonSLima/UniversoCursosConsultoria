-- Enriquece a primeira página da prestação mensal sem transferir cálculos
-- financeiros para o frontend. O núcleo anterior permanece isolado e o novo
-- contrato agrega receitas por turma na mesma chamada segura.

ALTER FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  RENAME TO get_caixa_relatorio_mensal_detalhado_v1_core;

REVOKE ALL ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_v1_core(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_caixa_relatorio_resumo_turmas_core(
  p_polo_id uuid,
  p_inicio date,
  p_fim date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recebiveis AS MATERIALIZED (
    SELECT
      coalesce(cr.turma_id, matricula.turma_id) AS turma_id,
      coalesce(
        nullif(trim(concat_ws(' · ', turma.codigo, turma.nome)), ''),
        'Sem turma identificada'
      ) AS turma,
      coalesce(nullif(trim(curso.nome), ''), 'Curso não informado') AS curso,
      coalesce(nullif(upper(trim(curso.modalidade)), ''), 'OUTROS') AS modalidade,
      CASE
        WHEN cr.data_vencimento >= p_inicio
         AND cr.data_vencimento < p_fim
         AND upper(cr.status) NOT IN ('CANCELADO', 'CANCELADA')
        THEN coalesce(cr.valor, 0)
        ELSE 0
      END AS previsto_no_mes,
      CASE
        WHEN upper(cr.status) = 'PAGO'
         AND cr.data_pagamento >= p_inicio
         AND cr.data_pagamento < p_fim
        THEN CASE
          WHEN cr.manual_settlement_id IS NOT NULL
           AND cr.manual_settlement_reversed_at IS NULL
          THEN coalesce(cr.manual_settlement_received_cents, 0)::numeric / 100
          ELSE coalesce(cr.valor_pago, cr.valor, 0)
        END
        ELSE 0
      END AS recebido_no_mes,
      CASE
        WHEN upper(cr.status) IN ('PENDENTE', 'VENCIDO')
         AND cr.data_vencimento >= p_inicio
         AND cr.data_vencimento < least(p_fim, current_date)
        THEN greatest(coalesce(cr.valor, 0) - coalesce(cr.valor_pago, 0), 0)
        ELSE 0
      END AS em_atraso,
      (
        cr.data_vencimento >= p_inicio
        AND cr.data_vencimento < p_fim
        AND upper(cr.status) NOT IN ('CANCELADO', 'CANCELADA')
      ) AS parcela_prevista,
      (
        upper(cr.status) = 'PAGO'
        AND cr.data_pagamento >= p_inicio
        AND cr.data_pagamento < p_fim
      ) AS parcela_recebida,
      (
        upper(cr.status) IN ('PENDENTE', 'VENCIDO')
        AND cr.data_vencimento >= p_inicio
        AND cr.data_vencimento < least(p_fim, current_date)
      ) AS parcela_em_atraso
    FROM public.contas_receber cr
    LEFT JOIN public.matriculas matricula
      ON matricula.id = cr.matricula_id
    LEFT JOIN public.turmas turma
      ON turma.id = coalesce(cr.turma_id, matricula.turma_id)
    LEFT JOIN public.cursos curso
      ON curso.id = turma.curso_id
    WHERE (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
      AND (
        (
          cr.data_vencimento >= p_inicio
          AND cr.data_vencimento < p_fim
          AND upper(cr.status) NOT IN ('CANCELADO', 'CANCELADA')
        )
        OR (
          upper(cr.status) = 'PAGO'
          AND cr.data_pagamento >= p_inicio
          AND cr.data_pagamento < p_fim
        )
      )
  ),
  por_turma AS MATERIALIZED (
    SELECT
      turma_id,
      turma,
      curso,
      modalidade,
      coalesce(sum(previsto_no_mes), 0) AS previsto_no_mes,
      coalesce(sum(recebido_no_mes), 0) AS recebido_no_mes,
      coalesce(sum(em_atraso), 0) AS em_atraso,
      count(*) FILTER (WHERE parcela_prevista)::integer AS quantidade_parcelas,
      count(*) FILTER (WHERE parcela_recebida)::integer AS quantidade_recebidas,
      count(*) FILTER (WHERE parcela_em_atraso)::integer AS quantidade_em_atraso
    FROM recebiveis
    GROUP BY turma_id, turma, curso, modalidade
  ),
  ranqueado AS (
    SELECT
      por_turma.*,
      row_number() OVER (
        ORDER BY
          greatest(previsto_no_mes, recebido_no_mes, em_atraso) DESC,
          turma
      ) AS ordem
    FROM por_turma
  ),
  itens AS (
    SELECT
      turma_id,
      turma,
      curso,
      modalidade,
      previsto_no_mes,
      recebido_no_mes,
      em_atraso,
      quantidade_parcelas,
      quantidade_recebidas,
      quantidade_em_atraso,
      false AS agregado,
      1::integer AS quantidade_turmas,
      ordem
    FROM ranqueado
    WHERE ordem <= 5

    UNION ALL

    SELECT
      NULL::uuid,
      'Demais turmas',
      'Valores consolidados',
      'MÚLTIPLAS',
      coalesce(sum(previsto_no_mes), 0),
      coalesce(sum(recebido_no_mes), 0),
      coalesce(sum(em_atraso), 0),
      coalesce(sum(quantidade_parcelas), 0)::integer,
      coalesce(sum(quantidade_recebidas), 0)::integer,
      coalesce(sum(quantidade_em_atraso), 0)::integer,
      true,
      count(*)::integer,
      6::bigint
    FROM ranqueado
    WHERE ordem > 5
    HAVING count(*) > 0
  ),
  totais AS (
    SELECT
      count(*)::integer AS quantidade_turmas,
      greatest(count(*) - 5, 0)::integer AS quantidade_omitidas,
      coalesce(sum(previsto_no_mes), 0) AS previsto_no_mes,
      coalesce(sum(recebido_no_mes), 0) AS recebido_no_mes,
      coalesce(sum(em_atraso), 0) AS em_atraso
    FROM por_turma
  )
  SELECT jsonb_build_object(
    'itens',
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'turma_id', item.turma_id,
          'turma', item.turma,
          'curso', item.curso,
          'modalidade', item.modalidade,
          'previsto_no_mes', item.previsto_no_mes,
          'recebido_no_mes', item.recebido_no_mes,
          'em_atraso', item.em_atraso,
          'quantidade_parcelas', item.quantidade_parcelas,
          'quantidade_recebidas', item.quantidade_recebidas,
          'quantidade_em_atraso', item.quantidade_em_atraso,
          'agregado', item.agregado,
          'quantidade_turmas', item.quantidade_turmas
        )
        ORDER BY item.ordem
      )
      FROM itens item
    ), '[]'::jsonb),
    'quantidade_turmas', totais.quantidade_turmas,
    'quantidade_omitidas', totais.quantidade_omitidas,
    'totais', jsonb_build_object(
      'previsto_no_mes', totais.previsto_no_mes,
      'recebido_no_mes', totais.recebido_no_mes,
      'em_atraso', totais.em_atraso
    )
  )
  FROM totais;
$$;

CREATE FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_relatorio jsonb;
  v_resumo_turmas jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND public.gestor_has_any_global_module(ARRAY['caixa'])
       )
       OR (
         p_polo_id IS NOT NULL
         AND public.gestor_has_any_module_for_polo(ARRAY['caixa'], p_polo_id)
       )
     ) THEN
    RAISE EXCEPTION 'Acesso ao relatório detalhado do Caixa fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  v_relatorio := public.get_caixa_relatorio_mensal_detalhado_v1_core(
    p_polo_id,
    p_competencia
  );
  v_resumo_turmas := public.get_caixa_relatorio_resumo_turmas_core(
    p_polo_id,
    v_inicio,
    v_fim
  );

  RETURN v_relatorio || jsonb_build_object(
    'versao', 2,
    'resumo_turmas', v_resumo_turmas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_caixa_relatorio_resumo_turmas_core(uuid, date, date)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_caixa_relatorio_resumo_turmas_core(uuid, date, date) IS
  'Agrega no backend o previsto, recebido e vencido por turma para o PDF do Caixa.';
COMMENT ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date) IS
  'Prestação mensal detalhada do Caixa v2, com resumo por turma e cálculos exclusivamente no backend.';
