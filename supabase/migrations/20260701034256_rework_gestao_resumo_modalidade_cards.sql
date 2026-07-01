CREATE OR REPLACE FUNCTION public.get_gestao_resumo_kpis(p_polo_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH modalidades AS (
  SELECT *
  FROM (
    VALUES
      ('TECNICO'::text, 'Técnico'::text, 1),
      ('LIVRE'::text, 'Livre'::text, 2),
      ('ESPECIALIZACAO'::text, 'Especialização'::text, 3),
      ('EAD'::text, 'EAD'::text, 4)
  ) AS md(modalidade, label, ordem)
  WHERE p_polo_id IS NULL OR md.modalidade <> 'EAD'
),
turmas_base AS (
  SELECT
    t.id,
    c.modalidade,
    UPPER(COALESCE(t.status, '')) AS status
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE c.modalidade IN ('TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'EAD')
    AND (p_polo_id IS NULL OR t.polo_id = p_polo_id)
    AND (p_polo_id IS NULL OR c.modalidade <> 'EAD')
),
turmas_ativas AS (
  SELECT id, modalidade
  FROM turmas_base
  WHERE modalidade = 'EAD' OR status = 'EM_ANDAMENTO'
),
alunos_modalidade AS (
  SELECT DISTINCT
    ta.modalidade,
    m.aluno_id
  FROM turmas_ativas ta
  JOIN public.matriculas m ON m.turma_id = ta.id
  WHERE UPPER(COALESCE(m.status, '')) IN ('ATIVO', 'CONCLUIDO')
),
inscricoes_ead_mes AS (
  SELECT COUNT(*)::int AS total
  FROM public.inscricoes_online io
  JOIN public.cursos c ON c.id = io.curso_id
  WHERE p_polo_id IS NULL
    AND c.modalidade = 'EAD'
    AND io.created_at >= (
      date_trunc('month', timezone('America/Maceio', now())) AT TIME ZONE 'America/Maceio'
    )
    AND io.created_at < (
      (date_trunc('month', timezone('America/Maceio', now())) + INTERVAL '1 month') AT TIME ZONE 'America/Maceio'
    )
),
por_modalidade AS (
  SELECT
    md.modalidade,
    md.label,
    md.ordem,
    COUNT(DISTINCT ta.id)::int AS turmas_ativas,
    COUNT(DISTINCT am.aluno_id)::int AS alunos,
    CASE
      WHEN md.modalidade = 'EAD' THEN (SELECT total FROM inscricoes_ead_mes)
      ELSE NULL
    END AS inscricoes_mes_atual
  FROM modalidades md
  LEFT JOIN turmas_ativas ta ON ta.modalidade = md.modalidade
  LEFT JOIN alunos_modalidade am ON am.modalidade = md.modalidade
  GROUP BY md.modalidade, md.label, md.ordem
),
totais AS (
  SELECT
    COALESCE(SUM(turmas_ativas), 0)::int AS total_turmas_ativas,
    COALESCE(SUM(alunos), 0)::int AS total_alunos,
    COALESCE(MAX(inscricoes_mes_atual) FILTER (WHERE modalidade = 'EAD'), 0)::int AS total_inscricoes_ead_mes_atual
  FROM por_modalidade
)
SELECT jsonb_build_object(
  'totalTurmasAtivas', totais.total_turmas_ativas,
  'totalAlunos', totais.total_alunos,
  'totalInscricoesEadMesAtual', totais.total_inscricoes_ead_mes_atual,
  'cards', COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'modalidade', pm.modalidade,
        'label', pm.label,
        'turmasAtivas', pm.turmas_ativas,
        'alunos', pm.alunos,
        'inscricoesMesAtual', pm.inscricoes_mes_atual
      )
      ORDER BY pm.ordem
    ),
    '[]'::jsonb
  )
)
FROM por_modalidade pm
CROSS JOIN totais
GROUP BY
  totais.total_turmas_ativas,
  totais.total_alunos,
  totais.total_inscricoes_ead_mes_atual;
$$;

REVOKE ALL ON FUNCTION public.get_gestao_resumo_kpis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gestao_resumo_kpis(uuid) TO anon, authenticated;
