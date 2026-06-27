-- Harden portal access by role and polo without blocking the public catalogue.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
$$;

CREATE OR REPLACE FUNCTION public.is_active_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(upper(trim(p_status)), 'ATIVO') NOT IN ('INATIVO', 'INACTIVE', 'BLOQUEADO', 'CANCELADO');
$$;

CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE lower(u.email) = public.auth_email()
      AND public.is_active_status(u.status)
  );
$$;

CREATE OR REPLACE FUNCTION public.gestor_polo_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN u.context::uuid
    ELSE NULL::uuid
  END
  FROM public.usuarios_sistema u
  WHERE lower(u.email) = public.auth_email()
    AND public.is_active_status(u.status)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_gestor_global()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    LEFT JOIN public.polos p
      ON p.id = CASE
        WHEN u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN u.context::uuid
        ELSE NULL::uuid
      END
    WHERE lower(u.email) = public.auth_email()
      AND public.is_active_status(u.status)
      AND (
        lower(coalesce(u.context, '')) = 'global'
        OR coalesce(p.is_matriz, false) = true
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_gestor_for_polo(p_polo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_gestor_global()
    OR (
      public.is_gestor()
      AND (
        p_polo_id IS NULL
        OR public.gestor_polo_id() = p_polo_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.current_aluno_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.parceiros p
  WHERE lower(coalesce(p.email, '')) = public.auth_email()
    AND p.tipo = 'Aluno'
    AND public.is_active_status(p.status)
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_professor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.parceiros p
  WHERE lower(coalesce(p.email, '')) = public.auth_email()
    AND p.tipo = 'Professor'
    AND public.is_active_status(p.status)
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_partner_in_gestor_scope(p_polo_id uuid, p_polo_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_gestor_global()
    OR (
      public.is_gestor()
      AND (
        p_polo_id IS NULL
        OR public.gestor_polo_id() = p_polo_id
        OR public.gestor_polo_id() = ANY(coalesce(p_polo_ids, ARRAY[]::uuid[]))
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_public_course(p_curso_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cursos c
    WHERE c.id = p_curso_id
      AND lower(coalesce(c.status, '')) = 'ativo'
      AND coalesce(c.publicar_site, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_public_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = p_turma_id
      AND upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
      AND lower(coalesce(c.status, '')) = 'ativo'
      AND coalesce(c.publicar_site, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_aluno_matriculado_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas m
    WHERE m.turma_id = p_turma_id
      AND m.aluno_id = public.current_aluno_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_professor_assigned_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas_disciplinas td
    WHERE td.turma_id = p_turma_id
      AND td.professor_id = public.current_professor_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_professor_assigned_disciplina(p_turma_id uuid, p_disciplina_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas_disciplinas td
    WHERE td.turma_id = p_turma_id
      AND td.disciplina_id = p_disciplina_id
      AND td.professor_id = public.current_professor_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas t
    WHERE t.id = p_turma_id
      AND (
        public.is_public_turma(t.id)
        OR public.is_gestor_for_polo(t.polo_id)
        OR public.is_aluno_matriculado_turma(t.id)
        OR public.is_professor_assigned_turma(t.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas t
    WHERE t.id = p_turma_id
      AND public.is_gestor_for_polo(t.polo_id)
  );
$$;

-- CPF/e-mail login should not require direct anonymous access to private tables.
CREATE OR REPLACE FUNCTION public.resolve_portal_login_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value text := lower(trim(coalesce(p_identifier, '')));
  v_digits text := regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g');
  v_email text;
BEGIN
  IF v_value LIKE '%@%' THEN
    RETURN v_value;
  END IF;

  IF length(v_digits) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT lower(p.email)
    INTO v_email
  FROM public.parceiros p
  WHERE regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g') = v_digits
    AND p.email IS NOT NULL
    AND public.is_active_status(p.status)
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  SELECT lower(u.email)
    INTO v_email
  FROM public.usuarios_sistema u
  WHERE regexp_replace(coalesce(u.cpf, ''), '\D', '', 'g') = v_digits
    AND u.email IS NOT NULL
    AND public.is_active_status(u.status)
  ORDER BY u.created_at DESC NULLS LAST
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_portal_login_email(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants: keep public catalogue reads, move private reads behind RLS.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.parceiros FROM anon;
REVOKE ALL ON TABLE public.usuarios_sistema FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.cursos FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.turmas FROM anon, authenticated;

GRANT SELECT ON TABLE public.cursos TO anon, authenticated;
GRANT SELECT ON TABLE public.turmas TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.cursos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.turmas TO authenticated;
GRANT SELECT ON TABLE public.polos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.parceiros TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.usuarios_sistema TO authenticated;

-- ---------------------------------------------------------------------------
-- Core policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total local cursos" ON public.cursos;
DROP POLICY IF EXISTS "portal_cursos_select" ON public.cursos;
DROP POLICY IF EXISTS "portal_cursos_write_global" ON public.cursos;
CREATE POLICY "portal_cursos_select"
  ON public.cursos FOR SELECT
  USING (
    public.is_public_course(id)
    OR public.is_gestor()
    OR EXISTS (
      SELECT 1
      FROM public.matriculas m
      JOIN public.turmas t ON t.id = m.turma_id
      WHERE m.aluno_id = public.current_aluno_id()
        AND t.curso_id = cursos.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.turmas_disciplinas td
      JOIN public.turmas t ON t.id = td.turma_id
      WHERE td.professor_id = public.current_professor_id()
        AND t.curso_id = cursos.id
    )
  );
CREATE POLICY "portal_cursos_write_global"
  ON public.cursos FOR ALL
  TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

DROP POLICY IF EXISTS "Acesso total local turmas" ON public.turmas;
DROP POLICY IF EXISTS "portal_turmas_select" ON public.turmas;
DROP POLICY IF EXISTS "portal_turmas_write_gestor_polo" ON public.turmas;
CREATE POLICY "portal_turmas_select"
  ON public.turmas FOR SELECT
  USING (
    public.is_public_turma(id)
    OR public.is_gestor_for_polo(polo_id)
    OR public.is_aluno_matriculado_turma(id)
    OR public.is_professor_assigned_turma(id)
  );
CREATE POLICY "portal_turmas_write_gestor_polo"
  ON public.turmas FOR ALL
  TO authenticated
  USING (public.is_gestor_for_polo(polo_id))
  WITH CHECK (public.is_gestor_for_polo(polo_id));

DROP POLICY IF EXISTS "Acesso total local parceiros" ON public.parceiros;
DROP POLICY IF EXISTS "portal_parceiros_select" ON public.parceiros;
DROP POLICY IF EXISTS "portal_parceiros_insert" ON public.parceiros;
DROP POLICY IF EXISTS "portal_parceiros_update" ON public.parceiros;
DROP POLICY IF EXISTS "portal_parceiros_delete_gestor" ON public.parceiros;
CREATE POLICY "portal_parceiros_select"
  ON public.parceiros FOR SELECT
  TO authenticated
  USING (
    id = public.current_aluno_id()
    OR id = public.current_professor_id()
    OR public.is_partner_in_gestor_scope(polo_id, polo_ids)
  );
CREATE POLICY "portal_parceiros_insert"
  ON public.parceiros FOR INSERT
  WITH CHECK (
    tipo = 'Aluno'
    OR public.is_partner_in_gestor_scope(polo_id, polo_ids)
  );
CREATE POLICY "portal_parceiros_update"
  ON public.parceiros FOR UPDATE
  TO authenticated
  USING (
    id = public.current_aluno_id()
    OR id = public.current_professor_id()
    OR public.is_partner_in_gestor_scope(polo_id, polo_ids)
  )
  WITH CHECK (
    id = public.current_aluno_id()
    OR id = public.current_professor_id()
    OR public.is_partner_in_gestor_scope(polo_id, polo_ids)
  );
CREATE POLICY "portal_parceiros_delete_gestor"
  ON public.parceiros FOR DELETE
  TO authenticated
  USING (public.is_partner_in_gestor_scope(polo_id, polo_ids));

DROP POLICY IF EXISTS "Acesso total local matriculas" ON public.matriculas;
DROP POLICY IF EXISTS "portal_matriculas_select" ON public.matriculas;
DROP POLICY IF EXISTS "portal_matriculas_write_gestor" ON public.matriculas;
CREATE POLICY "portal_matriculas_select"
  ON public.matriculas FOR SELECT
  USING (
    aluno_id = public.current_aluno_id()
    OR public.is_professor_assigned_turma(turma_id)
    OR public.can_write_turma(turma_id)
  );
CREATE POLICY "portal_matriculas_write_gestor"
  ON public.matriculas FOR ALL
  TO authenticated
  USING (public.can_write_turma(turma_id))
  WITH CHECK (public.can_write_turma(turma_id));

DROP POLICY IF EXISTS "Acesso total local documentos_aluno" ON public.documentos_aluno;
DROP POLICY IF EXISTS "portal_documentos_aluno_select" ON public.documentos_aluno;
DROP POLICY IF EXISTS "portal_documentos_aluno_write" ON public.documentos_aluno;
CREATE POLICY "portal_documentos_aluno_select"
  ON public.documentos_aluno FOR SELECT
  USING (
    aluno_id = public.current_aluno_id()
    OR EXISTS (
      SELECT 1 FROM public.parceiros p
      WHERE p.id = documentos_aluno.aluno_id
        AND public.is_partner_in_gestor_scope(p.polo_id, p.polo_ids)
    )
  );
CREATE POLICY "portal_documentos_aluno_write"
  ON public.documentos_aluno FOR ALL
  TO authenticated
  USING (
    aluno_id = public.current_aluno_id()
    OR EXISTS (
      SELECT 1 FROM public.parceiros p
      WHERE p.id = documentos_aluno.aluno_id
        AND public.is_partner_in_gestor_scope(p.polo_id, p.polo_ids)
    )
  )
  WITH CHECK (
    aluno_id = public.current_aluno_id()
    OR EXISTS (
      SELECT 1 FROM public.parceiros p
      WHERE p.id = documentos_aluno.aluno_id
        AND public.is_partner_in_gestor_scope(p.polo_id, p.polo_ids)
    )
  );

DROP POLICY IF EXISTS "Acesso total local polos" ON public.polos;
DROP POLICY IF EXISTS "portal_polos_select" ON public.polos;
DROP POLICY IF EXISTS "portal_polos_write_global" ON public.polos;
CREATE POLICY "portal_polos_select"
  ON public.polos FOR SELECT
  USING (
    coalesce(status, 'ativo') = 'ativo'
    OR public.is_gestor()
  );
CREATE POLICY "portal_polos_write_global"
  ON public.polos FOR ALL
  TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

DROP POLICY IF EXISTS "Acesso total local usuarios_sistema" ON public.usuarios_sistema;
DROP POLICY IF EXISTS "portal_usuarios_sistema_select" ON public.usuarios_sistema;
DROP POLICY IF EXISTS "portal_usuarios_sistema_write_global" ON public.usuarios_sistema;
CREATE POLICY "portal_usuarios_sistema_select"
  ON public.usuarios_sistema FOR SELECT
  TO authenticated
  USING (
    lower(email) = public.auth_email()
    OR public.is_gestor_global()
  );
CREATE POLICY "portal_usuarios_sistema_write_global"
  ON public.usuarios_sistema FOR ALL
  TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

-- ---------------------------------------------------------------------------
-- Optional policies for modules that may exist depending on migration order.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.turmas_disciplinas') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local turmas_disciplinas" ON public.turmas_disciplinas';
    EXECUTE 'DROP POLICY IF EXISTS "portal_turmas_disciplinas_select" ON public.turmas_disciplinas';
    EXECUTE 'DROP POLICY IF EXISTS "portal_turmas_disciplinas_write" ON public.turmas_disciplinas';
    EXECUTE 'CREATE POLICY "portal_turmas_disciplinas_select" ON public.turmas_disciplinas FOR SELECT USING (public.can_access_turma(turma_id) OR professor_id = public.current_professor_id())';
    EXECUTE 'CREATE POLICY "portal_turmas_disciplinas_write" ON public.turmas_disciplinas FOR ALL TO authenticated USING (public.can_write_turma(turma_id) OR professor_id = public.current_professor_id()) WITH CHECK (public.can_write_turma(turma_id) OR professor_id = public.current_professor_id())';
  END IF;

  IF to_regclass('public.aulas_turma') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local aulas_turma" ON public.aulas_turma';
    EXECUTE 'DROP POLICY IF EXISTS "portal_aulas_turma_select" ON public.aulas_turma';
    EXECUTE 'DROP POLICY IF EXISTS "portal_aulas_turma_write" ON public.aulas_turma';
    EXECUTE 'CREATE POLICY "portal_aulas_turma_select" ON public.aulas_turma FOR SELECT USING (public.can_access_turma(turma_id))';
    EXECUTE 'CREATE POLICY "portal_aulas_turma_write" ON public.aulas_turma FOR ALL TO authenticated USING (public.can_write_turma(turma_id) OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)) WITH CHECK (public.can_write_turma(turma_id) OR public.is_professor_assigned_disciplina(turma_id, disciplina_id))';
  END IF;

  IF to_regclass('public.diario_frequencia') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local diario_frequencia" ON public.diario_frequencia';
    EXECUTE 'DROP POLICY IF EXISTS "portal_diario_frequencia_access" ON public.diario_frequencia';
    EXECUTE 'CREATE POLICY "portal_diario_frequencia_access" ON public.diario_frequencia FOR ALL TO authenticated USING (aluno_id = public.current_aluno_id() OR public.can_write_turma(turma_id) OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)) WITH CHECK (public.can_write_turma(turma_id) OR public.is_professor_assigned_disciplina(turma_id, disciplina_id))';
  END IF;

  IF to_regclass('public.diario_notas') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local diario_notas" ON public.diario_notas';
    EXECUTE 'DROP POLICY IF EXISTS "portal_diario_notas_access" ON public.diario_notas';
    EXECUTE 'CREATE POLICY "portal_diario_notas_access" ON public.diario_notas FOR ALL TO authenticated USING (aluno_id = public.current_aluno_id() OR public.can_write_turma(turma_id) OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)) WITH CHECK (public.can_write_turma(turma_id) OR public.is_professor_assigned_disciplina(turma_id, disciplina_id))';
  END IF;

  IF to_regclass('public.diario_praticas') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local diario_praticas" ON public.diario_praticas';
    EXECUTE 'DROP POLICY IF EXISTS "portal_diario_praticas_access" ON public.diario_praticas';
    EXECUTE 'CREATE POLICY "portal_diario_praticas_access" ON public.diario_praticas FOR ALL TO authenticated USING (public.can_write_turma(turma_id) OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)) WITH CHECK (public.can_write_turma(turma_id) OR public.is_professor_assigned_disciplina(turma_id, disciplina_id))';
  END IF;

  IF to_regclass('public.diario_observacoes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local diario_observacoes" ON public.diario_observacoes';
    EXECUTE 'DROP POLICY IF EXISTS "portal_diario_observacoes_access" ON public.diario_observacoes';
    EXECUTE 'CREATE POLICY "portal_diario_observacoes_access" ON public.diario_observacoes FOR ALL TO authenticated USING (public.can_write_turma(turma_id) OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)) WITH CHECK (public.can_write_turma(turma_id) OR public.is_professor_assigned_disciplina(turma_id, disciplina_id))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.contas_receber') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local contas_receber" ON public.contas_receber';
    EXECUTE 'DROP POLICY IF EXISTS "portal_contas_receber_select" ON public.contas_receber';
    EXECUTE 'DROP POLICY IF EXISTS "portal_contas_receber_write_gestor" ON public.contas_receber';
    EXECUTE 'CREATE POLICY "portal_contas_receber_select" ON public.contas_receber FOR SELECT TO authenticated USING (cliente_id = public.current_aluno_id() OR public.is_gestor_for_polo(polo_id))';
    EXECUTE 'CREATE POLICY "portal_contas_receber_write_gestor" ON public.contas_receber FOR ALL TO authenticated USING (public.is_gestor_for_polo(polo_id)) WITH CHECK (public.is_gestor_for_polo(polo_id))';
  END IF;

  IF to_regclass('public.contas_pagar') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local contas_pagar" ON public.contas_pagar';
    EXECUTE 'DROP POLICY IF EXISTS "portal_contas_pagar_select" ON public.contas_pagar';
    EXECUTE 'DROP POLICY IF EXISTS "portal_contas_pagar_write_gestor" ON public.contas_pagar';
    EXECUTE 'CREATE POLICY "portal_contas_pagar_select" ON public.contas_pagar FOR SELECT TO authenticated USING (fornecedor_id = public.current_professor_id() OR public.is_gestor_for_polo(polo_id))';
    EXECUTE 'CREATE POLICY "portal_contas_pagar_write_gestor" ON public.contas_pagar FOR ALL TO authenticated USING (public.is_gestor_for_polo(polo_id)) WITH CHECK (public.is_gestor_for_polo(polo_id))';
  END IF;

  IF to_regclass('public.certificados_academicos') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso certificados secretaria" ON public.certificados_academicos';
    EXECUTE 'DROP POLICY IF EXISTS "portal_certificados_select" ON public.certificados_academicos';
    EXECUTE 'DROP POLICY IF EXISTS "portal_certificados_write_gestor" ON public.certificados_academicos';
    EXECUTE 'CREATE POLICY "portal_certificados_select" ON public.certificados_academicos FOR SELECT TO authenticated USING (aluno_id = public.current_aluno_id() OR public.is_gestor_for_polo(polo_id))';
    EXECUTE 'CREATE POLICY "portal_certificados_write_gestor" ON public.certificados_academicos FOR ALL TO authenticated USING (public.is_gestor_for_polo(polo_id)) WITH CHECK (public.is_gestor_for_polo(polo_id))';
  END IF;

  IF to_regclass('public.ead_aluno_progresso') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "ead_aluno_progresso_read" ON public.ead_aluno_progresso';
    EXECUTE 'DROP POLICY IF EXISTS "ead_aluno_progresso_insert" ON public.ead_aluno_progresso';
    EXECUTE 'DROP POLICY IF EXISTS "ead_aluno_progresso_update" ON public.ead_aluno_progresso';
    EXECUTE 'DROP POLICY IF EXISTS "portal_ead_aluno_progresso_access" ON public.ead_aluno_progresso';
    EXECUTE 'CREATE POLICY "portal_ead_aluno_progresso_access" ON public.ead_aluno_progresso FOR ALL TO authenticated USING (aluno_id = public.current_aluno_id() OR public.is_gestor()) WITH CHECK (aluno_id = public.current_aluno_id() OR public.is_gestor())';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.biblioteca_pastas') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local biblioteca_pastas" ON public.biblioteca_pastas';
    EXECUTE 'DROP POLICY IF EXISTS "portal_biblioteca_pastas_select" ON public.biblioteca_pastas';
    EXECUTE 'DROP POLICY IF EXISTS "portal_biblioteca_pastas_write" ON public.biblioteca_pastas';
    EXECUTE 'CREATE POLICY "portal_biblioteca_pastas_select" ON public.biblioteca_pastas FOR SELECT TO authenticated USING (teacher_id IS NULL OR teacher_id = public.current_professor_id() OR public.is_gestor())';
    EXECUTE 'CREATE POLICY "portal_biblioteca_pastas_write" ON public.biblioteca_pastas FOR ALL TO authenticated USING (public.is_gestor() OR teacher_id = public.current_professor_id()) WITH CHECK (public.is_gestor() OR teacher_id = public.current_professor_id())';
  END IF;

  IF to_regclass('public.biblioteca_documentos') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local biblioteca_documentos" ON public.biblioteca_documentos';
    EXECUTE 'DROP POLICY IF EXISTS "portal_biblioteca_documentos_select" ON public.biblioteca_documentos';
    EXECUTE 'DROP POLICY IF EXISTS "portal_biblioteca_documentos_write" ON public.biblioteca_documentos';
    EXECUTE 'CREATE POLICY "portal_biblioteca_documentos_select" ON public.biblioteca_documentos FOR SELECT TO authenticated USING (public.is_gestor_for_polo(polo_id) OR teacher_id = public.current_professor_id() OR publico_alvo IN (''ALUNOS'', ''TODOS'', ''PROFESSORES''))';
    EXECUTE 'CREATE POLICY "portal_biblioteca_documentos_write" ON public.biblioteca_documentos FOR ALL TO authenticated USING (public.is_gestor_for_polo(polo_id) OR teacher_id = public.current_professor_id()) WITH CHECK (public.is_gestor_for_polo(polo_id) OR teacher_id = public.current_professor_id())';
  END IF;

  IF to_regclass('public.comunicacao_chats') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local chats" ON public.comunicacao_chats';
    EXECUTE 'DROP POLICY IF EXISTS "portal_comunicacao_chats_access" ON public.comunicacao_chats';
    EXECUTE 'CREATE POLICY "portal_comunicacao_chats_access" ON public.comunicacao_chats FOR ALL TO authenticated USING (remetente_id = public.current_aluno_id() OR remetente_id = public.current_professor_id() OR public.is_gestor()) WITH CHECK (remetente_id = public.current_aluno_id() OR remetente_id = public.current_professor_id() OR public.is_gestor())';
  END IF;

  IF to_regclass('public.comunicacao_mensagens') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Acesso total local mensagens" ON public.comunicacao_mensagens';
    EXECUTE 'DROP POLICY IF EXISTS "portal_comunicacao_mensagens_access" ON public.comunicacao_mensagens';
    EXECUTE 'CREATE POLICY "portal_comunicacao_mensagens_access" ON public.comunicacao_mensagens FOR ALL TO authenticated USING (public.is_gestor() OR EXISTS (SELECT 1 FROM public.comunicacao_chats c WHERE c.id = chat_id AND (c.remetente_id = public.current_aluno_id() OR c.remetente_id = public.current_professor_id()))) WITH CHECK (public.is_gestor() OR EXISTS (SELECT 1 FROM public.comunicacao_chats c WHERE c.id = chat_id AND (c.remetente_id = public.current_aluno_id() OR c.remetente_id = public.current_professor_id())))';
  END IF;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'regras_cobranca',
    'taxas_pagamento',
    'empresas',
    'contas_bancarias',
    'categorias',
    'mensageria_config',
    'templates_mensagens',
    'asaas_config',
    'biblioteca_professor_quotas'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Acesso total local ' || table_name, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'portal_' || table_name || '_gestor_read', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'portal_' || table_name || '_global_write', table_name);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_gestor())', 'portal_' || table_name || '_gestor_read', table_name);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_gestor_global()) WITH CHECK (public.is_gestor_global())', 'portal_' || table_name || '_global_write', table_name);
    END IF;
  END LOOP;
END;
$$;

-- Storage policy hardening for authenticated users. Buckets stay compatible with
-- existing public URLs until the UI is moved to signed URLs.
DROP POLICY IF EXISTS "Public biblioteca uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public biblioteca deletes" ON storage.objects;
DROP POLICY IF EXISTS "Public biblioteca updates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated biblioteca uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated biblioteca deletes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated biblioteca updates" ON storage.objects;
CREATE POLICY "Authenticated biblioteca uploads" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'biblioteca');
CREATE POLICY "Authenticated biblioteca deletes" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'biblioteca' AND public.is_gestor());
CREATE POLICY "Authenticated biblioteca updates" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'biblioteca' AND public.is_gestor()) WITH CHECK (bucket_id = 'biblioteca' AND public.is_gestor());

DROP POLICY IF EXISTS "Permissao insercao storage" ON storage.objects;
DROP POLICY IF EXISTS "Permissao atualizacao storage" ON storage.objects;
DROP POLICY IF EXISTS "Permissao delecao storage" ON storage.objects;
DROP POLICY IF EXISTS "Public comunicacao uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public comunicacao deletes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated documentos uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated documentos updates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated documentos deletes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated anexos uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated anexos deletes" ON storage.objects;
CREATE POLICY "Authenticated documentos uploads" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos');
CREATE POLICY "Authenticated documentos updates" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'documentos') WITH CHECK (bucket_id = 'documentos');
CREATE POLICY "Authenticated documentos deletes" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'documentos' AND public.is_gestor());
CREATE POLICY "Authenticated anexos uploads" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'anexos');
CREATE POLICY "Authenticated anexos deletes" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'anexos' AND public.is_gestor());
