CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  polo_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  type_id text NOT NULL DEFAULT 'evt',
  visibility text NOT NULL DEFAULT 'GENERAL',
  professor_id uuid REFERENCES public.parceiros(id) ON DELETE CASCADE,
  turma_id uuid REFERENCES public.turmas(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_title_not_blank
    CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT calendar_events_description_length
    CHECK (description IS NULL OR length(description) <= 2000),
  CONSTRAINT calendar_events_type_id_format
    CHECK (type_id ~ '^[a-z0-9_-]{1,40}$'),
  CONSTRAINT calendar_events_visibility_valid
    CHECK (visibility IN ('GENERAL', 'PROFESSOR', 'TURMA', 'PERSONAL')),
  CONSTRAINT calendar_events_visibility_scope_valid
    CHECK (
      (visibility = 'GENERAL' AND professor_id IS NULL AND turma_id IS NULL)
      OR (visibility IN ('PROFESSOR', 'PERSONAL') AND professor_id IS NOT NULL AND turma_id IS NULL)
      OR (visibility = 'TURMA' AND turma_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_polo_date
  ON public.calendar_events (polo_id, event_date);

CREATE INDEX IF NOT EXISTS idx_calendar_events_professor_date
  ON public.calendar_events (professor_id, event_date)
  WHERE professor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_turma_date
  ON public.calendar_events (turma_id, event_date)
  WHERE turma_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_professor_can_access_polo(p_polo_id uuid)
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

CREATE OR REPLACE FUNCTION public.current_aluno_can_access_polo(p_polo_id uuid)
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

REVOKE ALL ON FUNCTION public.current_professor_can_access_polo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_professor_can_access_polo(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.current_aluno_can_access_polo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_aluno_can_access_polo(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_calendar_event_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_calendar_event_updated_at ON public.calendar_events;
CREATE TRIGGER trg_touch_calendar_event_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.touch_calendar_event_updated_at();

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

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
    public.current_professor_can_access_polo(polo_id)
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
    public.current_aluno_can_access_polo(polo_id)
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
    AND created_by = auth.uid()
    AND public.current_professor_can_access_polo(polo_id)
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
    AND created_by = auth.uid()
    AND public.current_professor_can_access_polo(polo_id)
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
    AND created_by = auth.uid()
    AND public.current_professor_can_access_polo(polo_id)
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
    AND created_by = auth.uid()
    AND public.current_professor_can_access_polo(polo_id)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'calendar_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
  END IF;
END;
$$;
