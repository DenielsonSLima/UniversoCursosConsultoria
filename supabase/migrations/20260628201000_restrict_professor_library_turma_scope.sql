CREATE OR REPLACE FUNCTION public.professor_can_publish_library_document(
  p_teacher_id uuid,
  p_publico_alvo text,
  p_turma_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      COALESCE(p_turma_ids, '{}'::uuid[]) AS turma_ids,
      COALESCE(UPPER(TRIM(p_publico_alvo)), '') AS audience
  ),
  selected_turmas AS (
    SELECT DISTINCT unnest(input.turma_ids) AS turma_id
    FROM input
  )
  SELECT
    p_teacher_id IS NOT NULL
    AND p_teacher_id = public.current_professor_id()
    AND (
      (
        (SELECT audience FROM input) = 'INTERNO'
        AND COALESCE(cardinality((SELECT turma_ids FROM input)), 0) = 0
      )
      OR
      (
        (SELECT audience FROM input) = 'ALUNOS'
        AND COALESCE(cardinality((SELECT turma_ids FROM input)), 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM selected_turmas st
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.turmas_disciplinas td
            JOIN public.turmas t ON t.id = td.turma_id
            WHERE td.turma_id = st.turma_id
              AND td.professor_id = p_teacher_id
              AND UPPER(COALESCE(t.status, '')) IN ('EM_ANDAMENTO', 'ATIVO')
          )
        )
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.professor_can_publish_library_document(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professor_can_publish_library_document(uuid, text, uuid[]) TO authenticated, service_role;

DROP POLICY IF EXISTS "portal_biblioteca_documentos_insert" ON public.biblioteca_documentos;
DROP POLICY IF EXISTS "portal_biblioteca_documentos_update" ON public.biblioteca_documentos;
DROP POLICY IF EXISTS "portal_biblioteca_documentos_delete" ON public.biblioteca_documentos;
DROP POLICY IF EXISTS "portal_biblioteca_documentos_write" ON public.biblioteca_documentos;
DROP POLICY IF EXISTS "portal_biblioteca_documentos_select" ON public.biblioteca_documentos;

CREATE POLICY "portal_biblioteca_documentos_select"
  ON public.biblioteca_documentos
  FOR SELECT
  TO authenticated
  USING (
    public.is_gestor()
    OR teacher_id = public.current_professor_id()
    OR publico_alvo IN ('ALUNOS', 'TODOS', 'PROFESSORES')
  );

CREATE POLICY "portal_biblioteca_documentos_insert"
  ON public.biblioteca_documentos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_gestor()
    OR public.professor_can_publish_library_document(teacher_id, publico_alvo, turma_ids)
  );

CREATE POLICY "portal_biblioteca_documentos_update"
  ON public.biblioteca_documentos
  FOR UPDATE
  TO authenticated
  USING (
    public.is_gestor()
    OR teacher_id = public.current_professor_id()
  )
  WITH CHECK (
    public.is_gestor()
    OR public.professor_can_publish_library_document(teacher_id, publico_alvo, turma_ids)
  );

CREATE POLICY "portal_biblioteca_documentos_delete"
  ON public.biblioteca_documentos
  FOR DELETE
  TO authenticated
  USING (
    public.is_gestor()
    OR teacher_id = public.current_professor_id()
  );
