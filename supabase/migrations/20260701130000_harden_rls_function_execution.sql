BEGIN;

-- Hardening pos-auditoria:
-- - historico_turma_financeira precisa de policy quando RLS esta habilitado.
-- - get_despesas_summary precisa de search_path fixo.
-- - SECURITY DEFINER nao deve ficar exposta a PUBLIC/anon por grants padrao.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

DO $$
BEGIN
  IF to_regclass('public.historico_turma_financeira') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.historico_turma_financeira ENABLE ROW LEVEL SECURITY';

    EXECUTE 'REVOKE ALL ON TABLE public.historico_turma_financeira FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.historico_turma_financeira TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.historico_turma_financeira TO service_role';

    EXECUTE 'DROP POLICY IF EXISTS "portal_historico_turma_financeira_financeiro_read" ON public.historico_turma_financeira';
    EXECUTE $policy$
      CREATE POLICY "portal_historico_turma_financeira_financeiro_read"
        ON public.historico_turma_financeira
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.turmas t
            WHERE t.id = historico_turma_financeira.turma_id
              AND public.is_financeiro_for_polo(t.polo_id)
          )
        )
    $policy$;
  END IF;
END;
$$;

DO $$
DECLARE
  v_proc regprocedure;
BEGIN
  v_proc := to_regprocedure('public.get_despesas_summary(text, uuid, uuid, text, date, date, text, uuid)');

  IF v_proc IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', v_proc);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_proc);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_proc);
  END IF;
END;
$$;

-- As policies publicas precisam ficar separadas das regras autenticadas para
-- visitantes anonimos nao dependerem de helpers privados do portal.
DO $$
BEGIN
  IF to_regclass('public.cursos') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "portal_cursos_select" ON public.cursos';
    EXECUTE 'DROP POLICY IF EXISTS "portal_cursos_public_select" ON public.cursos';
    EXECUTE 'DROP POLICY IF EXISTS "portal_cursos_authenticated_select" ON public.cursos';

    EXECUTE $policy$
      CREATE POLICY "portal_cursos_public_select"
        ON public.cursos
        FOR SELECT
        TO anon, authenticated
        USING (public.is_public_course(id))
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "portal_cursos_authenticated_select"
        ON public.cursos
        FOR SELECT
        TO authenticated
        USING (
          public.is_gestor()
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
        )
    $policy$;
  END IF;

  IF to_regclass('public.turmas') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "portal_turmas_select" ON public.turmas';
    EXECUTE 'DROP POLICY IF EXISTS "portal_turmas_public_select" ON public.turmas';
    EXECUTE 'DROP POLICY IF EXISTS "portal_turmas_authenticated_select" ON public.turmas';

    EXECUTE $policy$
      CREATE POLICY "portal_turmas_public_select"
        ON public.turmas
        FOR SELECT
        TO anon, authenticated
        USING (public.is_public_turma(id))
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "portal_turmas_authenticated_select"
        ON public.turmas
        FOR SELECT
        TO authenticated
        USING (
          public.is_gestor_for_polo(polo_id)
          OR public.is_aluno_matriculado_turma(id)
          OR public.is_professor_assigned_turma(id)
        )
    $policy$;
  END IF;
END;
$$;

-- Remove execucao implicita de SECURITY DEFINER por PUBLIC/anon, preservando
-- somente as RPCs publicas intencionais listadas abaixo.
DO $$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS regproc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND p.proname <> ALL (ARRAY[
        'resolve_portal_login_email',
        'validar_documento_por_codigo',
        'get_dados_institucionais_polo'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_function.regproc);
  END LOOP;
END;
$$;

-- Helpers/RPCs autenticadas que precisam continuar disponiveis no portal.
DO $$
DECLARE
  v_signature text;
  v_proc regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.auth_email()',
    'public.buscar_aluno_global_para_vinculo(text)',
    'public.calcular_avaliacao_estagio(jsonb)',
    'public.calcular_regras_financeiras_turma(numeric, numeric, numeric, numeric)',
    'public.calcular_valores_cobranca_padrao(numeric, date, date)',
    'public.can_access_curso(uuid)',
    'public.can_access_turma(uuid)',
    'public.can_write_turma(uuid)',
    'public.current_aluno_id()',
    'public.current_professor_id()',
    'public.dashboard_aluno_matches_modalidades(uuid, text[])',
    'public.ead_buscar_alunos_disponiveis(uuid, text)',
    'public.ead_get_aluno_progress(uuid, uuid)',
    'public.ead_get_cursos_grouped(text, text, text)',
    'public.ead_get_cursos_grouped(text, text, text, text, text)',
    'public.ead_get_dashboard()',
    'public.ead_get_turma_alunos(uuid)',
    'public.ead_get_turma_dashboard(uuid)',
    'public.ead_liberar_matricula(uuid)',
    'public.ead_matricular_aluno_manual(uuid, uuid)',
    'public.ead_update_aluno_progress(uuid, uuid, text, text, jsonb)',
    'public.emitir_documento_validacao(text, uuid, text, text, timestamp with time zone, uuid, boolean)',
    'public.fechar_periodo_letivo(uuid, uuid)',
    'public.finalizar_certificado_academico(uuid, text, text, text, text, text, text, text, uuid)',
    'public.finalizar_turma_academica(uuid, uuid)',
    'public.financeiro_polo_id()',
    'public.gestor_allowed_polo_ids()',
    'public.gestor_has_all_polos()',
    'public.gestor_has_financeiro_tab(text)',
    'public.gestor_has_module(text)',
    'public.gestor_polo_id()',
    'public.get_aluno_extrato_financeiro(uuid)',
    'public.get_contas_bancarias_saldos()',
    'public.get_curso_grade_kpis(uuid)',
    'public.get_cursos_com_kpis(text)',
    'public.get_dashboard_chart_data(uuid, integer)',
    'public.get_dashboard_chart_data_filtered(uuid, integer, text[])',
    'public.get_dashboard_kpis(uuid)',
    'public.get_dashboard_kpis_filtered(uuid, text[])',
    'public.get_dashboard_recent_activity(uuid, integer)',
    'public.get_dashboard_recent_activity_filtered(uuid, integer, text[])',
    'public.get_diario_resultados(uuid, uuid)',
    'public.get_diarios_turma(uuid)',
    'public.get_financeiro_summary(uuid, date, date)',
    'public.get_fluxo_consolidado_3_meses(uuid)',
    'public.get_gestao_resumo_kpis(uuid)',
    'public.get_pagamentos_irpf_aluno(uuid, integer, uuid)',
    'public.get_parceiros_kpis()',
    'public.get_partner_google_identity_status(uuid)',
    'public.get_pendencias_fechamento_periodo(uuid)',
    'public.get_professor_dashboard(uuid)',
    'public.get_turma_alunos_academico(uuid)',
    'public.get_turma_resumo_academico(uuid)',
    'public.is_aluno_matriculado_turma(uuid)',
    'public.is_financeiro_for_polo(uuid)',
    'public.is_financeiro_global()',
    'public.is_financeiro_operador()',
    'public.is_gestor()',
    'public.is_gestor_for_polo(uuid)',
    'public.is_gestor_global()',
    'public.is_parceiro_in_financeiro_scope(uuid, uuid)',
    'public.is_partner_in_gestor_scope(uuid, uuid[])',
    'public.is_professor_assigned_disciplina(uuid, uuid)',
    'public.is_professor_assigned_turma(uuid)',
    'public.is_public_course(uuid)',
    'public.is_public_turma(uuid)',
    'public.matricular_aluno_turma(uuid, uuid, uuid)',
    'public.matricular_aluno_turma_financeiro(uuid, uuid, uuid, numeric, date, numeric, numeric, integer, boolean, boolean, boolean, boolean)',
    'public.movimentar_matricula_academica(uuid, text, text, text, date, date, uuid)',
    'public.prever_geracao_cobrancas_futuras(uuid, date)',
    'public.professor_can_publish_library_document(uuid, text, uuid[])',
    'public.reabrir_periodo_letivo(uuid, text, uuid)',
    'public.receber_transferencia_externa(uuid, uuid, text, text, text, text, date, uuid)',
    'public.revogar_documento_validacao(text)',
    'public.salvar_avaliacao_estagio(uuid, uuid, uuid, numeric, jsonb, jsonb, text, text, date)',
    'public.transferir_matricula_academica(uuid, text, text, uuid, text, text, date, uuid)',
    'public.unlink_partner_google_identity(uuid)'
  ]
  LOOP
    v_proc := to_regprocedure(v_signature);

    IF v_proc IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_proc);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_proc);
    END IF;
  END LOOP;
END;
$$;

-- Rotinas internas de trigger/manutencao: nao devem ser RPCs de cliente.
DO $$
DECLARE
  v_signature text;
  v_proc regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.ajustar_financeiro_movimentacao_matricula()',
    'public.asaas_get_secret(text)',
    'public.asaas_set_secret(text, text)',
    'public.bloquear_edicao_periodo_fechado()',
    'public.criar_checklist_documentos_aluno()',
    'public.criar_financeiro_ao_matricular()',
    'public.delete_partner_auth_user_on_partner_delete()',
    'public.ead_activate_matricula_on_paid_inscricao()',
    'public.formatar_matricula_validacao(uuid, timestamp with time zone, uuid)',
    'public.gerar_ciclo_financeiro_apos_pagamento()',
    'public.gerar_cobranca_matricula(uuid)',
    'public.gerar_parcelas_apos_baixa_matricula()',
    'public.gerar_parcelas_matricula(uuid)',
    'public.gerar_rematricula_apos_parcelas(uuid)',
    'public.processar_continuidade_transferencia()',
    'public.registrar_turma_financeiro_auditoria(uuid, text, jsonb, text)',
    'public.resolver_flags_financeiras_turma_matricula(uuid)',
    'public.resolver_flags_financeiras_turma_matricula(uuid, boolean, boolean, boolean, boolean)',
    'public.rls_auto_enable()',
    'public.sincronizar_certificado_matricula()',
    'public.sincronizar_periodos_turma_tecnica()',
    'public.sync_aluno_polo_scope(uuid, uuid)',
    'public.sync_aluno_polo_scope_from_matricula()',
    'public.touch_ead_aluno_progresso_updated_at()',
    'public.validar_turma_unica_ead()'
  ]
  LOOP
    v_proc := to_regprocedure(v_signature);

    IF v_proc IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_proc);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_proc);
    END IF;
  END LOOP;
END;
$$;

-- RPCs publicas avaliadas como intencionais para fluxos anonimos.
DO $$
DECLARE
  v_signature text;
  v_proc regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.can_access_curso(uuid)',
    'public.can_access_turma(uuid)',
    'public.is_public_course(uuid)',
    'public.is_public_turma(uuid)',
    'public.resolve_portal_login_email(text)',
    'public.validar_documento_por_codigo(text)',
    'public.get_dados_institucionais_polo(uuid)'
  ]
  LOOP
    v_proc := to_regprocedure(v_signature);

    IF v_proc IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_proc);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', v_proc);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
