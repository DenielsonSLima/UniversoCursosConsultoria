BEGIN;

-- Versão local alinhada ao registro aplicado via MCP.

-- O aluno em dependência continua vinculado à matrícula e à turma originais.
-- A turma de reoferta não vira uma segunda matrícula nem libera as demais
-- disciplinas dessa turma no Portal do Aluno.

CREATE OR REPLACE FUNCTION public.is_aluno_matriculado_turma(
  p_turma_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    JOIN public.turmas turma ON turma.id = matricula.turma_id
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE matricula.turma_id = p_turma_id
      AND matricula.aluno_id = (
        SELECT public.current_aluno_id()
      )
      AND (
        curso.modalidade <> 'TECNICO'
        OR (
          turma.status = 'EM_ANDAMENTO'
          AND upper(coalesce(matricula.status, '')) = 'ATIVO'
        )
        OR (
          turma.status = 'FINALIZADA'
          AND upper(coalesce(matricula.status, '')) IN (
            'CONCLUIDO',
            'REPROVADO',
            'EM_DEPENDENCIA'
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_student_read_atividade_extra(
  p_turma_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    JOIN public.turmas turma ON turma.id = matricula.turma_id
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE matricula.turma_id = p_turma_id
      AND matricula.aluno_id = (
        SELECT public.current_aluno_id()
      )
      AND (
        (
          curso.modalidade <> 'TECNICO'
          AND upper(coalesce(matricula.status, '')) IN (
            'ATIVO',
            'CONCLUIDO'
          )
        )
        OR (
          curso.modalidade = 'TECNICO'
          AND turma.status = 'EM_ANDAMENTO'
          AND upper(coalesce(matricula.status, '')) = 'ATIVO'
        )
        OR (
          curso.modalidade = 'TECNICO'
          AND turma.status = 'FINALIZADA'
          AND upper(coalesce(matricula.status, '')) IN (
            'CONCLUIDO',
            'REPROVADO',
            'EM_DEPENDENCIA'
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_aluno_matriculado_turma_status(
  p_turma_id uuid,
  p_statuses text[] DEFAULT ARRAY['ATIVO', 'CONCLUIDO']::text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    JOIN public.turmas turma ON turma.id = matricula.turma_id
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE matricula.turma_id = p_turma_id
      AND matricula.aluno_id = (
        SELECT public.current_aluno_id()
      )
      AND (
        (
          curso.modalidade <> 'TECNICO'
          AND upper(coalesce(matricula.status, ''))
            = ANY(array_remove(p_statuses, 'REPROVADO'))
        )
        OR (
          curso.modalidade = 'TECNICO'
          AND turma.status = 'EM_ANDAMENTO'
          AND upper(coalesce(matricula.status, '')) = 'ATIVO'
          AND 'ATIVO' = ANY(p_statuses)
        )
        OR (
          curso.modalidade = 'TECNICO'
          AND turma.status = 'FINALIZADA'
          AND upper(coalesce(matricula.status, '')) IN (
            'CONCLUIDO',
            'REPROVADO',
            'EM_DEPENDENCIA'
          )
          AND upper(matricula.status) = ANY(p_statuses)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_aluno_matriculado_turma(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_student_read_atividade_extra(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION
  public.is_aluno_matriculado_turma_status(uuid, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_aluno_matriculado_turma(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_student_read_atividade_extra(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.is_aluno_matriculado_turma_status(uuid, text[])
  TO authenticated, service_role;

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
  v_full_access boolean;
  v_student_access boolean;
BEGIN
  v_full_access :=
    coalesce((SELECT auth.role()), '') = 'service_role'
    OR public.gestor_can_read_diario_results(p_turma_id)
    OR public.is_professor_assigned_disciplina(
      p_turma_id,
      p_disciplina_id
    );

  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas matricula
    JOIN public.turmas turma ON turma.id = matricula.turma_id
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE matricula.turma_id = p_turma_id
      AND matricula.aluno_id = v_aluno_id
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
      AND (
        (
          upper(coalesce(turma.status, '')) = 'EM_ANDAMENTO'
          AND upper(coalesce(matricula.status, '')) = 'ATIVO'
        )
        OR (
          upper(coalesce(turma.status, '')) = 'FINALIZADA'
          AND upper(coalesce(matricula.status, '')) IN (
            'CONCLUIDO',
            'REPROVADO',
            'EM_DEPENDENCIA'
          )
        )
      )
  )
  INTO v_student_access;

  IF NOT coalesce(v_full_access, false)
    AND NOT coalesce(v_student_access, false)
  THEN
    RAISE EXCEPTION 'Acesso aos resultados não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_full_access, false) THEN
    RETURN QUERY
    SELECT resultado.*
    FROM internal_academic.p1_get_diario_resultados_20260719(
      p_turma_id,
      p_disciplina_id
    ) resultado
    WHERE internal_academic.is_student_in_diary_roster(
      p_turma_id,
      p_disciplina_id,
      NULL,
      resultado.aluno_id
    );
  ELSE
    RETURN QUERY
    SELECT resultado.*
    FROM internal_academic.p1_get_diario_resultados_20260719(
      p_turma_id,
      p_disciplina_id
    ) resultado
    WHERE resultado.aluno_id = v_aluno_id
      AND internal_academic.is_student_in_diary_roster(
        p_turma_id,
        p_disciplina_id,
        NULL,
        resultado.aluno_id
      );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_diario_resultados(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_diario_resultados(uuid, uuid)
  TO authenticated, service_role;

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
  v_matricula_id uuid;
BEGIN
  IF v_aluno_id IS NULL THEN
    RAISE EXCEPTION 'Acesso acadêmico não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT matricula.id
  INTO v_matricula_id
  FROM public.matriculas matricula
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE matricula.turma_id = p_turma_id
    AND matricula.aluno_id = v_aluno_id
    AND upper(coalesce(curso.modalidade, ''))
      IN ('TECNICO', 'TÉCNICO')
    AND (
      (
        upper(coalesce(turma.status, '')) = 'EM_ANDAMENTO'
        AND upper(coalesce(matricula.status, '')) = 'ATIVO'
      )
      OR (
        upper(coalesce(turma.status, '')) = 'FINALIZADA'
        AND upper(coalesce(matricula.status, '')) IN (
          'CONCLUIDO',
          'REPROVADO',
          'EM_DEPENDENCIA'
        )
      )
    )
  LIMIT 1;

  IF v_matricula_id IS NULL THEN
    RAISE EXCEPTION 'Acesso acadêmico não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH resultados_origem AS (
    SELECT resultado.*
    FROM public.turmas_disciplinas oferta
    CROSS JOIN LATERAL public.get_diario_resultados(
      p_turma_id,
      oferta.disciplina_id
    ) resultado
    WHERE oferta.turma_id = p_turma_id
      AND (
        p_disciplina_ids IS NULL
        OR oferta.disciplina_id = ANY(p_disciplina_ids)
      )
      AND resultado.aluno_id = v_aluno_id
  ),
  resultados_canonicos AS (
    SELECT resultado.*
    FROM internal_academic.get_enrollment_results(
      v_matricula_id
    ) resultado
  ),
  dependencias_aprovadas AS (
    SELECT
      componente.disciplina_id,
      tentativa.id AS tentativa_id,
      tentativa.turma_id AS turma_destino_id,
      tentativa.nota_rec_destino,
      tentativa.media_parcial_destino,
      tentativa.media_final_destino,
      tentativa.frequencia_destino,
      tentativa.resultado_destino,
      notas.nota_p,
      notas.nota_ti,
      notas.nota_tg,
      notas.nota_s,
      notas.nota_cq,
      notas.nota_o,
      notas.nota_rec,
      (
        SELECT count(*)
        FROM public.aulas_turma aula
        WHERE aula.turma_id = tentativa.turma_id
          AND aula.disciplina_id = tentativa.disciplina_id
      ) AS total_aulas,
      (
        SELECT count(*)
        FROM public.diario_frequencia frequencia
        WHERE frequencia.turma_id = tentativa.turma_id
          AND frequencia.disciplina_id = tentativa.disciplina_id
          AND frequencia.aluno_id = v_aluno_id
          AND frequencia.status = 'F'
      ) AS total_faltas
    FROM public.matricula_componentes componente
    JOIN public.matricula_disciplina_tentativas tentativa
      ON tentativa.id = componente.tentativa_aprovada_id
    LEFT JOIN public.diario_notas notas
      ON notas.turma_id = tentativa.turma_id
     AND notas.disciplina_id = tentativa.disciplina_id
     AND notas.aluno_id = v_aluno_id
    WHERE componente.matricula_id = v_matricula_id
      AND componente.status = 'APROVADO'
      AND tentativa.status = 'APROVADA'
      AND tentativa.resultado_destino IN (
        'APROVADO',
        'APROVEITADO'
      )
  )
  SELECT
    p_turma_id,
    origem.disciplina_id,
    v_aluno_id,
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN dependencia.nota_p
      ELSE origem.nota_p
    END,
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN dependencia.nota_ti
      ELSE origem.nota_ti
    END,
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN dependencia.nota_tg
      ELSE origem.nota_tg
    END,
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN dependencia.nota_s
      ELSE origem.nota_s
    END,
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN dependencia.nota_cq
      ELSE origem.nota_cq
    END,
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN dependencia.nota_o
      ELSE origem.nota_o
    END,
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN coalesce(
          dependencia.nota_rec_destino,
          dependencia.nota_rec
        )
      ELSE origem.nota_rec
    END,
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN dependencia.total_aulas
      ELSE origem.total_aulas
    END,
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN dependencia.total_faltas
      ELSE origem.total_faltas
    END,
    coalesce(
      canonico.frequencia_percent,
      origem.frequencia_percent
    ),
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN dependencia.media_parcial_destino
      ELSE origem.media_parcial
    END,
    coalesce(canonico.media_final, origem.media_final),
    CASE
      WHEN dependencia.tentativa_id IS NOT NULL
        THEN 'APROVADO_DEPENDENCIA'
      ELSE coalesce(canonico.resultado_final, origem.resultado_final)
    END
  FROM resultados_origem origem
  LEFT JOIN resultados_canonicos canonico
    ON canonico.disciplina_id = origem.disciplina_id
  LEFT JOIN dependencias_aprovadas dependencia
    ON dependencia.disciplina_id = origem.disciplina_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_aluno_diario_resultados(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_aluno_diario_resultados(uuid, uuid[])
  TO authenticated;

COMMENT ON FUNCTION
  public.get_aluno_diario_resultados(uuid, uuid[])
IS
  'Portal do aluno: mantém a turma original, substitui somente o componente aprovado em dependência pelo resultado da tentativa vencedora e sinaliza APROVADO_DEPENDENCIA sem alterar o resultado acadêmico canônico.';

NOTIFY pgrst, 'reload schema';

COMMIT;
