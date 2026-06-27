-- Close legacy permissive RLS gaps left by older local-dev policies.

CREATE OR REPLACE FUNCTION public.is_active_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(upper(trim(p_status)), 'ATIVO') NOT IN ('INATIVO', 'INACTIVE', 'BLOQUEADO', 'CANCELADO');
$$;

CREATE OR REPLACE FUNCTION public.can_access_curso(p_curso_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_public_course(p_curso_id)
    OR public.is_gestor()
    OR EXISTS (
      SELECT 1
      FROM public.matriculas m
      JOIN public.turmas t ON t.id = m.turma_id
      WHERE m.aluno_id = public.current_aluno_id()
        AND t.curso_id = p_curso_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.turmas_disciplinas td
      JOIN public.turmas t ON t.id = td.turma_id
      WHERE td.professor_id = public.current_professor_id()
        AND t.curso_id = p_curso_id
    );
$$;

-- Public curriculum catalogue: read only for published/linked courses, writes by global gestores.
DROP POLICY IF EXISTS "Acesso total local modulos" ON public.modulos;
DROP POLICY IF EXISTS "portal_modulos_select" ON public.modulos;
DROP POLICY IF EXISTS "portal_modulos_write_global" ON public.modulos;
CREATE POLICY "portal_modulos_select"
  ON public.modulos FOR SELECT
  USING (public.can_access_curso(curso_id));
CREATE POLICY "portal_modulos_write_global"
  ON public.modulos FOR ALL TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

DROP POLICY IF EXISTS "Acesso total local disciplinas" ON public.disciplinas;
DROP POLICY IF EXISTS "portal_disciplinas_select" ON public.disciplinas;
DROP POLICY IF EXISTS "portal_disciplinas_write_global" ON public.disciplinas;
CREATE POLICY "portal_disciplinas_select"
  ON public.disciplinas FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.modulos m
      WHERE m.id = disciplinas.modulo_id
        AND public.can_access_curso(m.curso_id)
    )
  );
CREATE POLICY "portal_disciplinas_write_global"
  ON public.disciplinas FOR ALL TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

DROP POLICY IF EXISTS "Acesso total local aulas" ON public.aulas;
DROP POLICY IF EXISTS "portal_aulas_select" ON public.aulas;
DROP POLICY IF EXISTS "portal_aulas_write_global" ON public.aulas;
CREATE POLICY "portal_aulas_select"
  ON public.aulas FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.disciplinas d
      JOIN public.modulos m ON m.id = d.modulo_id
      WHERE d.id = aulas.disciplina_id
        AND public.can_access_curso(m.curso_id)
    )
  );
CREATE POLICY "portal_aulas_write_global"
  ON public.aulas FOR ALL TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

DROP POLICY IF EXISTS "Acesso total local config_checklist_estagio" ON public.config_checklist_estagio;
DROP POLICY IF EXISTS "portal_config_checklist_estagio_select" ON public.config_checklist_estagio;
DROP POLICY IF EXISTS "portal_config_checklist_estagio_write_global" ON public.config_checklist_estagio;
CREATE POLICY "portal_config_checklist_estagio_select"
  ON public.config_checklist_estagio FOR SELECT TO authenticated
  USING (public.can_access_curso(curso_id));
CREATE POLICY "portal_config_checklist_estagio_write_global"
  ON public.config_checklist_estagio FOR ALL TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

-- Communication and secretary configuration.
DROP POLICY IF EXISTS "Acesso total local categorias" ON public.comunicacao_categorias;
DROP POLICY IF EXISTS "portal_comunicacao_categorias_select" ON public.comunicacao_categorias;
DROP POLICY IF EXISTS "portal_comunicacao_categorias_write_global" ON public.comunicacao_categorias;
CREATE POLICY "portal_comunicacao_categorias_select"
  ON public.comunicacao_categorias FOR SELECT TO authenticated
  USING (coalesce(ativo, true) OR public.is_gestor());
CREATE POLICY "portal_comunicacao_categorias_write_global"
  ON public.comunicacao_categorias FOR ALL TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

DROP POLICY IF EXISTS "Acesso total local config" ON public.comunicacao_config;
DROP POLICY IF EXISTS "portal_comunicacao_config_gestor_read" ON public.comunicacao_config;
DROP POLICY IF EXISTS "portal_comunicacao_config_global_write" ON public.comunicacao_config;
CREATE POLICY "portal_comunicacao_config_gestor_read"
  ON public.comunicacao_config FOR SELECT TO authenticated
  USING (public.is_gestor());
CREATE POLICY "portal_comunicacao_config_global_write"
  ON public.comunicacao_config FOR ALL TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

DROP POLICY IF EXISTS "Allow all secretaria_config" ON public.secretaria_config;
DROP POLICY IF EXISTS "portal_secretaria_config_read" ON public.secretaria_config;
DROP POLICY IF EXISTS "portal_secretaria_config_global_write" ON public.secretaria_config;
CREATE POLICY "portal_secretaria_config_read"
  ON public.secretaria_config FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "portal_secretaria_config_global_write"
  ON public.secretaria_config FOR ALL TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

DROP POLICY IF EXISTS "Allow all secretaria_solicitacoes" ON public.secretaria_solicitacoes;
DROP POLICY IF EXISTS "portal_secretaria_solicitacoes_access" ON public.secretaria_solicitacoes;
CREATE POLICY "portal_secretaria_solicitacoes_access"
  ON public.secretaria_solicitacoes FOR ALL TO authenticated
  USING (aluno_id = public.current_aluno_id()::text OR public.is_gestor())
  WITH CHECK (aluno_id = public.current_aluno_id()::text OR public.is_gestor());

-- Financial and academic operational tables.
DROP POLICY IF EXISTS "Allow all operations for local dev" ON public.contas_receber;
DROP POLICY IF EXISTS "Allow all operations for local dev" ON public.contas_pagar;

DROP POLICY IF EXISTS "Allow all operations for local dev" ON public.transferencias_contas;
DROP POLICY IF EXISTS "portal_transferencias_contas_access" ON public.transferencias_contas;
CREATE POLICY "portal_transferencias_contas_access"
  ON public.transferencias_contas FOR ALL TO authenticated
  USING (public.is_gestor_for_polo(polo_id))
  WITH CHECK (public.is_gestor_for_polo(polo_id));

DROP POLICY IF EXISTS "Acesso total local matriculas_estagios" ON public.matriculas_estagios;
DROP POLICY IF EXISTS "portal_matriculas_estagios_access" ON public.matriculas_estagios;
CREATE POLICY "portal_matriculas_estagios_access"
  ON public.matriculas_estagios FOR ALL TO authenticated
  USING (
    aluno_id = public.current_aluno_id()
    OR public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)
  )
  WITH CHECK (
    public.can_write_turma(turma_id)
    OR public.is_professor_assigned_disciplina(turma_id, disciplina_id)
  );

DROP POLICY IF EXISTS "Acesso total local modelos_fichas" ON public.modelos_fichas;
DROP POLICY IF EXISTS "portal_modelos_fichas_select" ON public.modelos_fichas;
DROP POLICY IF EXISTS "portal_modelos_fichas_write_global" ON public.modelos_fichas;
CREATE POLICY "portal_modelos_fichas_select"
  ON public.modelos_fichas FOR SELECT
  USING (
    coalesce(status, 'ATIVO') = 'ATIVO'
    AND (
      curso_especifico_id IS NULL
      OR public.can_access_curso(curso_especifico_id)
    )
  );
CREATE POLICY "portal_modelos_fichas_write_global"
  ON public.modelos_fichas FOR ALL TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

DROP POLICY IF EXISTS "documentos_templates_authenticated_select" ON public.documentos_templates;
DROP POLICY IF EXISTS "documentos_templates_authenticated_insert" ON public.documentos_templates;
DROP POLICY IF EXISTS "documentos_templates_authenticated_update" ON public.documentos_templates;
DROP POLICY IF EXISTS "documentos_templates_authenticated_delete" ON public.documentos_templates;
DROP POLICY IF EXISTS "portal_documentos_templates_gestor_read" ON public.documentos_templates;
DROP POLICY IF EXISTS "portal_documentos_templates_global_write" ON public.documentos_templates;
CREATE POLICY "portal_documentos_templates_gestor_read"
  ON public.documentos_templates FOR SELECT TO authenticated
  USING (public.is_gestor());
CREATE POLICY "portal_documentos_templates_global_write"
  ON public.documentos_templates FOR ALL TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

DROP POLICY IF EXISTS "Acesso consulta documentos validacao" ON public.documentos_validacao;
DROP POLICY IF EXISTS "portal_documentos_validacao_select" ON public.documentos_validacao;
DROP POLICY IF EXISTS "portal_documentos_validacao_write_gestor" ON public.documentos_validacao;
CREATE POLICY "portal_documentos_validacao_select"
  ON public.documentos_validacao FOR SELECT TO authenticated
  USING (aluno_id = public.current_aluno_id() OR public.is_gestor_for_polo(polo_id));
CREATE POLICY "portal_documentos_validacao_write_gestor"
  ON public.documentos_validacao FOR ALL TO authenticated
  USING (public.is_gestor_for_polo(polo_id))
  WITH CHECK (public.is_gestor_for_polo(polo_id));

DROP POLICY IF EXISTS "Leitura periodos letivos" ON public.periodos_letivos;
DROP POLICY IF EXISTS "portal_periodos_letivos_select" ON public.periodos_letivos;
DROP POLICY IF EXISTS "portal_periodos_letivos_write" ON public.periodos_letivos;
CREATE POLICY "portal_periodos_letivos_select"
  ON public.periodos_letivos FOR SELECT TO authenticated
  USING (public.can_access_turma(turma_id));
CREATE POLICY "portal_periodos_letivos_write"
  ON public.periodos_letivos FOR ALL TO authenticated
  USING (public.can_write_turma(turma_id))
  WITH CHECK (public.can_write_turma(turma_id));

DROP POLICY IF EXISTS "Leitura fechamentos academicos" ON public.fechamentos_academicos;
DROP POLICY IF EXISTS "portal_fechamentos_academicos_select" ON public.fechamentos_academicos;
DROP POLICY IF EXISTS "portal_fechamentos_academicos_write" ON public.fechamentos_academicos;
CREATE POLICY "portal_fechamentos_academicos_select"
  ON public.fechamentos_academicos FOR SELECT TO authenticated
  USING (public.can_access_turma(turma_id));
CREATE POLICY "portal_fechamentos_academicos_write"
  ON public.fechamentos_academicos FOR ALL TO authenticated
  USING (public.can_write_turma(turma_id))
  WITH CHECK (public.can_write_turma(turma_id));

DROP POLICY IF EXISTS "Leitura movimentacoes matricula" ON public.matricula_movimentacoes;
DROP POLICY IF EXISTS "portal_matricula_movimentacoes_select" ON public.matricula_movimentacoes;
DROP POLICY IF EXISTS "portal_matricula_movimentacoes_write" ON public.matricula_movimentacoes;
CREATE POLICY "portal_matricula_movimentacoes_select"
  ON public.matricula_movimentacoes FOR SELECT TO authenticated
  USING (
    aluno_id = public.current_aluno_id()
    OR public.can_write_turma(turma_origem_id)
    OR public.can_write_turma(turma_destino_id)
  );
CREATE POLICY "portal_matricula_movimentacoes_write"
  ON public.matricula_movimentacoes FOR ALL TO authenticated
  USING (public.can_write_turma(turma_origem_id) OR public.can_write_turma(turma_destino_id))
  WITH CHECK (public.can_write_turma(turma_origem_id) OR public.can_write_turma(turma_destino_id));

DROP POLICY IF EXISTS "Leitura transferencias academicas" ON public.transferencias_academicas;
DROP POLICY IF EXISTS "portal_transferencias_academicas_select" ON public.transferencias_academicas;
DROP POLICY IF EXISTS "portal_transferencias_academicas_write" ON public.transferencias_academicas;
CREATE POLICY "portal_transferencias_academicas_select"
  ON public.transferencias_academicas FOR SELECT TO authenticated
  USING (
    aluno_id = public.current_aluno_id()
    OR public.can_write_turma(turma_origem_id)
    OR public.can_write_turma(turma_destino_id)
  );
CREATE POLICY "portal_transferencias_academicas_write"
  ON public.transferencias_academicas FOR ALL TO authenticated
  USING (public.can_write_turma(turma_origem_id) OR public.can_write_turma(turma_destino_id))
  WITH CHECK (public.can_write_turma(turma_origem_id) OR public.can_write_turma(turma_destino_id));

DROP POLICY IF EXISTS "Consulta aproveitamentos academicos" ON public.matricula_aproveitamentos;
DROP POLICY IF EXISTS "portal_matricula_aproveitamentos_select" ON public.matricula_aproveitamentos;
DROP POLICY IF EXISTS "portal_matricula_aproveitamentos_write" ON public.matricula_aproveitamentos;
CREATE POLICY "portal_matricula_aproveitamentos_select"
  ON public.matricula_aproveitamentos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matriculas m
      WHERE m.id = matricula_aproveitamentos.matricula_id
        AND (m.aluno_id = public.current_aluno_id() OR public.can_write_turma(m.turma_id))
    )
  );
CREATE POLICY "portal_matricula_aproveitamentos_write"
  ON public.matricula_aproveitamentos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matriculas m
      WHERE m.id = matricula_aproveitamentos.matricula_id
        AND public.can_write_turma(m.turma_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matriculas m
      WHERE m.id = matricula_aproveitamentos.matricula_id
        AND public.can_write_turma(m.turma_id)
    )
  );
