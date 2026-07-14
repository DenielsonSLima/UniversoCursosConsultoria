-- Endurece a RPC já usada por gestor/professor. Antes ela era SECURITY DEFINER,
-- executável por authenticated e retornava todos os alunos sem validar o ator.
CREATE OR REPLACE FUNCTION public.get_diario_resultados(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS TABLE (
  turma_id uuid,
  disciplina_id uuid,
  aluno_id uuid,
  nota_p numeric,
  nota_ti numeric,
  nota_tg numeric,
  nota_s numeric,
  nota_cq numeric,
  nota_o numeric,
  nota_rec numeric,
  total_aulas bigint,
  total_faltas bigint,
  frequencia_percent numeric,
  media_parcial numeric,
  media_final numeric,
  resultado_final text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid := public.current_aluno_id();
  v_full_access boolean := false;
  v_student_access boolean := false;
BEGIN
  SELECT
    coalesce((SELECT auth.role()), '') = 'service_role'
    OR public.is_gestor_for_polo(t.polo_id)
    OR public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id)
  INTO v_full_access
  FROM public.turmas t
  WHERE t.id = p_turma_id;

  v_full_access := coalesce(v_full_access, false);

  IF NOT v_full_access AND v_aluno_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.matriculas m
      JOIN public.turmas t ON t.id = m.turma_id
      JOIN public.cursos c ON c.id = t.curso_id
      WHERE m.turma_id = p_turma_id
        AND m.aluno_id = v_aluno_id
        AND upper(coalesce(c.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
        AND (
          (
            upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
            AND upper(coalesce(m.status, '')) = 'ATIVO'
          )
          OR (
            upper(coalesce(t.status, '')) = 'FINALIZADA'
            AND upper(coalesce(m.status, '')) IN ('CONCLUIDO', 'REPROVADO')
          )
        )
    ) INTO v_student_access;
  END IF;

  IF NOT v_full_access AND NOT v_student_access THEN
    RAISE EXCEPTION 'Acesso acadêmico não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH alunos AS (
    SELECT m.id AS matricula_id, m.aluno_id
    FROM public.matriculas m
    WHERE m.turma_id = p_turma_id
      AND upper(coalesce(m.status, '')) NOT IN ('CANCELADO', 'DESISTENTE', 'TRANSFERIDO')
      AND (v_full_access OR m.aluno_id = v_aluno_id)
  ),
  total_aulas AS (
    SELECT count(*) AS total
    FROM public.aulas_turma a
    WHERE a.turma_id = p_turma_id
      AND a.disciplina_id = p_disciplina_id
  ),
  faltas AS (
    SELECT
      f.aluno_id,
      count(*) FILTER (WHERE f.status = 'F') AS total,
      count(*) AS lancamentos
    FROM public.diario_frequencia f
    WHERE f.turma_id = p_turma_id
      AND f.disciplina_id = p_disciplina_id
    GROUP BY f.aluno_id
  ),
  base AS (
    SELECT
      a.matricula_id,
      a.aluno_id,
      n.nota_p,
      n.nota_ti,
      n.nota_tg,
      n.nota_s,
      n.nota_cq,
      n.nota_o,
      n.nota_rec,
      ta.total AS aulas,
      coalesce(f.total, 0) AS faltas,
      CASE
        WHEN ap.id IS NOT NULL THEN ap.frequencia_percent
        WHEN ta.total > 0 AND coalesce(f.lancamentos, 0) = ta.total
          THEN round(((ta.total - coalesce(f.total, 0))::numeric / ta.total) * 100)
        ELSE NULL
      END AS frequencia,
      CASE
        WHEN ap.id IS NOT NULL THEN ap.media_final
        WHEN n.aluno_id IS NULL THEN NULL
        ELSE least(
          10.00,
          round(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0
            + n.nota_cq + n.nota_o)::numeric, 1)
        )
      END AS parcial,
      ap.id AS aproveitamento_id
    FROM alunos a
    CROSS JOIN total_aulas ta
    LEFT JOIN faltas f ON f.aluno_id = a.aluno_id
    LEFT JOIN public.diario_notas n
      ON n.turma_id = p_turma_id
     AND n.disciplina_id = p_disciplina_id
     AND n.aluno_id = a.aluno_id
    LEFT JOIN public.matricula_aproveitamentos ap
      ON ap.matricula_id = a.matricula_id
     AND ap.disciplina_id = p_disciplina_id
  ),
  finais AS (
    SELECT
      b.*,
      CASE
        WHEN b.parcial IS NULL THEN NULL
        WHEN b.nota_rec IS NOT NULL AND b.nota_rec > b.parcial THEN b.nota_rec
        ELSE b.parcial
      END AS final
    FROM base b
  )
  SELECT
    p_turma_id,
    p_disciplina_id,
    f.aluno_id,
    f.nota_p,
    f.nota_ti,
    f.nota_tg,
    f.nota_s,
    f.nota_cq,
    f.nota_o,
    f.nota_rec,
    f.aulas,
    f.faltas,
    f.frequencia,
    f.parcial,
    f.final,
    CASE
      WHEN f.aproveitamento_id IS NOT NULL THEN 'APROVEITADO'
      WHEN f.parcial IS NULL THEN 'SEM_LANCAMENTO'
      WHEN f.frequencia IS NULL THEN 'FREQUENCIA_PENDENTE'
      WHEN f.frequencia < 75 THEN 'REPROVADO_FREQUENCIA'
      WHEN f.final >= 6 THEN 'APROVADO'
      WHEN f.nota_rec IS NULL THEN 'EM_RECUPERACAO'
      ELSE 'REPROVADO'
    END
  FROM finais f;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_diario_resultados(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_diario_resultados(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_diario_resultados(uuid, uuid)
  IS 'Resultados do diário com escopo por ator: gestor/professor veem a disciplina; aluno vê somente a própria linha com matrícula acadêmica válida.';

-- O portal usa uma única chamada em lote. A função interna acima já restringe
-- o resultado por ator e este wrapper reforça o filtro do aluno autenticado.
CREATE OR REPLACE FUNCTION public.get_aluno_diario_resultados(
  p_turma_id uuid,
  p_disciplina_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  turma_id uuid,
  disciplina_id uuid,
  aluno_id uuid,
  nota_p numeric,
  nota_ti numeric,
  nota_tg numeric,
  nota_s numeric,
  nota_cq numeric,
  nota_o numeric,
  nota_rec numeric,
  total_aulas bigint,
  total_faltas bigint,
  frequencia_percent numeric,
  media_parcial numeric,
  media_final numeric,
  resultado_final text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid := public.current_aluno_id();
BEGIN
  IF v_aluno_id IS NULL THEN
    RAISE EXCEPTION 'Acesso acadêmico não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE m.turma_id = p_turma_id
      AND m.aluno_id = v_aluno_id
      AND upper(coalesce(c.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
      AND (
        (
          upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
          AND upper(coalesce(m.status, '')) = 'ATIVO'
        )
        OR (
          upper(coalesce(t.status, '')) = 'FINALIZADA'
          AND upper(coalesce(m.status, '')) IN ('CONCLUIDO', 'REPROVADO')
        )
      )
  ) THEN
    RAISE EXCEPTION 'Acesso acadêmico não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    resultado.turma_id,
    resultado.disciplina_id,
    resultado.aluno_id,
    resultado.nota_p,
    resultado.nota_ti,
    resultado.nota_tg,
    resultado.nota_s,
    resultado.nota_cq,
    resultado.nota_o,
    resultado.nota_rec,
    resultado.total_aulas,
    resultado.total_faltas,
    resultado.frequencia_percent,
    resultado.media_parcial,
    resultado.media_final,
    resultado.resultado_final
  FROM public.turmas_disciplinas turma_disciplina
  CROSS JOIN LATERAL public.get_diario_resultados(
    p_turma_id,
    turma_disciplina.disciplina_id
  ) resultado
  WHERE turma_disciplina.turma_id = p_turma_id
    AND (
      p_disciplina_ids IS NULL
      OR turma_disciplina.disciplina_id = ANY(p_disciplina_ids)
    )
    AND resultado.aluno_id = v_aluno_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_aluno_diario_resultados(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aluno_diario_resultados(uuid, uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.get_aluno_diario_resultados(uuid, uuid[])
  IS 'Portal do aluno: valida matrícula/turma e retorna em lote somente os resultados do aluno autenticado.';
