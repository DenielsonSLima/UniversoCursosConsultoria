BEGIN;

UPDATE public.perfis_acesso
SET permissoes = jsonb_set(
  jsonb_set(permissoes, '{tabs}', coalesce(permissoes -> 'tabs', '{}'::jsonb), true),
  '{tabs,comunicacao}',
  '["comunicacao-mensagem","comunicacao-whatsapp"]'::jsonb,
  true
)
WHERE permissoes -> 'modules' ? 'comunicacao'
  AND jsonb_typeof(permissoes -> 'tabs' -> 'comunicacao') IS DISTINCT FROM 'array';

CREATE OR REPLACE FUNCTION public.gestor_has_any_tab(p_module text, p_tabs text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_tabs, ARRAY[]::text[])) requested(tab_id)
    WHERE public.gestor_has_tab(p_module, requested.tab_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.gestor_can_read_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR (
      public.gestor_has_any_module(ARRAY['gestao', 'cadastros', 'inicio', 'relatorios', 'secretaria'])
      AND EXISTS (
        SELECT 1 FROM public.turmas t
        WHERE t.id = p_turma_id
          AND public.is_gestor_for_polo(t.polo_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.has_course_private_access(p_curso_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_any_module(ARRAY['cadastros', 'gestao', 'inicio', 'relatorios', 'secretaria'])
    OR EXISTS (
      SELECT 1 FROM public.matriculas m
      JOIN public.turmas t ON t.id = m.turma_id
      WHERE m.aluno_id = public.current_aluno_id() AND t.curso_id = p_curso_id
    )
    OR EXISTS (
      SELECT 1 FROM public.turmas_disciplinas td
      JOIN public.turmas t ON t.id = td.turma_id
      WHERE td.professor_id = public.current_professor_id() AND t.curso_id = p_curso_id
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_curso(p_curso_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_public_course(p_curso_id)
    OR public.has_course_private_access(p_curso_id);
$$;

CREATE OR REPLACE FUNCTION public.gestor_can_manage_curso_modalidade(p_modalidade text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_module('cadastros')
    AND CASE upper(coalesce(p_modalidade, ''))
      WHEN 'EAD' THEN public.gestor_has_tab('cadastros', 'cadastros-ead')
      WHEN 'TECNICO' THEN public.gestor_has_tab('cadastros', 'cadastros-tecnicos')
      WHEN 'SUPERIOR' THEN public.gestor_has_any_tab('cadastros', ARRAY['cadastros-superior', 'cadastros-especializacao'])
      ELSE public.gestor_has_any_tab('cadastros', ARRAY['cadastros-livres', 'cadastros-superior', 'cadastros-especializacao'])
    END;
$$;

CREATE OR REPLACE FUNCTION public.gestor_can_manage_curso(p_curso_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cursos c
    WHERE c.id = p_curso_id
      AND public.gestor_can_manage_curso_modalidade(c.modalidade)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_mutate_documentos_storage_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT CASE
    WHEN p_name LIKE 'templates/%' THEN
      public.gestor_has_tab('cadastros', 'cadastros-modelos')
      OR public.gestor_has_module('configuracoes')
    WHEN p_name LIKE 'logos/%' OR p_name LIKE 'signatures/%' THEN
      public.gestor_has_module('configuracoes')
    WHEN p_name LIKE 'cursos/%' THEN
      public.gestor_has_any_tab('cadastros', ARRAY[
        'cadastros-ead', 'cadastros-especializacao', 'cadastros-livres',
        'cadastros-tecnicos', 'cadastros-superior'
      ])
    WHEN split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND p_name LIKE '%/perfil/%' THEN
      split_part(p_name, '/', 1)::uuid IN (public.current_aluno_id(), public.current_professor_id())
      OR EXISTS (
        SELECT 1 FROM public.parceiros p
        WHERE p.id = split_part(p_name, '/', 1)::uuid
          AND public.is_partner_in_gestor_scope(p.polo_id, p.polo_ids)
      )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_upload_anexo_storage_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.current_aluno_id() IS NOT NULL
    AND p_name LIKE 'comunicacao/' || public.current_aluno_id()::text || '/%'
  ) OR (
    public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
    AND p_name LIKE 'comunicacao/gestor/%'
  );
$$;

DROP POLICY IF EXISTS portal_turmas_authenticated_select ON public.turmas;
CREATE POLICY portal_turmas_authenticated_select ON public.turmas
FOR SELECT TO authenticated
USING (
  public.gestor_can_read_turma(id)
  OR public.is_aluno_matriculado_turma(id)
  OR public.is_professor_assigned_turma(id)
);

DROP POLICY IF EXISTS portal_matriculas_select ON public.matriculas;
CREATE POLICY portal_matriculas_select ON public.matriculas
FOR SELECT TO authenticated
USING (
  aluno_id = public.current_aluno_id()
  OR public.is_professor_assigned_turma(turma_id)
  OR public.gestor_can_read_turma(turma_id)
);

DROP POLICY IF EXISTS portal_contas_receber_select ON public.contas_receber;
DROP POLICY IF EXISTS portal_contas_receber_insert_gestor ON public.contas_receber;
DROP POLICY IF EXISTS portal_contas_receber_update_gestor ON public.contas_receber;
DROP POLICY IF EXISTS portal_contas_receber_delete_gestor ON public.contas_receber;
CREATE POLICY portal_contas_receber_select ON public.contas_receber
FOR SELECT TO authenticated
USING (
  cliente_id = public.current_aluno_id()
  OR (
    public.is_gestor_for_polo(polo_id)
    AND (
      public.gestor_has_financeiro_tab('receber')
      OR public.gestor_has_module('inicio')
      OR public.gestor_has_module('relatorios')
      OR public.gestor_has_tab('secretaria', 'recebimentos')
    )
  )
);
CREATE POLICY portal_contas_receber_insert_gestor ON public.contas_receber
FOR INSERT TO authenticated WITH CHECK (public.is_gestor_for_polo(polo_id) AND public.gestor_has_financeiro_tab('receber'));
CREATE POLICY portal_contas_receber_update_gestor ON public.contas_receber
FOR UPDATE TO authenticated
USING (public.is_gestor_for_polo(polo_id) AND public.gestor_has_financeiro_tab('receber'))
WITH CHECK (public.is_gestor_for_polo(polo_id) AND public.gestor_has_financeiro_tab('receber'));
CREATE POLICY portal_contas_receber_delete_gestor ON public.contas_receber
FOR DELETE TO authenticated USING (public.is_gestor_for_polo(polo_id) AND public.gestor_has_financeiro_tab('receber'));

DROP POLICY IF EXISTS portal_contas_pagar_select ON public.contas_pagar;
DROP POLICY IF EXISTS portal_contas_pagar_insert_gestor ON public.contas_pagar;
DROP POLICY IF EXISTS portal_contas_pagar_update_gestor ON public.contas_pagar;
DROP POLICY IF EXISTS portal_contas_pagar_delete_gestor ON public.contas_pagar;
CREATE POLICY portal_contas_pagar_select ON public.contas_pagar
FOR SELECT TO authenticated
USING (
  fornecedor_id = public.current_professor_id()
  OR (
    public.is_gestor_for_polo(polo_id)
    AND (
      public.gestor_has_financeiro_tab('despesas')
      OR public.gestor_has_module('inicio')
      OR public.gestor_has_module('relatorios')
    )
  )
);
CREATE POLICY portal_contas_pagar_insert_gestor ON public.contas_pagar
FOR INSERT TO authenticated WITH CHECK (public.is_gestor_for_polo(polo_id) AND public.gestor_has_financeiro_tab('despesas'));
CREATE POLICY portal_contas_pagar_update_gestor ON public.contas_pagar
FOR UPDATE TO authenticated
USING (public.is_gestor_for_polo(polo_id) AND public.gestor_has_financeiro_tab('despesas'))
WITH CHECK (public.is_gestor_for_polo(polo_id) AND public.gestor_has_financeiro_tab('despesas'));
CREATE POLICY portal_contas_pagar_delete_gestor ON public.contas_pagar
FOR DELETE TO authenticated USING (public.is_gestor_for_polo(polo_id) AND public.gestor_has_financeiro_tab('despesas'));

DROP POLICY IF EXISTS portal_transferencias_contas_access ON public.transferencias_contas;
CREATE POLICY portal_transferencias_contas_access ON public.transferencias_contas
FOR ALL TO authenticated
USING (
  public.is_gestor_for_polo(polo_id)
  AND (public.gestor_has_module('caixa') OR public.gestor_has_financeiro_tab('transferencias'))
)
WITH CHECK (
  public.is_gestor_for_polo(polo_id)
  AND (public.gestor_has_module('caixa') OR public.gestor_has_financeiro_tab('transferencias'))
);

DROP POLICY IF EXISTS portal_certificados_select ON public.certificados_academicos;
CREATE POLICY portal_certificados_select ON public.certificados_academicos
FOR SELECT TO authenticated
USING (
  (
    (polo_id IS NOT NULL AND public.is_gestor_for_polo(polo_id))
    OR (polo_id IS NULL AND public.is_gestor_global())
  )
  AND (
    public.gestor_has_module('relatorios')
    OR public.gestor_has_any_tab('secretaria', ARRAY['declaracoes', 'historico'])
  )
  OR (aluno_id = public.current_aluno_id() AND status = 'FINALIZADO' AND codigo_validacao IS NOT NULL)
);

DROP POLICY IF EXISTS portal_documentos_validacao_select ON public.documentos_validacao;
CREATE POLICY portal_documentos_validacao_select ON public.documentos_validacao
FOR SELECT TO authenticated
USING (
  aluno_id = public.current_aluno_id()
  OR (
    ((polo_id IS NOT NULL AND public.is_gestor_for_polo(polo_id)) OR (polo_id IS NULL AND public.is_gestor_global()))
    AND (
      public.gestor_has_module('relatorios')
      OR public.gestor_has_any_tab('secretaria', ARRAY['declaracoes', 'historico'])
    )
  )
);

DROP POLICY IF EXISTS portal_secretaria_solicitacoes_access ON public.secretaria_solicitacoes;
CREATE POLICY portal_secretaria_solicitacoes_access ON public.secretaria_solicitacoes
FOR ALL TO authenticated
USING (aluno_id = public.current_aluno_id()::text OR public.gestor_has_tab('secretaria', 'solicitacoes'))
WITH CHECK (aluno_id = public.current_aluno_id()::text OR public.gestor_has_tab('secretaria', 'solicitacoes'));

DROP POLICY IF EXISTS portal_cursos_write_global ON public.cursos;
CREATE POLICY portal_cursos_write_global ON public.cursos
FOR ALL TO authenticated
USING (public.is_gestor_global() AND public.gestor_can_manage_curso_modalidade(modalidade))
WITH CHECK (public.is_gestor_global() AND public.gestor_can_manage_curso_modalidade(modalidade));

DROP POLICY IF EXISTS portal_modulos_write_global ON public.modulos;
CREATE POLICY portal_modulos_write_global ON public.modulos
FOR ALL TO authenticated
USING (public.is_gestor_global() AND public.gestor_can_manage_curso(curso_id))
WITH CHECK (public.is_gestor_global() AND public.gestor_can_manage_curso(curso_id));

DROP POLICY IF EXISTS portal_disciplinas_write_global ON public.disciplinas;
CREATE POLICY portal_disciplinas_write_global ON public.disciplinas
FOR ALL TO authenticated
USING (
  public.is_gestor_global() AND EXISTS (
    SELECT 1 FROM public.modulos m WHERE m.id = modulo_id AND public.gestor_can_manage_curso(m.curso_id)
  )
)
WITH CHECK (
  public.is_gestor_global() AND EXISTS (
    SELECT 1 FROM public.modulos m WHERE m.id = modulo_id AND public.gestor_can_manage_curso(m.curso_id)
  )
);

DROP POLICY IF EXISTS portal_aulas_write_global ON public.aulas;
CREATE POLICY portal_aulas_write_global ON public.aulas
FOR ALL TO authenticated
USING (
  public.is_gestor_global() AND EXISTS (
    SELECT 1 FROM public.disciplinas d JOIN public.modulos m ON m.id = d.modulo_id
    WHERE d.id = disciplina_id AND public.gestor_can_manage_curso(m.curso_id)
  )
)
WITH CHECK (
  public.is_gestor_global() AND EXISTS (
    SELECT 1 FROM public.disciplinas d JOIN public.modulos m ON m.id = d.modulo_id
    WHERE d.id = disciplina_id AND public.gestor_can_manage_curso(m.curso_id)
  )
);

DROP POLICY IF EXISTS portal_modelos_fichas_write_global ON public.modelos_fichas;
CREATE POLICY portal_modelos_fichas_write_global ON public.modelos_fichas
FOR ALL TO authenticated
USING (public.is_gestor_global() AND public.gestor_has_tab('cadastros', 'cadastros-ficha'))
WITH CHECK (public.is_gestor_global() AND public.gestor_has_tab('cadastros', 'cadastros-ficha'));

DO $$
DECLARE
  policy_row record;
  new_qual text;
  new_check text;
  roles_sql text;
  create_sql text;
BEGIN
  FOR policy_row IN
    SELECT * FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        tablename LIKE 'whatsapp_%'
        OR tablename IN ('comunicacao_categorias', 'comunicacao_chats', 'comunicacao_config', 'comunicacao_mensagens', 'mensageria_config', 'templates_mensagens')
      )
  LOOP
    new_qual := policy_row.qual;
    new_check := policy_row.with_check;
    IF policy_row.tablename LIKE 'whatsapp_%' THEN
      new_qual := replace(new_qual, 'gestor_has_any_module(''{comunicacao}''::text[])', 'gestor_has_tab(''comunicacao'', ''comunicacao-whatsapp'')');
      new_check := replace(new_check, 'gestor_has_any_module(''{comunicacao}''::text[])', 'gestor_has_tab(''comunicacao'', ''comunicacao-whatsapp'')');
    ELSE
      new_qual := replace(new_qual, 'gestor_has_any_module(''{comunicacao,configuracoes}''::text[])', '(gestor_has_tab(''comunicacao'', ''comunicacao-mensagem'') OR gestor_has_module(''configuracoes''))');
      new_qual := replace(new_qual, 'gestor_has_any_global_module(''{comunicacao,configuracoes}''::text[])', '((gestor_has_tab(''comunicacao'', ''comunicacao-mensagem'') OR gestor_has_module(''configuracoes'')) AND is_gestor_global())');
      new_check := replace(new_check, 'gestor_has_any_module(''{comunicacao,configuracoes}''::text[])', '(gestor_has_tab(''comunicacao'', ''comunicacao-mensagem'') OR gestor_has_module(''configuracoes''))');
      new_check := replace(new_check, 'gestor_has_any_global_module(''{comunicacao,configuracoes}''::text[])', '((gestor_has_tab(''comunicacao'', ''comunicacao-mensagem'') OR gestor_has_module(''configuracoes'')) AND is_gestor_global())');
    END IF;

    IF new_qual IS DISTINCT FROM policy_row.qual OR new_check IS DISTINCT FROM policy_row.with_check THEN
      SELECT string_agg(quote_ident(role_name), ', ') INTO roles_sql FROM unnest(policy_row.roles) role_name;
      EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, policy_row.tablename);
      create_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s', policy_row.policyname, policy_row.tablename, policy_row.permissive, policy_row.cmd, roles_sql);
      IF new_qual IS NOT NULL THEN create_sql := create_sql || format(' USING (%s)', new_qual); END IF;
      IF new_check IS NOT NULL THEN create_sql := create_sql || format(' WITH CHECK (%s)', new_check); END IF;
      EXECUTE create_sql;
    END IF;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Anon profile photo updates" ON storage.objects;
DROP POLICY IF EXISTS "Anon profile photo uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated anexos uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated anexos deletes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated biblioteca uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated biblioteca updates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated biblioteca deletes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated documentos uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated documentos updates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated documentos deletes" ON storage.objects;
DROP POLICY IF EXISTS portal_documentos_templates_storage_insert ON storage.objects;
DROP POLICY IF EXISTS portal_documentos_templates_storage_update ON storage.objects;

CREATE POLICY portal_anexos_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'anexos' AND public.can_upload_anexo_storage_object(name));
CREATE POLICY portal_anexos_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'anexos' AND (owner = auth.uid() OR public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')))
WITH CHECK (bucket_id = 'anexos' AND public.can_upload_anexo_storage_object(name));
CREATE POLICY portal_anexos_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'anexos' AND (owner = auth.uid() OR public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')));

CREATE POLICY portal_biblioteca_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'biblioteca' AND (public.current_professor_id() IS NOT NULL OR public.gestor_has_module('biblioteca')));
CREATE POLICY portal_biblioteca_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'biblioteca' AND (owner = auth.uid() OR public.gestor_has_module('biblioteca')))
WITH CHECK (bucket_id = 'biblioteca' AND (owner = auth.uid() OR public.gestor_has_module('biblioteca')));
CREATE POLICY portal_biblioteca_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'biblioteca' AND (owner = auth.uid() OR public.gestor_has_module('biblioteca')));

CREATE POLICY portal_documentos_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documentos' AND public.can_mutate_documentos_storage_object(name));
CREATE POLICY portal_documentos_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'documentos' AND public.can_mutate_documentos_storage_object(name))
WITH CHECK (bucket_id = 'documentos' AND public.can_mutate_documentos_storage_object(name));
CREATE POLICY portal_documentos_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'documentos' AND public.can_mutate_documentos_storage_object(name));

REVOKE ALL ON FUNCTION public.gestor_has_any_tab(text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gestor_can_read_turma(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gestor_can_manage_curso_modalidade(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gestor_can_manage_curso(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_mutate_documentos_storage_object(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_upload_anexo_storage_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gestor_has_any_tab(text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_can_read_turma(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_can_manage_curso_modalidade(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_can_manage_curso(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_mutate_documentos_storage_object(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_upload_anexo_storage_object(text) TO authenticated, service_role;

COMMIT;
