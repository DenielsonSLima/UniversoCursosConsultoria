-- Migração: Discriminação determinística na análise de carteira recorrente do Caixa.
-- Garante que o Resumo por Modalidade e Valores por Turma utilizem a mesma
-- resolução de termos financeiros (desconto, juros, multa e acréscimo) já aplicada aos recebimentos individuais.

CREATE OR REPLACE FUNCTION public.get_caixa_relatorio_carteira_recorrente_core(
  p_polo_id uuid,
  p_inicio date,
  p_fim date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH movimentos AS MATERIALIZED (
    SELECT
      curso.id AS curso_id,
      coalesce(nullif(trim(curso.nome), ''), 'Curso não informado') AS curso,
      upper(trim(curso.modalidade)) AS modalidade,
      turma.id AS turma_id,
      coalesce(
        nullif(trim(concat_ws(' · ', turma.codigo, turma.nome)), ''),
        'Turma não informada'
      ) AS turma,
      coalesce(matricula.aluno_id, cr.cliente_id) AS aluno_id,
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
        THEN comp.valor_recebido
        ELSE 0
      END AS recebido_no_mes,
      CASE
        WHEN upper(cr.status) IN ('PENDENTE', 'VENCIDO')
         AND cr.data_vencimento >= p_inicio
         AND cr.data_vencimento < least(p_fim, current_date)
        THEN greatest(coalesce(cr.valor, 0) - coalesce(cr.valor_pago, 0), 0)
        ELSE 0
      END AS em_atraso,
      CASE
        WHEN upper(cr.status) = 'PAGO'
         AND cr.data_pagamento >= p_inicio
         AND cr.data_pagamento < p_fim
        THEN comp.valor_base
        ELSE 0
      END AS valor_base_recebido,
      CASE
        WHEN upper(cr.status) = 'PAGO'
         AND cr.data_pagamento >= p_inicio
         AND cr.data_pagamento < p_fim
        THEN coalesce(comp.juros, 0)
        ELSE 0
      END AS juros,
      CASE
        WHEN upper(cr.status) = 'PAGO'
         AND cr.data_pagamento >= p_inicio
         AND cr.data_pagamento < p_fim
        THEN coalesce(comp.multa, 0)
        ELSE 0
      END AS multa,
      CASE
        WHEN upper(cr.status) = 'PAGO'
         AND cr.data_pagamento >= p_inicio
         AND cr.data_pagamento < p_fim
        THEN coalesce(comp.acrescimo, 0)
        ELSE 0
      END AS acrescimo,
      CASE
        WHEN upper(cr.status) = 'PAGO'
         AND cr.data_pagamento >= p_inicio
         AND cr.data_pagamento < p_fim
        THEN coalesce(comp.desconto, 0)
        ELSE 0
      END AS desconto,
      CASE
        WHEN upper(cr.status) = 'PAGO'
         AND cr.data_pagamento >= p_inicio
         AND cr.data_pagamento < p_fim
        THEN coalesce(comp.diferenca_nao_discriminada, 0)
        ELSE 0
      END AS diferenca_nao_discriminada,
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
    CROSS JOIN LATERAL public.resolve_receivable_financial_composition(
      cr.valor,
      cr.valor_pago,
      cr.data_vencimento,
      cr.data_pagamento,
      cr.gateway_financial_terms,
      cr.manual_settlement_id,
      cr.manual_settlement_reversed_at,
      cr.manual_settlement_principal_cents,
      cr.manual_settlement_interest_cents,
      cr.manual_settlement_penalty_cents,
      cr.manual_settlement_addition_cents,
      cr.manual_settlement_discount_cents,
      cr.manual_settlement_received_cents
    ) comp
    WHERE (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
      AND curso.id IS NOT NULL
      AND upper(trim(curso.modalidade)) <> 'EAD'
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
  por_curso AS MATERIALIZED (
    SELECT
      curso_id,
      curso,
      modalidade,
      coalesce(sum(previsto_no_mes), 0) AS previsto_no_mes,
      coalesce(sum(recebido_no_mes), 0) AS recebido_no_mes,
      coalesce(sum(em_atraso), 0) AS em_atraso,
      count(*) FILTER (WHERE parcela_prevista)::integer AS quantidade_parcelas,
      count(*) FILTER (WHERE parcela_recebida)::integer AS quantidade_recebidas,
      count(*) FILTER (WHERE parcela_em_atraso)::integer AS quantidade_em_atraso,
      count(DISTINCT turma_id)::integer AS quantidade_turmas,
      count(DISTINCT aluno_id)::integer AS quantidade_alunos
    FROM movimentos
    GROUP BY curso_id, curso, modalidade
  ),
  por_turma AS MATERIALIZED (
    SELECT
      turma_id,
      turma,
      curso_id,
      curso,
      modalidade,
      coalesce(sum(previsto_no_mes), 0) AS previsto_no_mes,
      coalesce(sum(recebido_no_mes), 0) AS recebido_no_mes,
      coalesce(sum(em_atraso), 0) AS em_atraso,
      coalesce(sum(valor_base_recebido), 0) AS valor_base_recebido,
      coalesce(sum(juros), 0) AS juros,
      coalesce(sum(multa), 0) AS multa,
      coalesce(sum(acrescimo), 0) AS acrescimo,
      coalesce(sum(desconto), 0) AS desconto,
      coalesce(sum(diferenca_nao_discriminada), 0) AS diferenca_nao_discriminada,
      count(*) FILTER (WHERE parcela_prevista)::integer AS quantidade_parcelas,
      count(*) FILTER (WHERE parcela_recebida)::integer AS quantidade_recebidas,
      count(*) FILTER (WHERE parcela_em_atraso)::integer AS quantidade_em_atraso,
      1::integer AS quantidade_cursos,
      1::integer AS quantidade_turmas,
      count(DISTINCT aluno_id)::integer AS quantidade_alunos
    FROM movimentos
    GROUP BY turma_id, turma, curso_id, curso, modalidade
  ),
  por_modalidade AS MATERIALIZED (
    SELECT
      modalidade,
      CASE modalidade
        WHEN 'TECNICO' THEN 'Cursos técnicos'
        WHEN 'ESPECIALIZACAO' THEN 'Especialização'
        WHEN 'LIVRE' THEN 'Cursos livres'
        WHEN 'SUPERIOR' THEN 'Ensino superior'
        ELSE initcap(lower(modalidade))
      END AS rotulo,
      coalesce(sum(previsto_no_mes), 0) AS previsto_no_mes,
      coalesce(sum(recebido_no_mes), 0) AS recebido_no_mes,
      coalesce(sum(em_atraso), 0) AS em_atraso,
      coalesce(sum(valor_base_recebido), 0) AS valor_base_recebido,
      coalesce(sum(juros), 0) AS juros,
      coalesce(sum(multa), 0) AS multa,
      coalesce(sum(acrescimo), 0) AS acrescimo,
      coalesce(sum(desconto), 0) AS desconto,
      coalesce(sum(diferenca_nao_discriminada), 0) AS diferenca_nao_discriminada,
      count(*) FILTER (WHERE parcela_prevista)::integer AS quantidade_parcelas,
      count(*) FILTER (WHERE parcela_recebida)::integer AS quantidade_recebidas,
      count(*) FILTER (WHERE parcela_em_atraso)::integer AS quantidade_em_atraso,
      count(DISTINCT curso_id)::integer AS quantidade_cursos,
      count(DISTINCT turma_id)::integer AS quantidade_turmas,
      count(DISTINCT aluno_id)::integer AS quantidade_alunos
    FROM movimentos
    GROUP BY modalidade
  ),
  totais AS (
    SELECT
      coalesce(sum(previsto_no_mes), 0) AS previsto_no_mes,
      coalesce(sum(recebido_no_mes), 0) AS recebido_no_mes,
      coalesce(sum(em_atraso), 0) AS em_atraso,
      coalesce(sum(valor_base_recebido), 0) AS valor_base_recebido,
      coalesce(sum(juros), 0) AS juros,
      coalesce(sum(multa), 0) AS multa,
      coalesce(sum(acrescimo), 0) AS acrescimo,
      coalesce(sum(desconto), 0) AS desconto,
      coalesce(sum(diferenca_nao_discriminada), 0) AS diferenca_nao_discriminada,
      count(*) FILTER (WHERE parcela_prevista)::integer AS quantidade_parcelas,
      count(*) FILTER (WHERE parcela_recebida)::integer AS quantidade_recebidas,
      count(*) FILTER (WHERE parcela_em_atraso)::integer AS quantidade_em_atraso,
      count(DISTINCT curso_id)::integer AS quantidade_cursos,
      count(DISTINCT turma_id)::integer AS quantidade_turmas,
      count(DISTINCT aluno_id)::integer AS quantidade_alunos
    FROM movimentos
  ),
  resumo_cursos AS (
    SELECT jsonb_build_object(
      'itens',
      coalesce((
        SELECT jsonb_agg(to_jsonb(curso_resumo) ORDER BY curso_resumo.ordem)
        FROM (
          SELECT
            curso_id,
            curso,
            modalidade,
            previsto_no_mes,
            recebido_no_mes,
            em_atraso,
            quantidade_parcelas,
            quantidade_recebidas,
            quantidade_em_atraso,
            quantidade_turmas,
            quantidade_alunos,
            row_number() OVER (
              ORDER BY greatest(previsto_no_mes, recebido_no_mes, em_atraso) DESC, curso
            ) AS ordem
          FROM por_curso
        ) curso_resumo
        WHERE curso_resumo.ordem <= 4
      ), '[]'::jsonb),
      'quantidade_cursos', totais.quantidade_cursos,
      'quantidade_omitidas', greatest(totais.quantidade_cursos - 4, 0),
      'totais', jsonb_build_object(
        'previsto_no_mes', totais.previsto_no_mes,
        'recebido_no_mes', totais.recebido_no_mes,
        'em_atraso', totais.em_atraso,
        'quantidade_turmas', totais.quantidade_turmas,
        'quantidade_alunos', totais.quantidade_alunos
      )
    ) AS payload
    FROM totais
  ),
  analise_recorrente AS (
    SELECT jsonb_build_object(
      'modalidades',
      coalesce((
        SELECT jsonb_agg(to_jsonb(modalidade_item) ORDER BY modalidade_item.rotulo)
        FROM por_modalidade modalidade_item
      ), '[]'::jsonb),
      'turmas',
      coalesce((
        SELECT jsonb_agg(
          to_jsonb(turma_item)
          ORDER BY turma_item.modalidade, turma_item.curso, turma_item.turma
        )
        FROM por_turma turma_item
      ), '[]'::jsonb),
      'totais',
      to_jsonb(totais)
    ) AS payload
    FROM totais
  )
  SELECT jsonb_build_object(
    'resumo_cursos', resumo_cursos.payload,
    'analise_recorrente', analise_recorrente.payload
  )
  FROM resumo_cursos
  CROSS JOIN analise_recorrente;
$$;

REVOKE ALL ON FUNCTION public.get_caixa_relatorio_carteira_recorrente_core(uuid, date, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_carteira_recorrente_core(uuid, date, date)
  TO service_role;

COMMENT ON FUNCTION public.get_caixa_relatorio_carteira_recorrente_core(uuid, date, date) IS
  'Detalhamento e consolidação da carteira recorrente com discriminação determinística de termos financeiros.';
