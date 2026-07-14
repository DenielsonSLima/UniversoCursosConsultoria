ALTER TABLE public.matricula_movimentacoes
  DROP CONSTRAINT IF EXISTS matricula_movimentacoes_tipo_check;
ALTER TABLE public.matricula_movimentacoes
  ADD CONSTRAINT matricula_movimentacoes_tipo_check CHECK (tipo IN (
    'MATRICULA', 'TRANCAMENTO', 'CANCELAMENTO', 'DESISTENCIA', 'REATIVACAO',
    'TRANSFERENCIA_INTERNA', 'TRANSFERENCIA_EXTERNA_ENVIADA',
    'TRANSFERENCIA_EXTERNA_RECEBIDA', 'CONCLUSAO', 'REPROVACAO'
  ));
CREATE OR REPLACE FUNCTION public.protect_technical_enrollment_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_status text;
  v_tecnico boolean := false;
  v_old_tecnico boolean := false;
  v_service boolean := coalesce((SELECT auth.role()), '') = 'service_role';
  v_activation boolean := TG_OP = 'INSERT';
  v_authorized boolean;
BEGIN
  SELECT t.status, c.modalidade = 'TECNICO' INTO v_status, v_tecnico
  FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = NEW.turma_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT c.modalidade = 'TECNICO' INTO v_old_tecnico
    FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = OLD.turma_id;
    IF (coalesce(v_tecnico, false) OR coalesce(v_old_tecnico, false))
      AND NEW.turma_id IS DISTINCT FROM OLD.turma_id THEN
      RAISE EXCEPTION 'Matrícula técnica deve mudar de turma somente pela transferência acadêmica.';
    END IF;
    IF (coalesce(v_tecnico, false) OR coalesce(v_old_tecnico, false))
      AND NEW.aluno_id IS DISTINCT FROM OLD.aluno_id THEN
      RAISE EXCEPTION 'O aluno de uma matrícula técnica é imutável.';
    END IF;
    v_activation := NEW.status = 'ATIVO' AND OLD.status IS DISTINCT FROM 'ATIVO';
  END IF;
  IF NOT coalesce(v_tecnico, false) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('PENDENTE', 'ATIVO') THEN
    RAISE EXCEPTION 'Matrícula técnica nova deve iniciar pendente ou ativa.';
  END IF;
  IF TG_OP = 'UPDATE' AND v_status = 'FINALIZADA' AND
    (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM
    (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'Dados de matrícula técnica finalizada são imutáveis.';
  END IF;
  IF v_activation THEN
    IF v_status NOT IN ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO') THEN
      RAISE EXCEPTION 'Turma técnica finalizada não aceita matrícula ou reativação.';
    END IF;
    IF NOT v_service AND NOT (SELECT public.can_write_turma(NEW.turma_id)) THEN
      RAISE EXCEPTION 'Sem permissão para matricular nesta turma técnica.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NOT v_service AND (
    TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status)
  ) THEN
    DELETE FROM internal_academic.transition_authorizations a
    WHERE a.transaction_id = pg_current_xact_id()::text
      AND a.backend_pid = pg_backend_pid()
      AND a.entity = CASE WHEN TG_OP = 'INSERT'
        THEN 'MATRICULA_INSERT' ELSE 'MATRICULA_STATUS' END
      AND a.record_id = CASE WHEN TG_OP = 'INSERT' THEN NEW.turma_id ELSE NEW.id END
      AND a.new_status = NEW.status
    RETURNING true INTO v_authorized;
    IF NOT coalesce(v_authorized, false) THEN
      RAISE EXCEPTION 'Use a ação acadêmica oficial para alterar matrícula técnica.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF v_status = 'FINALIZADA' AND NOT (
      OLD.status = 'ATIVO' AND NEW.status IN ('CONCLUIDO', 'REPROVADO')
    ) THEN
      RAISE EXCEPTION 'Matrícula de turma técnica finalizada é somente leitura.';
    END IF;
    IF NEW.status IN ('CONCLUIDO', 'REPROVADO') AND v_status <> 'FINALIZADA' THEN
      RAISE EXCEPTION 'Conclusão ou reprovação exige a finalização acadêmica oficial.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_technical_enrollment_lifecycle()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_technical_enrollment_lifecycle_trigger ON public.matriculas;
CREATE TRIGGER protect_technical_enrollment_lifecycle_trigger
BEFORE INSERT OR UPDATE ON public.matriculas FOR EACH ROW
EXECUTE FUNCTION public.protect_technical_enrollment_lifecycle();
CREATE OR REPLACE FUNCTION public.protect_technical_enrollment_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = OLD.turma_id AND c.modalidade = 'TECNICO'
  ) THEN
    RAISE EXCEPTION 'Matrícula técnica é histórico acadêmico; use movimentação ou cancelamento.';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_technical_enrollment_delete()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_technical_enrollment_delete_trigger ON public.matriculas;
CREATE TRIGGER protect_technical_enrollment_delete_trigger
BEFORE DELETE ON public.matriculas FOR EACH ROW
EXECUTE FUNCTION public.protect_technical_enrollment_delete();
CREATE OR REPLACE FUNCTION public.protect_technical_turma_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cursos c
    WHERE c.id = OLD.curso_id AND c.modalidade = 'TECNICO') AND (
      OLD.status <> 'PLANEJADA'
      OR EXISTS (SELECT 1 FROM public.matriculas m WHERE m.turma_id = OLD.id)
      OR EXISTS (SELECT 1 FROM public.inscricoes_online i WHERE i.turma_id = OLD.id)
      OR EXISTS (SELECT 1 FROM public.atividades_extra_classe a WHERE a.turma_id = OLD.id)
    ) THEN
    RAISE EXCEPTION 'Somente turma técnica planejada e sem vínculos pode ser excluída.';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_technical_turma_delete()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_technical_turma_delete_trigger ON public.turmas;
CREATE TRIGGER protect_technical_turma_delete_trigger BEFORE DELETE ON public.turmas
FOR EACH ROW EXECUTE FUNCTION public.protect_technical_turma_delete();
CREATE OR REPLACE FUNCTION public.stamp_and_authorize_academic_responsavel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_origem uuid := NEW.turma_origem_id;
  v_destino uuid := NEW.turma_destino_id;
  v_origem_antiga uuid;
  v_destino_antigo uuid;
  v_tecnico boolean := false;
  v_origem_tecnica boolean := false;
  v_destino_tecnico boolean := false;
  v_origem_status text;
  v_destino_status text;
  v_origem_curso uuid;
  v_destino_curso uuid;
  v_service_role boolean := coalesce((SELECT auth.role()), '') = 'service_role';
BEGIN
  IF v_origem IS NULL AND v_destino IS NULL AND TG_TABLE_NAME = 'matricula_movimentacoes' THEN
    SELECT m.turma_id INTO v_origem FROM public.matriculas m
    WHERE m.id = NEW.matricula_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_origem_antiga := OLD.turma_origem_id;
    v_destino_antigo := OLD.turma_destino_id;
    IF v_origem_antiga IS NULL AND v_destino_antigo IS NULL
      AND TG_TABLE_NAME = 'matricula_movimentacoes' THEN
      SELECT m.turma_id INTO v_origem_antiga FROM public.matriculas m
      WHERE m.id = OLD.matricula_id;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id IN (v_origem, v_destino, v_origem_antiga, v_destino_antigo)
      AND c.modalidade = 'TECNICO'
  ) INTO v_tecnico;
  IF NOT v_tecnico THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Registros de auditoria técnica são imutáveis.'
      USING ERRCODE = '42501';
  END IF;

  -- RPCs legadas usam a data civil da sessão como default; normalize o valor
  -- automático para a mesma data local usada pelo frontend.
  IF TG_TABLE_NAME = 'matricula_movimentacoes'
    AND NEW.data_movimentacao = now()::date THEN
    NEW.data_movimentacao := (pg_catalog.timezone('America/Maceio', now()))::date;
  ELSIF TG_TABLE_NAME = 'transferencias_academicas'
    AND NEW.data_transferencia = now()::date THEN
    NEW.data_transferencia := (pg_catalog.timezone('America/Maceio', now()))::date;
  END IF;

  SELECT t.status, t.curso_id, c.modalidade = 'TECNICO'
    INTO v_origem_status, v_origem_curso, v_origem_tecnica
  FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = v_origem;
  SELECT t.status, t.curso_id, c.modalidade = 'TECNICO'
    INTO v_destino_status, v_destino_curso, v_destino_tecnico
  FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = v_destino;

  IF TG_TABLE_NAME = 'transferencias_academicas' THEN
    IF (v_origem_tecnica AND v_origem_status <> 'EM_ANDAMENTO')
      OR (v_destino_tecnico AND v_destino_status <> 'EM_ANDAMENTO') THEN
      RAISE EXCEPTION 'Transferência técnica exige turmas em andamento.';
    END IF;
    IF NEW.tipo IN ('INTERNA_TURMA', 'INTERNA_POLO') AND (
      NOT coalesce(v_origem_tecnica, false) OR NOT coalesce(v_destino_tecnico, false)
      OR v_origem_curso IS DISTINCT FROM v_destino_curso
    ) THEN
      RAISE EXCEPTION 'Transferência técnica interna exige destino técnico do mesmo curso.';
    END IF;
  ELSIF NEW.tipo = 'MATRICULA' THEN
    IF (v_origem_tecnica AND v_origem_status NOT IN (
      'PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO')) OR
      (v_destino_tecnico AND v_destino_status NOT IN (
        'PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO')) THEN
      RAISE EXCEPTION 'Turma técnica finalizada não aceita matrícula.';
    END IF;
  ELSIF NEW.tipo IN ('CONCLUSAO', 'REPROVACAO') THEN
    IF (v_origem_tecnica AND v_origem_status <> 'FINALIZADA')
      OR (v_destino_tecnico AND v_destino_status <> 'FINALIZADA') THEN
      RAISE EXCEPTION 'Conclusão e reprovação exigem a finalização oficial da turma.';
    END IF;
  ELSIF (v_origem_tecnica AND v_origem_status <> 'EM_ANDAMENTO')
    OR (v_destino_tecnico AND v_destino_status <> 'EM_ANDAMENTO') THEN
    RAISE EXCEPTION 'Movimentação técnica exige turma em andamento.';
  END IF;

  IF NOT v_service_role AND (
    (v_origem IS NULL AND v_destino IS NULL
      AND v_origem_antiga IS NULL AND v_destino_antigo IS NULL)
    OR (v_origem IS NOT NULL AND NOT (SELECT public.can_write_turma(v_origem)))
    OR (v_destino IS NOT NULL AND NOT (SELECT public.can_write_turma(v_destino)))
    OR (v_origem_antiga IS NOT NULL
      AND NOT (SELECT public.can_write_turma(v_origem_antiga)))
    OR (v_destino_antigo IS NOT NULL
      AND NOT (SELECT public.can_write_turma(v_destino_antigo)))
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registrar esta movimentação acadêmica.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.responsavel_id := CASE
      WHEN v_service_role
        THEN internal_academic.resolve_responsavel(NEW.responsavel_id)
      ELSE internal_academic.resolve_responsavel(NULL)
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stamp_and_authorize_academic_responsavel()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stamp_academic_responsavel_movimentacao
  ON public.matricula_movimentacoes;
CREATE TRIGGER stamp_academic_responsavel_movimentacao
BEFORE INSERT OR UPDATE ON public.matricula_movimentacoes
FOR EACH ROW EXECUTE FUNCTION public.stamp_and_authorize_academic_responsavel();

DROP TRIGGER IF EXISTS stamp_academic_responsavel_transferencia
  ON public.transferencias_academicas;
CREATE TRIGGER stamp_academic_responsavel_transferencia
BEFORE INSERT OR UPDATE ON public.transferencias_academicas
FOR EACH ROW EXECUTE FUNCTION public.stamp_and_authorize_academic_responsavel();

CREATE OR REPLACE FUNCTION public.protect_technical_academic_audit_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_origem uuid := OLD.turma_origem_id; v_destino uuid := OLD.turma_destino_id;
BEGIN
  IF v_origem IS NULL AND v_destino IS NULL
    AND TG_TABLE_NAME = 'matricula_movimentacoes' THEN
    SELECT m.turma_id INTO v_origem FROM public.matriculas m
    WHERE m.id = OLD.matricula_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id IN (v_origem, v_destino) AND c.modalidade = 'TECNICO'
  ) THEN
    RAISE EXCEPTION 'Registros de auditoria técnica não podem ser excluídos.';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_technical_academic_audit_delete()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_technical_audit_delete_movimentacao
  ON public.matricula_movimentacoes;
CREATE TRIGGER protect_technical_audit_delete_movimentacao
BEFORE DELETE ON public.matricula_movimentacoes FOR EACH ROW
EXECUTE FUNCTION public.protect_technical_academic_audit_delete();
DROP TRIGGER IF EXISTS protect_technical_audit_delete_transferencia
  ON public.transferencias_academicas;
CREATE TRIGGER protect_technical_audit_delete_transferencia
BEFORE DELETE ON public.transferencias_academicas FOR EACH ROW
EXECUTE FUNCTION public.protect_technical_academic_audit_delete();

-- O RPC continua compatível, mas a autorização, o ciclo e as vacinas são
-- novamente verificados no banco antes de qualquer upsert.
CREATE OR REPLACE FUNCTION public.salvar_avaliacao_estagio(
  p_turma_id uuid, p_disciplina_id uuid, p_aluno_id uuid,
  p_frequencia numeric, p_criterios jsonb, p_checklist jsonb,
  p_perfil_aluno text, p_instrutor_nome text, p_data_avaliacao date
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_notas jsonb; v_avaliacao public.matriculas_estagios%rowtype;
BEGIN
  IF NOT public.can_write_academic_record_open(p_turma_id, p_disciplina_id) THEN
    RAISE EXCEPTION 'Estágio fora do período operacional ou ator não autorizado.'
      USING ERRCODE = '42501';
  END IF;
  IF p_frequencia NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Frequência inválida.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.matriculas m
    WHERE m.turma_id = p_turma_id AND m.aluno_id = p_aluno_id
      AND m.status = 'ATIVO') THEN
    RAISE EXCEPTION 'O aluno não possui matrícula ativa nesta turma.';
  END IF;
  IF NOT public.is_aluno_vacinas_estagio_liberado(p_turma_id, p_aluno_id) THEN
    RAISE EXCEPTION 'O aluno possui doses obrigatórias sem aprovação para o estágio.'
      USING ERRCODE = '23514';
  END IF;
  v_notas := public.calcular_avaliacao_estagio(coalesce(p_criterios, '{}'::jsonb));
  INSERT INTO public.matriculas_estagios (
    turma_id, disciplina_id, aluno_id, nota_comportamento, nota_registros,
    nota_tecnicas, frequencia_estagio, criterios_detalhes,
    checklist_procedimentos, perfil_aluno, instrutor_nome, data_avaliacao
  ) VALUES (
    p_turma_id, p_disciplina_id, p_aluno_id,
    (v_notas ->> 'comportamento')::numeric,
    (v_notas ->> 'registros')::numeric,
    (v_notas ->> 'tecnicas')::numeric,
    p_frequencia, coalesce(p_criterios, '{}'::jsonb),
    coalesce(p_checklist, '[]'::jsonb), coalesce(p_perfil_aluno, ''),
    coalesce(p_instrutor_nome, ''), coalesce(p_data_avaliacao,
      (pg_catalog.timezone('America/Maceio', now()))::date)
  ) ON CONFLICT (turma_id, disciplina_id, aluno_id) DO UPDATE SET
    nota_comportamento = EXCLUDED.nota_comportamento,
    nota_registros = EXCLUDED.nota_registros,
    nota_tecnicas = EXCLUDED.nota_tecnicas,
    frequencia_estagio = EXCLUDED.frequencia_estagio,
    criterios_detalhes = EXCLUDED.criterios_detalhes,
    checklist_procedimentos = EXCLUDED.checklist_procedimentos,
    perfil_aluno = EXCLUDED.perfil_aluno,
    instrutor_nome = EXCLUDED.instrutor_nome,
    data_avaliacao = EXCLUDED.data_avaliacao
  RETURNING * INTO v_avaliacao;
  RETURN to_jsonb(v_avaliacao);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.salvar_avaliacao_estagio(
  uuid, uuid, uuid, numeric, jsonb, jsonb, text, text, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_avaliacao_estagio(
  uuid, uuid, uuid, numeric, jsonb, jsonb, text, text, date
) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.movimentar_matricula_academica(
  uuid, text, text, text, date, date, uuid
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transferir_matricula_academica(
  uuid, text, text, uuid, text, text, date, uuid
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.receber_transferencia_externa(
  uuid, uuid, text, text, text, text, date, uuid
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.matricular_aluno_turma(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric,
  integer, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimentar_matricula_academica(
  uuid, text, text, text, date, date, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transferir_matricula_academica(
  uuid, text, text, uuid, text, text, date, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receber_transferencia_externa(
  uuid, uuid, text, text, text, text, date, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma(uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric,
  integer, boolean, boolean, boolean, boolean
) TO authenticated, service_role;

-- Helpers de checkout são internos: o Edge Function usa service_role.
REVOKE EXECUTE ON FUNCTION public.assert_aluno_sem_matricula_curso_duplicada(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_aluno_sem_matricula_curso_duplicada(
  uuid, uuid, uuid
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.payment_checkout_upsert_matricula(
  uuid, uuid, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_checkout_upsert_matricula(
  uuid, uuid, boolean
) TO service_role;
