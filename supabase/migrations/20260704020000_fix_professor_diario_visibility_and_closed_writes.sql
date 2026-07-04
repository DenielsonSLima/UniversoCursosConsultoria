-- Corrige visibilidade do diário para professores sem abrir dados de outras turmas.
-- Também separa leitura e escrita para que turma finalizada fique apenas consulta para docente.

CREATE INDEX IF NOT EXISTS idx_matriculas_aluno_turma
  ON public.matriculas (aluno_id, turma_id);

CREATE INDEX IF NOT EXISTS idx_turmas_disciplinas_professor_turma_disciplina
  ON public.turmas_disciplinas (professor_id, turma_id, disciplina_id);

CREATE OR REPLACE FUNCTION public.is_professor_assigned_aluno(p_aluno_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas m
    JOIN public.turmas_disciplinas td ON td.turma_id = m.turma_id
    WHERE m.aluno_id = p_aluno_id
      AND td.professor_id = public.current_professor_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_professor_assigned_disciplina_open(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas_disciplinas td
    JOIN public.turmas t ON t.id = td.turma_id
    WHERE td.turma_id = p_turma_id
      AND td.disciplina_id = p_disciplina_id
      AND td.professor_id = public.current_professor_id()
      AND upper(coalesce(t.status, '')) <> 'FINALIZADA'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_professor_assigned_aluno(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_professor_assigned_disciplina_open(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_professor_assigned_aluno(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_professor_assigned_disciplina_open(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "portal_parceiros_select" ON public.parceiros;
CREATE POLICY "portal_parceiros_select"
  ON public.parceiros FOR SELECT
  TO authenticated
  USING (
    id = (SELECT public.current_aluno_id())
    OR id = (SELECT public.current_professor_id())
    OR public.is_partner_in_gestor_scope(polo_id, polo_ids)
    OR (
      tipo = 'Aluno'
      AND public.is_professor_assigned_aluno(id)
    )
  );

CREATE OR REPLACE FUNCTION public.get_turma_alunos_academico(
  p_turma_id UUID
)
RETURNS TABLE (
  matricula_id UUID,
  aluno_id UUID,
  nome TEXT,
  cpf TEXT,
  data_nascimento DATE,
  data_matricula TIMESTAMPTZ,
  status TEXT,
  frequencia_percent NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    p.id,
    p.nome,
    p.cpf_cnpj,
    p.data_nascimento,
    m.data_matricula,
    m.status,
    ROUND(AVG(v.frequencia_percent), 1)
  FROM public.matriculas m
  JOIN public.parceiros p ON p.id = m.aluno_id
  LEFT JOIN public.v_diario_notas_resultados v
    ON v.turma_id = m.turma_id
   AND v.aluno_id = m.aluno_id
  WHERE m.turma_id = p_turma_id
    AND (
      public.can_write_turma(p_turma_id)
      OR public.is_professor_assigned_turma(p_turma_id)
      OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    )
  GROUP BY m.id, p.id, p.nome, p.cpf_cnpj, p.data_nascimento, m.data_matricula, m.status
  ORDER BY p.nome;
$$;

REVOKE EXECUTE ON FUNCTION public.get_turma_alunos_academico(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_turma_alunos_academico(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "portal_aulas_turma_select" ON public.aulas_turma;
DROP POLICY IF EXISTS "portal_aulas_turma_write" ON public.aulas_turma;
DROP POLICY IF EXISTS "portal_aulas_turma_insert" ON public.aulas_turma;
DROP POLICY IF EXISTS "portal_aulas_turma_update" ON public.aulas_turma;
DROP POLICY IF EXISTS "portal_aulas_turma_delete" ON public.aulas_turma;

CREATE POLICY "portal_aulas_turma_select"
  ON public.aulas_turma FOR SELECT
  TO authenticated
  USING (public.can_access_turma(turma_id));

CREATE POLICY "portal_aulas_turma_insert"
  ON public.aulas_turma FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_aulas_turma_update"
  ON public.aulas_turma FOR UPDATE
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  )
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_aulas_turma_delete"
  ON public.aulas_turma FOR DELETE
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

DROP POLICY IF EXISTS "portal_diario_frequencia_access" ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_select" ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_insert" ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_update" ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_delete" ON public.diario_frequencia;

CREATE POLICY "portal_diario_frequencia_select"
  ON public.diario_frequencia FOR SELECT
  TO authenticated
  USING (
    aluno_id = (SELECT public.current_aluno_id())
    OR public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_frequencia_insert"
  ON public.diario_frequencia FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_frequencia_update"
  ON public.diario_frequencia FOR UPDATE
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  )
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_frequencia_delete"
  ON public.diario_frequencia FOR DELETE
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

DROP POLICY IF EXISTS "portal_diario_notas_access" ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_select" ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_insert" ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_update" ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_delete" ON public.diario_notas;

CREATE POLICY "portal_diario_notas_select"
  ON public.diario_notas FOR SELECT
  TO authenticated
  USING (
    aluno_id = (SELECT public.current_aluno_id())
    OR public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_notas_insert"
  ON public.diario_notas FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_notas_update"
  ON public.diario_notas FOR UPDATE
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  )
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_notas_delete"
  ON public.diario_notas FOR DELETE
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

DROP POLICY IF EXISTS "portal_diario_praticas_access" ON public.diario_praticas;
DROP POLICY IF EXISTS "portal_diario_praticas_select" ON public.diario_praticas;
DROP POLICY IF EXISTS "portal_diario_praticas_insert" ON public.diario_praticas;
DROP POLICY IF EXISTS "portal_diario_praticas_update" ON public.diario_praticas;
DROP POLICY IF EXISTS "portal_diario_praticas_delete" ON public.diario_praticas;

CREATE POLICY "portal_diario_praticas_select"
  ON public.diario_praticas FOR SELECT
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_praticas_insert"
  ON public.diario_praticas FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_praticas_update"
  ON public.diario_praticas FOR UPDATE
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  )
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_praticas_delete"
  ON public.diario_praticas FOR DELETE
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

DROP POLICY IF EXISTS "portal_diario_observacoes_access" ON public.diario_observacoes;
DROP POLICY IF EXISTS "portal_diario_observacoes_select" ON public.diario_observacoes;
DROP POLICY IF EXISTS "portal_diario_observacoes_insert" ON public.diario_observacoes;
DROP POLICY IF EXISTS "portal_diario_observacoes_update" ON public.diario_observacoes;
DROP POLICY IF EXISTS "portal_diario_observacoes_delete" ON public.diario_observacoes;

CREATE POLICY "portal_diario_observacoes_select"
  ON public.diario_observacoes FOR SELECT
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_observacoes_insert"
  ON public.diario_observacoes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_observacoes_update"
  ON public.diario_observacoes FOR UPDATE
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  )
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_diario_observacoes_delete"
  ON public.diario_observacoes FOR DELETE
  TO authenticated
  USING (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina_open(turma_id, disciplina_id)
  );
