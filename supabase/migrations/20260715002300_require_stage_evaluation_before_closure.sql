-- O estágio supervisionado participa do fechamento do período e do resultado
-- final da matrícula técnica.

CREATE OR REPLACE FUNCTION public.get_pendencias_fechamento_periodo(
  p_periodo_letivo_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH periodo AS (
    SELECT *
    FROM public.periodos_letivos
    WHERE id = p_periodo_letivo_id
      AND (
        coalesce(auth.role(), '') = 'service_role'
        OR public.can_write_turma(turma_id)
      )
  ),
  disciplinas_periodo AS (
    SELECT
      td.turma_id,
      td.disciplina_id,
      coalesce(td.concluida, false) AS concluida,
      coalesce(d.carga_horaria_estagio, 0) AS carga_horaria_estagio
    FROM public.turmas_disciplinas td
    JOIN public.disciplinas d ON d.id = td.disciplina_id
    JOIN periodo p ON p.id = td.periodo_letivo_id
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
  ),
  estagio_pendente AS (
    SELECT aa.aluno_id, dp.disciplina_id
    FROM alunos_ativos aa
    CROSS JOIN disciplinas_periodo dp
    WHERE dp.carga_horaria_estagio > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.matriculas_estagios me
        WHERE me.turma_id = dp.turma_id
          AND me.disciplina_id = dp.disciplina_id
          AND me.aluno_id = aa.aluno_id
          AND me.nota_final IS NOT NULL
          AND me.frequencia_estagio IS NOT NULL
      )
  ),
  estagio_reprovado AS (
    SELECT me.aluno_id, me.disciplina_id
    FROM disciplinas_periodo dp
    JOIN public.matriculas_estagios me
      ON me.turma_id = dp.turma_id
     AND me.disciplina_id = dp.disciplina_id
    JOIN alunos_ativos aa ON aa.aluno_id = me.aluno_id
    WHERE dp.carga_horaria_estagio > 0
      AND (me.nota_final < 6 OR me.frequencia_estagio < 75)
  )
  SELECT jsonb_build_object(
    'disciplinasNaoConcluidas',
      (SELECT count(*) FROM disciplinas_periodo WHERE concluida = false),
    'disciplinasSemAula', (SELECT count(*) FROM sem_aula),
    'lancamentosDeNotaPendentes', (SELECT count(*) FROM sem_nota),
    'frequenciasPendentes', (SELECT count(*) FROM frequencia_pendente),
    'recuperacoesPendentes', (SELECT count(*) FROM recuperacao_pendente),
    'avaliacoesEstagioPendentes', (SELECT count(*) FROM estagio_pendente),
    'estagiosReprovados', (SELECT count(*) FROM estagio_reprovado),
    'podeFechar',
      (SELECT count(*) FROM disciplinas_periodo) > 0
      AND (SELECT count(*) FROM disciplinas_periodo WHERE concluida = false) = 0
      AND (SELECT count(*) FROM sem_aula) = 0
      AND (SELECT count(*) FROM sem_nota) = 0
      AND (SELECT count(*) FROM frequencia_pendente) = 0
      AND (SELECT count(*) FROM recuperacao_pendente) = 0
      AND (SELECT count(*) FROM estagio_pendente) = 0
  );
$$;

CREATE OR REPLACE FUNCTION internal_academic.final_enrollment_status(
  p_turma_id uuid,
  p_aluno_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH resultados AS (
    SELECT td.disciplina_id, result.resultado_final
    FROM public.turmas_disciplinas td
    LEFT JOIN LATERAL (
      SELECT r.resultado_final
      FROM public.get_diario_resultados(p_turma_id, td.disciplina_id) r
      WHERE r.aluno_id = p_aluno_id
      LIMIT 1
    ) result ON true
    WHERE td.turma_id = p_turma_id
  ),
  estagios AS (
    SELECT me.nota_final, me.frequencia_estagio
    FROM public.turmas_disciplinas td
    JOIN public.disciplinas d ON d.id = td.disciplina_id
    LEFT JOIN public.matriculas_estagios me
      ON me.turma_id = td.turma_id
     AND me.disciplina_id = td.disciplina_id
     AND me.aluno_id = p_aluno_id
    WHERE td.turma_id = p_turma_id
      AND coalesce(d.carga_horaria_estagio, 0) > 0
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM resultados) > 0
      AND coalesce((
        SELECT bool_and(resultado_final IN ('APROVADO', 'APROVEITADO'))
        FROM resultados
      ), false)
      AND NOT EXISTS (
        SELECT 1 FROM estagios
        WHERE nota_final IS NULL
          OR frequencia_estagio IS NULL
          OR nota_final < 6
          OR frequencia_estagio < 75
      )
    THEN 'CONCLUIDO'
    ELSE 'REPROVADO'
  END;
$$;

REVOKE ALL ON FUNCTION internal_academic.final_enrollment_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_pendencias_fechamento_periodo(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pendencias_fechamento_periodo(uuid)
  TO authenticated, service_role;
