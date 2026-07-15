-- Garante que lançamentos acadêmicos apontem para matrícula, aula e estágio
-- válidos. As validações vivem no banco para não depender do cliente.

CREATE SCHEMA IF NOT EXISTS internal_academic;
GRANT USAGE ON SCHEMA internal_academic TO authenticated, service_role;

CREATE OR REPLACE FUNCTION internal_academic.is_active_student_in_turma(
  p_turma_id uuid,
  p_aluno_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas m
    WHERE m.turma_id = p_turma_id
      AND m.aluno_id = p_aluno_id
      AND m.status = 'ATIVO'
  );
$$;

CREATE OR REPLACE FUNCTION internal_academic.is_aula_in_academic_context(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_aula_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.aulas_turma a
    WHERE a.id = p_aula_id
      AND a.turma_id = p_turma_id
      AND a.disciplina_id = p_disciplina_id
  );
$$;

CREATE OR REPLACE FUNCTION internal_academic.is_technical_stage_discipline(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    JOIN public.turmas_disciplinas td
      ON td.turma_id = t.id
     AND td.disciplina_id = p_disciplina_id
    JOIN public.disciplinas d ON d.id = td.disciplina_id
    WHERE t.id = p_turma_id
      AND c.modalidade = 'TECNICO'
      AND coalesce(d.carga_horaria_estagio, 0) > 0
  );
$$;

REVOKE ALL ON FUNCTION internal_academic.is_active_student_in_turma(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION internal_academic.is_aula_in_academic_context(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION internal_academic.is_technical_stage_discipline(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal_academic.is_active_student_in_turma(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal_academic.is_aula_in_academic_context(uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal_academic.is_technical_stage_discipline(uuid, uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "portal_matriculas_estagios_select"
  ON public.matriculas_estagios;
CREATE POLICY "portal_matriculas_estagios_select"
  ON public.matriculas_estagios FOR SELECT TO authenticated
  USING (
    (
      aluno_id = (SELECT public.current_aluno_id())
      AND (SELECT public.is_aluno_matriculado_turma(turma_id))
    )
    OR (SELECT public.can_write_turma(turma_id))
    OR (
      (SELECT public.is_professor_assigned_disciplina(turma_id, disciplina_id))
      AND (SELECT internal_academic.is_technical_stage_discipline(turma_id, disciplina_id))
    )
  );

DROP POLICY IF EXISTS "portal_diario_frequencia_insert" ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_update" ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_delete" ON public.diario_frequencia;
CREATE POLICY "portal_diario_frequencia_insert"
  ON public.diario_frequencia FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
    AND (SELECT internal_academic.is_aula_in_academic_context(turma_id, disciplina_id, aula_id))
  );
CREATE POLICY "portal_diario_frequencia_update"
  ON public.diario_frequencia FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
    AND (SELECT internal_academic.is_aula_in_academic_context(turma_id, disciplina_id, aula_id))
  )
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
    AND (SELECT internal_academic.is_aula_in_academic_context(turma_id, disciplina_id, aula_id))
  );
CREATE POLICY "portal_diario_frequencia_delete"
  ON public.diario_frequencia FOR DELETE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
    AND (SELECT internal_academic.is_aula_in_academic_context(turma_id, disciplina_id, aula_id))
  );

DROP POLICY IF EXISTS "portal_diario_notas_insert" ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_update" ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_delete" ON public.diario_notas;
CREATE POLICY "portal_diario_notas_insert"
  ON public.diario_notas FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
  );
CREATE POLICY "portal_diario_notas_update"
  ON public.diario_notas FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
  )
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
  );
CREATE POLICY "portal_diario_notas_delete"
  ON public.diario_notas FOR DELETE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
  );

DROP POLICY IF EXISTS "portal_diario_praticas_insert" ON public.diario_praticas;
DROP POLICY IF EXISTS "portal_diario_praticas_update" ON public.diario_praticas;
DROP POLICY IF EXISTS "portal_diario_praticas_delete" ON public.diario_praticas;
CREATE POLICY "portal_diario_praticas_insert"
  ON public.diario_praticas FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_aula_in_academic_context(turma_id, disciplina_id, aula_id))
  );
CREATE POLICY "portal_diario_praticas_update"
  ON public.diario_praticas FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_aula_in_academic_context(turma_id, disciplina_id, aula_id))
  )
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_aula_in_academic_context(turma_id, disciplina_id, aula_id))
  );
CREATE POLICY "portal_diario_praticas_delete"
  ON public.diario_praticas FOR DELETE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_aula_in_academic_context(turma_id, disciplina_id, aula_id))
  );

DROP POLICY IF EXISTS "portal_matriculas_estagios_insert" ON public.matriculas_estagios;
DROP POLICY IF EXISTS "portal_matriculas_estagios_update" ON public.matriculas_estagios;
DROP POLICY IF EXISTS "portal_matriculas_estagios_delete" ON public.matriculas_estagios;
CREATE POLICY "portal_matriculas_estagios_insert"
  ON public.matriculas_estagios FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
    AND (SELECT internal_academic.is_technical_stage_discipline(turma_id, disciplina_id))
  );
CREATE POLICY "portal_matriculas_estagios_update"
  ON public.matriculas_estagios FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
    AND (SELECT internal_academic.is_technical_stage_discipline(turma_id, disciplina_id))
  )
  WITH CHECK (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
    AND (SELECT internal_academic.is_technical_stage_discipline(turma_id, disciplina_id))
  );
CREATE POLICY "portal_matriculas_estagios_delete"
  ON public.matriculas_estagios FOR DELETE TO authenticated
  USING (
    (SELECT public.can_write_academic_record_open(turma_id, disciplina_id))
    AND (SELECT internal_academic.is_active_student_in_turma(turma_id, aluno_id))
    AND (SELECT internal_academic.is_technical_stage_discipline(turma_id, disciplina_id))
  );

CREATE OR REPLACE FUNCTION public.enforce_diario_frequencia_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT internal_academic.is_active_student_in_turma(NEW.turma_id, NEW.aluno_id)
    OR NOT internal_academic.is_aula_in_academic_context(
      NEW.turma_id, NEW.disciplina_id, NEW.aula_id
    ) THEN
    RAISE EXCEPTION 'Frequência fora do contexto acadêmico válido.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_diario_notas_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT internal_academic.is_active_student_in_turma(NEW.turma_id, NEW.aluno_id) THEN
    RAISE EXCEPTION 'Nota sem matrícula ativa na turma.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_diario_praticas_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT internal_academic.is_aula_in_academic_context(
    NEW.turma_id, NEW.disciplina_id, NEW.aula_id
  ) THEN
    RAISE EXCEPTION 'Prática vinculada a aula de outro contexto acadêmico.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_estagio_operacional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_row public.matriculas_estagios%rowtype;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  IF NOT public.can_write_academic_record_open(
    v_row.turma_id, v_row.disciplina_id
  ) THEN
    RAISE EXCEPTION 'O estágio só pode ser alterado por ator autorizado em período operacional.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF NOT internal_academic.is_active_student_in_turma(v_row.turma_id, v_row.aluno_id) THEN
      RAISE EXCEPTION 'O aluno não possui matrícula ativa nesta turma.'
        USING ERRCODE = '23514';
    END IF;
    IF NOT internal_academic.is_technical_stage_discipline(
      v_row.turma_id, v_row.disciplina_id
    ) THEN
      RAISE EXCEPTION 'A disciplina informada não possui estágio técnico configurado.'
        USING ERRCODE = '23514';
    END IF;
    IF NOT public.is_aluno_vacinas_estagio_liberado(
      v_row.turma_id, v_row.aluno_id
    ) THEN
      RAISE EXCEPTION 'O aluno possui pendências vacinais para o estágio.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_diario_frequencia_context()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_diario_notas_context()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_diario_praticas_context()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_estagio_operacional()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_diario_frequencia_context_trigger
  ON public.diario_frequencia;
CREATE TRIGGER enforce_diario_frequencia_context_trigger
BEFORE INSERT OR UPDATE ON public.diario_frequencia
FOR EACH ROW EXECUTE FUNCTION public.enforce_diario_frequencia_context();

DROP TRIGGER IF EXISTS enforce_diario_notas_context_trigger
  ON public.diario_notas;
CREATE TRIGGER enforce_diario_notas_context_trigger
BEFORE INSERT OR UPDATE ON public.diario_notas
FOR EACH ROW EXECUTE FUNCTION public.enforce_diario_notas_context();

DROP TRIGGER IF EXISTS enforce_diario_praticas_context_trigger
  ON public.diario_praticas;
CREATE TRIGGER enforce_diario_praticas_context_trigger
BEFORE INSERT OR UPDATE ON public.diario_praticas
FOR EACH ROW EXECUTE FUNCTION public.enforce_diario_praticas_context();

-- O trigger de estágio existente continua associado à função redefinida acima.
