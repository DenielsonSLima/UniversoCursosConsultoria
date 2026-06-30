-- Refina as pendências de fechamento do período técnico.
-- O período só fecha quando notas, frequência e recuperações estiverem concluídas.

CREATE OR REPLACE FUNCTION public.get_pendencias_fechamento_periodo(
  p_periodo_letivo_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH periodo AS (
    SELECT * FROM public.periodos_letivos WHERE id = p_periodo_letivo_id
  ),
  disciplinas_periodo AS (
    SELECT td.turma_id, td.disciplina_id, COALESCE(td.concluida, FALSE) AS concluida
    FROM public.turmas_disciplinas td
    WHERE td.periodo_letivo_id = p_periodo_letivo_id
  ),
  alunos_ativos AS (
    SELECT m.aluno_id
    FROM public.matriculas m
    JOIN periodo p ON p.turma_id = m.turma_id
    WHERE m.status = 'ATIVO'
  ),
  aulas_periodo AS (
    SELECT a.id AS aula_id, a.turma_id, a.disciplina_id
    FROM public.aulas_turma a
    JOIN disciplinas_periodo dp
      ON dp.turma_id = a.turma_id
     AND dp.disciplina_id = a.disciplina_id
  ),
  sem_aula AS (
    SELECT dp.disciplina_id
    FROM disciplinas_periodo dp
    WHERE NOT EXISTS (
      SELECT 1
      FROM aulas_periodo ap
      WHERE ap.turma_id = dp.turma_id
        AND ap.disciplina_id = dp.disciplina_id
    )
  ),
  sem_nota AS (
    SELECT aa.aluno_id, dp.disciplina_id
    FROM alunos_ativos aa
    CROSS JOIN disciplinas_periodo dp
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.diario_notas dn
      WHERE dn.turma_id = dp.turma_id
        AND dn.aluno_id = aa.aluno_id
        AND dn.disciplina_id = dp.disciplina_id
        AND dn.nota_p IS NOT NULL
        AND dn.nota_ti IS NOT NULL
        AND dn.nota_tg IS NOT NULL
        AND dn.nota_s IS NOT NULL
        AND dn.nota_cq IS NOT NULL
        AND dn.nota_o IS NOT NULL
    )
  ),
  frequencia_pendente AS (
    SELECT aa.aluno_id, ap.disciplina_id, ap.aula_id
    FROM alunos_ativos aa
    CROSS JOIN aulas_periodo ap
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.diario_frequencia df
      WHERE df.turma_id = ap.turma_id
        AND df.disciplina_id = ap.disciplina_id
        AND df.aula_id = ap.aula_id
        AND df.aluno_id = aa.aluno_id
        AND df.status IN ('P', 'F')
    )
  ),
  recuperacao_pendente AS (
    SELECT r.aluno_id, r.disciplina_id
    FROM disciplinas_periodo dp
    CROSS JOIN LATERAL public.get_diario_resultados(dp.turma_id, dp.disciplina_id) r
    JOIN alunos_ativos aa ON aa.aluno_id = r.aluno_id
    WHERE r.resultado_final = 'EM_RECUPERACAO'
  )
  SELECT jsonb_build_object(
    'disciplinasNaoConcluidas',
      (SELECT COUNT(*) FROM disciplinas_periodo WHERE concluida = FALSE),
    'disciplinasSemAula',
      (SELECT COUNT(*) FROM sem_aula),
    'lancamentosDeNotaPendentes',
      (SELECT COUNT(*) FROM sem_nota),
    'frequenciasPendentes',
      (SELECT COUNT(*) FROM frequencia_pendente),
    'recuperacoesPendentes',
      (SELECT COUNT(*) FROM recuperacao_pendente),
    'podeFechar',
      (SELECT COUNT(*) FROM disciplinas_periodo) > 0
      AND (SELECT COUNT(*) FROM disciplinas_periodo WHERE concluida = FALSE) = 0
      AND (SELECT COUNT(*) FROM sem_aula) = 0
      AND (SELECT COUNT(*) FROM sem_nota) = 0
      AND (SELECT COUNT(*) FROM frequencia_pendente) = 0
      AND (SELECT COUNT(*) FROM recuperacao_pendente) = 0
  );
$$;
