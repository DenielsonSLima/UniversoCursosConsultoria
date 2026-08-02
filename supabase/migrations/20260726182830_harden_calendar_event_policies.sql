CREATE SCHEMA IF NOT EXISTS calendar_private;
REVOKE ALL ON SCHEMA calendar_private FROM PUBLIC;
GRANT USAGE ON SCHEMA calendar_private TO authenticated;

CREATE OR REPLACE FUNCTION calendar_private.current_professor_can_access_polo(p_polo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parceiros p
    WHERE p.id = public.current_professor_id()
      AND public.is_active_status(p.status)
      AND (
        p.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[]))
        OR EXISTS (
          SELECT 1
          FROM public.turmas_disciplinas td
          JOIN public.turmas t ON t.id = td.turma_id
          WHERE td.professor_id = p.id
            AND t.polo_id = p_polo_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION calendar_private.current_aluno_can_access_polo(p_polo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parceiros p
    WHERE p.id = public.current_aluno_id()
      AND public.is_active_status(p.status)
      AND (
        p.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[]))
        OR EXISTS (
          SELECT 1
          FROM public.matriculas m
          JOIN public.turmas t ON t.id = m.turma_id
          WHERE m.aluno_id = p.id
            AND t.polo_id = p_polo_id
            AND m.status IN ('ATIVO', 'CONCLUIDO')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION calendar_private.current_professor_can_access_polo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calendar_private.current_professor_can_access_polo(uuid) TO authenticated;
REVOKE ALL ON FUNCTION calendar_private.current_aluno_can_access_polo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calendar_private.current_aluno_can_access_polo(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by
  ON public.calendar_events (created_by);

DROP POLICY IF EXISTS calendar_events_select ON public.calendar_events;
CREATE POLICY calendar_events_select
ON public.calendar_events
FOR SELECT
TO authenticated
USING (
  (
    public.gestor_has_module('calendario')
    AND public.is_gestor_for_polo(polo_id)
  )
  OR (
    calendar_private.current_professor_can_access_polo(polo_id)
    AND (
      visibility = 'GENERAL'
      OR (
        visibility IN ('PROFESSOR', 'PERSONAL')
        AND professor_id = public.current_professor_id()
      )
      OR (
        visibility = 'TURMA'
        AND public.is_professor_assigned_turma(turma_id)
      )
    )
  )
  OR (
    calendar_private.current_aluno_can_access_polo(polo_id)
    AND (
      visibility = 'GENERAL'
      OR (
        visibility = 'TURMA'
        AND public.is_aluno_matriculado_turma(turma_id)
      )
    )
  )
);

DROP POLICY IF EXISTS calendar_events_insert ON public.calendar_events;
CREATE POLICY calendar_events_insert
ON public.calendar_events
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.gestor_has_module('calendario')
    AND public.is_gestor_for_polo(polo_id)
  )
  OR (
    visibility = 'PERSONAL'
    AND professor_id = public.current_professor_id()
    AND turma_id IS NULL
    AND created_by = (SELECT auth.uid())
    AND calendar_private.current_professor_can_access_polo(polo_id)
  )
);

DROP POLICY IF EXISTS calendar_events_update ON public.calendar_events;
CREATE POLICY calendar_events_update
ON public.calendar_events
FOR UPDATE
TO authenticated
USING (
  (
    public.gestor_has_module('calendario')
    AND public.is_gestor_for_polo(polo_id)
  )
  OR (
    visibility = 'PERSONAL'
    AND professor_id = public.current_professor_id()
    AND created_by = (SELECT auth.uid())
    AND calendar_private.current_professor_can_access_polo(polo_id)
  )
)
WITH CHECK (
  (
    public.gestor_has_module('calendario')
    AND public.is_gestor_for_polo(polo_id)
  )
  OR (
    visibility = 'PERSONAL'
    AND professor_id = public.current_professor_id()
    AND turma_id IS NULL
    AND created_by = (SELECT auth.uid())
    AND calendar_private.current_professor_can_access_polo(polo_id)
  )
);

DROP POLICY IF EXISTS calendar_events_delete ON public.calendar_events;
CREATE POLICY calendar_events_delete
ON public.calendar_events
FOR DELETE
TO authenticated
USING (
  (
    public.gestor_has_module('calendario')
    AND public.is_gestor_for_polo(polo_id)
  )
  OR (
    visibility = 'PERSONAL'
    AND professor_id = public.current_professor_id()
    AND created_by = (SELECT auth.uid())
    AND calendar_private.current_professor_can_access_polo(polo_id)
  )
);

DROP FUNCTION IF EXISTS public.current_professor_can_access_polo(uuid);
DROP FUNCTION IF EXISTS public.current_aluno_can_access_polo(uuid);
