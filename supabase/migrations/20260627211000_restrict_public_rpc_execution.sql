-- Restrict RPC execution so anonymous users cannot call internal operations.
-- Public access remains only for login resolution, document validation lookup,
-- and institutional polo data used by public documents.

-- Public RPCs.
REVOKE EXECUTE ON FUNCTION public.resolve_portal_login_email(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_portal_login_email(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.validar_documento_por_codigo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_documento_por_codigo(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_dados_institucionais_polo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dados_institucionais_polo(uuid) TO anon, authenticated;

-- Authenticated portal RPCs.
REVOKE EXECUTE ON FUNCTION public.calcular_avaliacao_estagio(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_avaliacao_estagio(jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.calcular_regras_financeiras_turma(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_regras_financeiras_turma(numeric, numeric, numeric, numeric) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.calcular_valores_cobranca_padrao(numeric, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_valores_cobranca_padrao(numeric, date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ead_buscar_alunos_disponiveis(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_buscar_alunos_disponiveis(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ead_get_aluno_progress(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_get_aluno_progress(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ead_get_cursos_grouped(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_get_cursos_grouped(text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ead_get_cursos_grouped(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_get_cursos_grouped(text, text, text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ead_get_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_get_dashboard() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ead_get_turma_alunos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_get_turma_alunos(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ead_get_turma_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_get_turma_dashboard(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ead_liberar_matricula(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_liberar_matricula(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ead_matricular_aluno_manual(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_matricular_aluno_manual(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ead_update_aluno_progress(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_update_aluno_progress(uuid, uuid, text, text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.emitir_documento_validacao(text, uuid, text, text, timestamp with time zone, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emitir_documento_validacao(text, uuid, text, text, timestamp with time zone, uuid, boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fechar_periodo_letivo(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_periodo_letivo(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.finalizar_certificado_academico(uuid, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_certificado_academico(uuid, text, text, text, text, text, text, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.finalizar_turma_academica(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_turma_academica(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_aluno_extrato_financeiro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aluno_extrato_financeiro(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_contas_bancarias_saldos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contas_bancarias_saldos() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_curso_grade_kpis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_curso_grade_kpis(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_cursos_com_kpis(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cursos_com_kpis(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_chart_data(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_chart_data(uuid, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_kpis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_recent_activity(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_activity(uuid, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_diario_resultados(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_diario_resultados(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_diarios_turma(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_diarios_turma(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_financeiro_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financeiro_summary(uuid, date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_fluxo_consolidado_3_meses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fluxo_consolidado_3_meses(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_parceiros_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_parceiros_kpis() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_pendencias_fechamento_periodo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pendencias_fechamento_periodo(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_turma_alunos_academico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_turma_alunos_academico(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_turma_resumo_academico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_turma_resumo_academico(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.matricular_aluno_turma(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(uuid, uuid, uuid, numeric, date, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(uuid, uuid, uuid, numeric, date, numeric, numeric, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.movimentar_matricula_academica(uuid, text, text, text, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimentar_matricula_academica(uuid, text, text, text, date, date, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reabrir_periodo_letivo(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_periodo_letivo(uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.receber_transferencia_externa(uuid, uuid, text, text, text, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receber_transferencia_externa(uuid, uuid, text, text, text, text, date, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.revogar_documento_validacao(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revogar_documento_validacao(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.salvar_avaliacao_estagio(uuid, uuid, uuid, numeric, jsonb, jsonb, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_avaliacao_estagio(uuid, uuid, uuid, numeric, jsonb, jsonb, text, text, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.transferir_matricula_academica(uuid, text, text, uuid, text, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_matricula_academica(uuid, text, text, uuid, text, text, date, uuid) TO authenticated, service_role;

-- Internal trigger/maintenance functions are not callable through client APIs.
REVOKE EXECUTE ON FUNCTION public.criar_financeiro_ao_matricular() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_financeiro_ao_matricular() TO service_role;

REVOKE EXECUTE ON FUNCTION public.ead_activate_matricula_on_paid_inscricao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ead_activate_matricula_on_paid_inscricao() TO service_role;

REVOKE EXECUTE ON FUNCTION public.gerar_ciclo_financeiro_apos_pagamento() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_ciclo_financeiro_apos_pagamento() TO service_role;

REVOKE EXECUTE ON FUNCTION public.gerar_cobranca_matricula(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_cobranca_matricula(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gerar_parcelas_apos_baixa_matricula() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_parcelas_apos_baixa_matricula() TO service_role;

REVOKE EXECUTE ON FUNCTION public.gerar_parcelas_matricula(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_parcelas_matricula(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gerar_rematricula_apos_parcelas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_rematricula_apos_parcelas(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
