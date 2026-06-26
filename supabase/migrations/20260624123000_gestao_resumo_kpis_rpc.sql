CREATE OR REPLACE FUNCTION public.get_gestao_resumo_kpis(p_polo_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH modalidades AS (
  SELECT unnest(ARRAY['TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'EAD']) AS modalidade
),
turmas_base AS (
  SELECT t.id, c.modalidade
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE c.modalidade IN ('TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'EAD')
    AND (p_polo_id IS NULL OR t.polo_id = p_polo_id)
),
alunos_liberados AS (
  SELECT DISTINCT tb.modalidade, m.aluno_id
  FROM turmas_base tb
  JOIN public.matriculas m ON m.turma_id = tb.id
  WHERE m.status IN ('ATIVO', 'CONCLUIDO')
),
por_modalidade AS (
  SELECT
    md.modalidade,
    COUNT(DISTINCT tb.id)::int AS turmas,
    COUNT(DISTINCT al.aluno_id)::int AS alunos
  FROM modalidades md
  LEFT JOIN turmas_base tb ON tb.modalidade = md.modalidade
  LEFT JOIN alunos_liberados al ON al.modalidade = md.modalidade
  GROUP BY md.modalidade
),
totais AS (
  SELECT
    (SELECT COUNT(*)::int FROM turmas_base) AS total_turmas,
    (SELECT COUNT(DISTINCT aluno_id)::int FROM alunos_liberados) AS total_alunos,
    GREATEST((SELECT SUM(alunos)::int FROM por_modalidade), 0) AS total_alunos_modalidade
)
SELECT jsonb_build_object(
  'totalTurmas', totais.total_turmas,
  'totalAlunos', totais.total_alunos,
  'turmasPorTipo', jsonb_object_agg(pm.modalidade, pm.turmas),
  'alunosPorTipo', jsonb_object_agg(pm.modalidade, pm.alunos),
  'percentTurmasPorTipo', jsonb_object_agg(
    pm.modalidade,
    CASE WHEN totais.total_turmas > 0 THEN ROUND((pm.turmas::numeric / totais.total_turmas::numeric) * 100)::int ELSE 0 END
  ),
  'percentAlunosPorTipo', jsonb_object_agg(
    pm.modalidade,
    CASE WHEN totais.total_alunos_modalidade > 0 THEN ROUND((pm.alunos::numeric / totais.total_alunos_modalidade::numeric) * 100)::int ELSE 0 END
  )
)
FROM por_modalidade pm
CROSS JOIN totais
GROUP BY totais.total_turmas, totais.total_alunos, totais.total_alunos_modalidade;
$$;

REVOKE ALL ON FUNCTION public.get_gestao_resumo_kpis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gestao_resumo_kpis(uuid) TO anon, authenticated;
