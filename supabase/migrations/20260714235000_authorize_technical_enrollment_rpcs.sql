-- Escritas de matrícula técnica passam exclusivamente pelos RPCs acadêmicos.

CREATE OR REPLACE FUNCTION internal_academic.authorize_enrollment_upsert(
  p_aluno_id uuid, p_turma_id uuid, p_status text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_matricula_id uuid;
BEGIN
  IF coalesce((SELECT auth.role()), '') = 'service_role' OR NOT EXISTS (
    SELECT 1 FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = p_turma_id AND c.modalidade = 'TECNICO'
  ) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'technical_matricula:' || p_aluno_id::text || ':' || p_turma_id::text, 0
  ));
  SELECT m.id INTO v_matricula_id FROM public.matriculas m
  WHERE m.aluno_id = p_aluno_id AND m.turma_id = p_turma_id;
  PERFORM internal_academic.authorize_transition(
    'MATRICULA_INSERT', p_turma_id, p_status
  );
  IF v_matricula_id IS NOT NULL THEN
    PERFORM internal_academic.authorize_transition(
      'MATRICULA_STATUS', v_matricula_id, p_status
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION internal_academic.authorize_enrollment_status(
  p_matricula_id uuid, p_status text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' AND EXISTS (
    SELECT 1 FROM public.matriculas m JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE m.id = p_matricula_id AND c.modalidade = 'TECNICO'
  ) THEN
    PERFORM internal_academic.authorize_transition(
      'MATRICULA_STATUS', p_matricula_id, p_status
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION internal_academic.authorize_enrollment_upsert(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION internal_academic.authorize_enrollment_status(uuid, text)
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.matricular_aluno_turma(uuid, uuid, uuid)
  SET SCHEMA internal_academic;
ALTER FUNCTION internal_academic.matricular_aluno_turma(uuid, uuid, uuid)
  RENAME TO legacy_matricular_aluno_turma;
ALTER FUNCTION public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric,
  integer, boolean, boolean, boolean, boolean
) SET SCHEMA internal_academic;
ALTER FUNCTION internal_academic.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric,
  integer, boolean, boolean, boolean, boolean
) RENAME TO legacy_matricular_aluno_turma_financeiro;
ALTER FUNCTION public.movimentar_matricula_academica(
  uuid, text, text, text, date, date, uuid
) SET SCHEMA internal_academic;
ALTER FUNCTION internal_academic.movimentar_matricula_academica(
  uuid, text, text, text, date, date, uuid
) RENAME TO legacy_movimentar_matricula_academica;
ALTER FUNCTION public.transferir_matricula_academica(
  uuid, text, text, uuid, text, text, date, uuid
) SET SCHEMA internal_academic;
ALTER FUNCTION internal_academic.transferir_matricula_academica(
  uuid, text, text, uuid, text, text, date, uuid
) RENAME TO legacy_transferir_matricula_academica;
ALTER FUNCTION public.receber_transferencia_externa(
  uuid, uuid, text, text, text, text, date, uuid
) SET SCHEMA internal_academic;
ALTER FUNCTION internal_academic.receber_transferencia_externa(
  uuid, uuid, text, text, text, text, date, uuid
) RENAME TO legacy_receber_transferencia_externa;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma(
  p_aluno_id uuid, p_turma_id uuid, p_responsavel_id uuid DEFAULT NULL
)
RETURNS public.matriculas LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM internal_academic.authorize_enrollment_upsert(
    p_aluno_id, p_turma_id, 'ATIVO'
  );
  RETURN internal_academic.legacy_matricular_aluno_turma(
    p_aluno_id, p_turma_id, p_responsavel_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma_financeiro(
  p_aluno_id uuid, p_turma_id uuid, p_responsavel_id uuid DEFAULT NULL,
  p_valor_matricula numeric DEFAULT NULL, p_data_vencimento_matricula date DEFAULT NULL,
  p_valor_parcela numeric DEFAULT NULL, p_valor_rematricula numeric DEFAULT NULL,
  p_dia_vencimento integer DEFAULT NULL, p_financeiro_herdado boolean DEFAULT NULL,
  p_gerar_cobranca_inicial boolean DEFAULT NULL, p_gerar_cobranca_futura boolean DEFAULT NULL,
  p_sincronizar_asaas boolean DEFAULT NULL
)
RETURNS public.matriculas LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM internal_academic.authorize_enrollment_upsert(
    p_aluno_id, p_turma_id, 'ATIVO'
  );
  RETURN internal_academic.legacy_matricular_aluno_turma_financeiro(
    p_aluno_id, p_turma_id, p_responsavel_id, p_valor_matricula,
    coalesce(p_data_vencimento_matricula,
      (pg_catalog.timezone('America/Maceio', now()))::date),
    p_valor_parcela, p_valor_rematricula,
    p_dia_vencimento, p_financeiro_herdado, p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura, p_sincronizar_asaas
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.movimentar_matricula_academica(
  p_matricula_id uuid, p_tipo text, p_motivo text, p_observacao text DEFAULT NULL,
  p_data_movimentacao date DEFAULT NULL, p_data_retorno_prevista date DEFAULT NULL,
  p_responsavel_id uuid DEFAULT NULL
)
RETURNS public.matriculas LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_turma_id uuid; v_status text;
BEGIN
  SELECT m.turma_id INTO v_turma_id FROM public.matriculas m
  WHERE m.id = p_matricula_id;
  IF v_turma_id IS NULL THEN RAISE EXCEPTION 'Matrícula não encontrada.'; END IF;
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT public.can_write_turma(v_turma_id) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar esta matrícula.' USING ERRCODE = '42501';
  END IF;
  v_status := CASE upper(btrim(p_tipo)) WHEN 'TRANCAMENTO' THEN 'TRANCADO'
    WHEN 'CANCELAMENTO' THEN 'CANCELADO' WHEN 'DESISTENCIA' THEN 'DESISTENTE'
    WHEN 'REATIVACAO' THEN 'ATIVO' WHEN 'CONCLUSAO' THEN 'CONCLUIDO' END;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Tipo de movimentação inválido.'; END IF;
  PERFORM internal_academic.authorize_enrollment_status(p_matricula_id, v_status);
  RETURN internal_academic.legacy_movimentar_matricula_academica(
    p_matricula_id, p_tipo, p_motivo, p_observacao,
    coalesce(p_data_movimentacao, (pg_catalog.timezone('America/Maceio', now()))::date),
    p_data_retorno_prevista, p_responsavel_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transferir_matricula_academica(
  p_matricula_id uuid, p_tipo text, p_motivo text, p_turma_destino_id uuid DEFAULT NULL,
  p_instituicao_destino text DEFAULT NULL, p_observacao text DEFAULT NULL,
  p_data_transferencia date DEFAULT NULL, p_responsavel_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_origem public.matriculas%rowtype; v_tipo text := upper(btrim(p_tipo));
BEGIN
  SELECT * INTO v_origem FROM public.matriculas WHERE id = p_matricula_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula de origem não encontrada.'; END IF;
  IF coalesce((SELECT auth.role()), '') <> 'service_role' AND (
    NOT public.can_write_turma(v_origem.turma_id) OR
    (v_tipo IN ('INTERNA_TURMA', 'INTERNA_POLO')
      AND NOT public.can_write_turma(p_turma_destino_id))
  ) THEN RAISE EXCEPTION 'Sem permissão para transferir esta matrícula.' USING ERRCODE = '42501'; END IF;
  PERFORM internal_academic.authorize_enrollment_status(p_matricula_id, 'TRANSFERIDO');
  IF v_tipo IN ('INTERNA_TURMA', 'INTERNA_POLO') THEN
    PERFORM internal_academic.authorize_enrollment_upsert(
      v_origem.aluno_id, p_turma_destino_id, 'ATIVO'
    );
  END IF;
  RETURN internal_academic.legacy_transferir_matricula_academica(
    p_matricula_id, p_tipo, p_motivo, p_turma_destino_id,
    p_instituicao_destino, p_observacao,
    coalesce(p_data_transferencia, (pg_catalog.timezone('America/Maceio', now()))::date),
    p_responsavel_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receber_transferencia_externa(
  p_aluno_id uuid, p_turma_destino_id uuid, p_instituicao_origem text,
  p_curso_origem text, p_motivo text, p_observacao text DEFAULT NULL,
  p_data_transferencia date DEFAULT NULL, p_responsavel_id uuid DEFAULT NULL
)
RETURNS public.matriculas LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT public.can_write_turma(p_turma_destino_id) THEN
    RAISE EXCEPTION 'Sem permissão para receber matrícula nesta turma.' USING ERRCODE = '42501';
  END IF;
  PERFORM internal_academic.authorize_enrollment_upsert(
    p_aluno_id, p_turma_destino_id, 'ATIVO'
  );
  RETURN internal_academic.legacy_receber_transferencia_externa(
    p_aluno_id, p_turma_destino_id, p_instituicao_origem, p_curso_origem,
    p_motivo, p_observacao,
    coalesce(p_data_transferencia, (pg_catalog.timezone('America/Maceio', now()))::date),
    p_responsavel_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_technical_enrollment_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_authorized boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = OLD.turma_id AND c.modalidade = 'TECNICO'
  ) THEN
    DELETE FROM internal_academic.transition_authorizations a
    WHERE a.transaction_id = pg_current_xact_id()::text
      AND a.backend_pid = pg_backend_pid() AND a.entity = 'MATRICULA_DELETE'
      AND a.record_id = OLD.id AND a.new_status = 'DELETE'
    RETURNING true INTO v_authorized;
    IF NOT coalesce(v_authorized, false) THEN
      RAISE EXCEPTION 'Matrícula técnica é histórico acadêmico; use a remoção oficial.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_technical_academic_audit_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_origem uuid := OLD.turma_origem_id; v_destino uuid := OLD.turma_destino_id;
  v_authorized boolean;
BEGIN
  IF v_origem IS NULL AND v_destino IS NULL
    AND TG_TABLE_NAME = 'matricula_movimentacoes' THEN
    SELECT m.turma_id INTO v_origem FROM public.matriculas m WHERE m.id = OLD.matricula_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id IN (v_origem, v_destino) AND c.modalidade = 'TECNICO'
  ) THEN
    DELETE FROM internal_academic.transition_authorizations a
    WHERE a.transaction_id = pg_current_xact_id()::text
      AND a.backend_pid = pg_backend_pid() AND a.entity = 'ACADEMIC_AUDIT_DELETE'
      AND a.record_id = OLD.id AND a.new_status = TG_TABLE_NAME
    RETURNING true INTO v_authorized;
    IF NOT coalesce(v_authorized, false) THEN
      RAISE EXCEPTION 'Registros de auditoria técnica não podem ser excluídos.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_matricula_turma(p_matricula_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_matricula public.matriculas%rowtype; v_turma public.turmas%rowtype;
  v_total_documentos integer := 0;
BEGIN
  SELECT * INTO v_matricula FROM public.matriculas
  WHERE id = p_matricula_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula não encontrada.'; END IF;
  SELECT * INTO v_turma FROM public.turmas
  WHERE id = v_matricula.turma_id FOR UPDATE;
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT public.can_write_turma(v_turma.id) THEN
    RAISE EXCEPTION 'Sem permissão para remover esta matrícula.' USING ERRCODE = '42501';
  END IF;
  IF v_turma.data_inicio IS NOT NULL AND v_turma.data_inicio <=
    (pg_catalog.timezone('America/Maceio', now()))::date THEN
    RAISE EXCEPTION 'A turma já começou. Use o cancelamento para preservar o histórico.';
  END IF;
  IF public.matricula_possui_lancamentos_academicos(v_matricula.id) THEN
    RAISE EXCEPTION 'A matrícula possui lançamentos. Use o cancelamento para preservar o histórico.';
  END IF;
  DELETE FROM public.documentos_validacao WHERE matricula_id = v_matricula.id;
  GET DIAGNOSTICS v_total_documentos = ROW_COUNT;
  DELETE FROM public.contas_receber WHERE matricula_id = v_matricula.id;
  DELETE FROM public.inscricoes_online WHERE matricula_id = v_matricula.id;
  DELETE FROM public.matricula_movimentacoes WHERE matricula_id = v_matricula.id;
  DELETE FROM public.matricula_aproveitamentos
  WHERE matricula_id = v_matricula.id OR matricula_origem_id = v_matricula.id;
  UPDATE public.matriculas SET origem_matricula_id = NULL
  WHERE origem_matricula_id = v_matricula.id;
  DELETE FROM public.matriculas WHERE id = v_matricula.id;
  RETURN jsonb_build_object('matriculaId', v_matricula.id,
    'alunoId', v_matricula.aluno_id, 'turmaId', v_matricula.turma_id,
    'documentosRemovidos', v_total_documentos, 'removed', true);
END;
$$;

ALTER FUNCTION public.remover_matricula_turma(uuid) SET SCHEMA internal_academic;
ALTER FUNCTION internal_academic.remover_matricula_turma(uuid)
  RENAME TO legacy_remover_matricula_turma;

CREATE OR REPLACE FUNCTION public.remover_matricula_turma(p_matricula_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_matricula public.matriculas%rowtype; v_tecnico boolean := false;
BEGIN
  SELECT m.* INTO v_matricula FROM public.matriculas m
  WHERE m.id = p_matricula_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula não encontrada.'; END IF;
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT public.can_write_turma(v_matricula.turma_id) THEN
    RAISE EXCEPTION 'Sem permissão para remover esta matrícula.' USING ERRCODE = '42501';
  END IF;
  SELECT c.modalidade = 'TECNICO' INTO v_tecnico
  FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = v_matricula.turma_id;
  IF coalesce(v_tecnico, false) THEN
    PERFORM internal_academic.authorize_transition(
      'ACADEMIC_AUDIT_DELETE', mm.id, 'matricula_movimentacoes'
    ) FROM public.matricula_movimentacoes mm
      WHERE mm.matricula_id = p_matricula_id;
    PERFORM internal_academic.authorize_transition(
      'MATRICULA_DELETE', p_matricula_id, 'DELETE'
    );
  END IF;
  RETURN internal_academic.legacy_remover_matricula_turma(p_matricula_id);
END;
$$;

DROP POLICY IF EXISTS portal_matricula_movimentacoes_insert
  ON public.matricula_movimentacoes;
DROP POLICY IF EXISTS portal_transferencias_academicas_insert
  ON public.transferencias_academicas;
CREATE POLICY portal_matricula_movimentacoes_insert
  ON public.matricula_movimentacoes FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
      WHERE c.modalidade = 'TECNICO' AND t.id IN (
        matricula_movimentacoes.turma_origem_id,
        matricula_movimentacoes.turma_destino_id,
        (SELECT m.turma_id FROM public.matriculas m
          WHERE m.id = matricula_movimentacoes.matricula_id)
      )
    ) AND (
      (turma_origem_id IS NOT NULL AND public.can_write_turma(turma_origem_id))
      OR (turma_destino_id IS NOT NULL AND public.can_write_turma(turma_destino_id))
      OR EXISTS (SELECT 1 FROM public.matriculas m
        WHERE m.id = matricula_id AND public.can_write_turma(m.turma_id))
    )
  );
CREATE POLICY portal_transferencias_academicas_insert
  ON public.transferencias_academicas FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
      WHERE c.modalidade = 'TECNICO'
        AND t.id IN (transferencias_academicas.turma_origem_id,
          transferencias_academicas.turma_destino_id)
    ) AND (
      (turma_origem_id IS NOT NULL AND public.can_write_turma(turma_origem_id))
      OR (turma_destino_id IS NOT NULL AND public.can_write_turma(turma_destino_id))
    )
  );

REVOKE EXECUTE ON FUNCTION public.matricular_aluno_turma(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric,
  integer, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.movimentar_matricula_academica(
  uuid, text, text, text, date, date, uuid
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transferir_matricula_academica(
  uuid, text, text, uuid, text, text, date, uuid
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.receber_transferencia_externa(
  uuid, uuid, text, text, text, text, date, uuid
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remover_matricula_turma(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma(uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric,
  integer, boolean, boolean, boolean, boolean
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.movimentar_matricula_academica(
  uuid, text, text, text, date, date, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transferir_matricula_academica(
  uuid, text, text, uuid, text, text, date, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receber_transferencia_externa(
  uuid, uuid, text, text, text, text, date, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remover_matricula_turma(uuid)
  TO authenticated, service_role;
