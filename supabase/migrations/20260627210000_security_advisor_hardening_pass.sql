-- Address the next batch of Supabase security/performance advisor findings.

-- Tables with RLS enabled should have explicit policies, even when service
-- role traffic is expected to bypass RLS.
DROP POLICY IF EXISTS "portal_asaas_webhook_events_global_read" ON public.asaas_webhook_events;
CREATE POLICY "portal_asaas_webhook_events_global_read"
  ON public.asaas_webhook_events FOR SELECT TO authenticated
  USING (public.is_gestor_global());

DROP POLICY IF EXISTS "portal_documentos_validacao_politicas_read" ON public.documentos_validacao_politicas;
DROP POLICY IF EXISTS "portal_documentos_validacao_politicas_write" ON public.documentos_validacao_politicas;
CREATE POLICY "portal_documentos_validacao_politicas_read"
  ON public.documentos_validacao_politicas FOR SELECT TO authenticated
  USING (public.is_gestor());
CREATE POLICY "portal_documentos_validacao_politicas_write"
  ON public.documentos_validacao_politicas FOR ALL TO authenticated
  USING (public.is_gestor_global())
  WITH CHECK (public.is_gestor_global());

-- The view must respect the querying user's RLS context.
ALTER VIEW public.v_diario_notas_resultados SET (security_invoker = true);

-- Public buckets do not need broad SELECT policies for public object URLs, and
-- broad SELECT lets clients list every object in the bucket.
DROP POLICY IF EXISTS "Permissao leitura storage" ON storage.objects;
DROP POLICY IF EXISTS "Public comunicacao reads" ON storage.objects;

-- Fix mutable search_path warnings on older functions.
ALTER FUNCTION public.calcular_regras_financeiras_turma(numeric, numeric, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.calcular_valores_cobranca(numeric, date, date, numeric, numeric, numeric, integer) SET search_path = public;
ALTER FUNCTION public.calcular_valores_cobranca_padrao(numeric, date, date) SET search_path = public;
ALTER FUNCTION public.criar_checklist_documentos_aluno() SET search_path = public;
ALTER FUNCTION public.ead_jsonb_toggle_text(jsonb, text) SET search_path = public;
ALTER FUNCTION public.ead_progress_meets_completion(jsonb, jsonb) SET search_path = public;
ALTER FUNCTION public.get_contas_bancarias_saldos() SET search_path = public;
ALTER FUNCTION public.get_curso_grade_kpis(uuid) SET search_path = public;
ALTER FUNCTION public.get_cursos_com_kpis(text) SET search_path = public;
ALTER FUNCTION public.get_dashboard_chart_data(uuid, integer) SET search_path = public;
ALTER FUNCTION public.get_dashboard_kpis(uuid) SET search_path = public;
ALTER FUNCTION public.get_dashboard_recent_activity(uuid, integer) SET search_path = public;
ALTER FUNCTION public.get_financeiro_summary(uuid, date, date) SET search_path = public;
ALTER FUNCTION public.get_fluxo_consolidado_3_meses(uuid) SET search_path = public;
ALTER FUNCTION public.get_parceiros_kpis() SET search_path = public;
ALTER FUNCTION public.touch_ead_aluno_progresso_updated_at() SET search_path = public;

-- Foreign-key and policy columns used heavily by joins/RLS.
CREATE INDEX IF NOT EXISTS idx_aulas_disciplina_id ON public.aulas (disciplina_id);
CREATE INDEX IF NOT EXISTS idx_aulas_turma_turma_id ON public.aulas_turma (turma_id);
CREATE INDEX IF NOT EXISTS idx_aulas_turma_disciplina_id ON public.aulas_turma (disciplina_id);
CREATE INDEX IF NOT EXISTS idx_biblioteca_documentos_liberacao_disciplina_id ON public.biblioteca_documentos (liberacao_disciplina_id);
CREATE INDEX IF NOT EXISTS idx_biblioteca_documentos_pasta_id ON public.biblioteca_documentos (pasta_id);
CREATE INDEX IF NOT EXISTS idx_biblioteca_documentos_teacher_id ON public.biblioteca_documentos (teacher_id);
CREATE INDEX IF NOT EXISTS idx_biblioteca_documentos_polo_id ON public.biblioteca_documentos (polo_id);
CREATE INDEX IF NOT EXISTS idx_biblioteca_pastas_parent_id ON public.biblioteca_pastas (parent_id);
CREATE INDEX IF NOT EXISTS idx_biblioteca_pastas_teacher_id ON public.biblioteca_pastas (teacher_id);
CREATE INDEX IF NOT EXISTS idx_comunicacao_chats_categoria_id ON public.comunicacao_chats (categoria_id);
CREATE INDEX IF NOT EXISTS idx_comunicacao_chats_remetente_id ON public.comunicacao_chats (remetente_id);
CREATE INDEX IF NOT EXISTS idx_comunicacao_mensagens_chat_id ON public.comunicacao_mensagens (chat_id);
CREATE INDEX IF NOT EXISTS idx_contas_bancarias_polo_id ON public.contas_bancarias (polo_id);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_conta_bancaria_id ON public.contas_pagar (conta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_polo_id ON public.contas_pagar (polo_id);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_fornecedor_id ON public.contas_pagar (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_conta_bancaria_id ON public.contas_receber (conta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_polo_id ON public.contas_receber (polo_id);
CREATE INDEX IF NOT EXISTS idx_diario_frequencia_turma_id ON public.diario_frequencia (turma_id);
CREATE INDEX IF NOT EXISTS idx_diario_frequencia_aluno_id ON public.diario_frequencia (aluno_id);
CREATE INDEX IF NOT EXISTS idx_diario_frequencia_disciplina_id ON public.diario_frequencia (disciplina_id);
CREATE INDEX IF NOT EXISTS idx_diario_notas_disciplina_id ON public.diario_notas (disciplina_id);
CREATE INDEX IF NOT EXISTS idx_diario_notas_aluno_id ON public.diario_notas (aluno_id);
CREATE INDEX IF NOT EXISTS idx_diario_observacoes_disciplina_id ON public.diario_observacoes (disciplina_id);
CREATE INDEX IF NOT EXISTS idx_diario_praticas_disciplina_id ON public.diario_praticas (disciplina_id);
CREATE INDEX IF NOT EXISTS idx_diario_praticas_turma_id ON public.diario_praticas (turma_id);
CREATE INDEX IF NOT EXISTS idx_disciplinas_modulo_id ON public.disciplinas (modulo_id);
CREATE INDEX IF NOT EXISTS idx_inscricoes_online_matricula_id ON public.inscricoes_online (matricula_id);
CREATE INDEX IF NOT EXISTS idx_inscricoes_online_aluno_id ON public.inscricoes_online (aluno_id);
CREATE INDEX IF NOT EXISTS idx_inscricoes_online_turma_id ON public.inscricoes_online (turma_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_estagios_aluno_id ON public.matriculas_estagios (aluno_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_estagios_disciplina_id ON public.matriculas_estagios (disciplina_id);
CREATE INDEX IF NOT EXISTS idx_modelos_fichas_curso_especifico_id ON public.modelos_fichas (curso_especifico_id);
CREATE INDEX IF NOT EXISTS idx_modulos_curso_id ON public.modulos (curso_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_polo_id ON public.parceiros (polo_id);
CREATE INDEX IF NOT EXISTS idx_periodos_letivos_modulo_id ON public.periodos_letivos (modulo_id);
CREATE INDEX IF NOT EXISTS idx_polos_company_id ON public.polos (company_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_academicas_matricula_origem_id ON public.transferencias_academicas (matricula_origem_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_academicas_matricula_destino_id ON public.transferencias_academicas (matricula_destino_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_contas_conta_origem_id ON public.transferencias_contas (conta_origem_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_contas_polo_id ON public.transferencias_contas (polo_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_contas_conta_destino_id ON public.transferencias_contas (conta_destino_id);
CREATE INDEX IF NOT EXISTS idx_turmas_polo_id ON public.turmas (polo_id);
CREATE INDEX IF NOT EXISTS idx_turmas_disciplinas_professor_id ON public.turmas_disciplinas (professor_id);
CREATE INDEX IF NOT EXISTS idx_turmas_disciplinas_disciplina_id ON public.turmas_disciplinas (disciplina_id);

-- Extra lookup indexes used by auth helpers and public catalogue policies.
CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_lower_email ON public.usuarios_sistema (lower(email));
CREATE INDEX IF NOT EXISTS idx_parceiros_lower_email_tipo ON public.parceiros (lower(email), tipo);
CREATE INDEX IF NOT EXISTS idx_cursos_public_catalog ON public.cursos (status, publicar_site, modalidade);
CREATE INDEX IF NOT EXISTS idx_turmas_public_catalog ON public.turmas (status, curso_id, polo_id);
