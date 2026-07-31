BEGIN;

-- Versão local alinhada ao registro aplicado via MCP.

-- Correções pós-auditoria do fluxo de dependência.
-- Esta migration não altera dados nem cria backfill: fecha invariantes,
-- estabiliza retries e uniformiza a ordem de locks.

-- O workspace pertence à Secretaria. A aba granular nova e a aba legada
-- podem operar dependências; a permissão genérica de Gestão/Alunos não pode
-- criar recebíveis acadêmicos.
CREATE OR REPLACE FUNCTION internal_academic.can_manage_dependency_workspace(
  p_turma_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT auth.role()), '') = 'service_role'
    OR (
      (
        public.gestor_has_tab(
          'secretaria',
          'dependencias-academicas'
        )
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
      )
      AND EXISTS (
        SELECT 1
        FROM public.turmas turma
        WHERE turma.id = p_turma_id
          AND public.is_gestor_for_polo(turma.polo_id)
      )
    );
$$;

REVOKE ALL ON FUNCTION
  internal_academic.can_manage_dependency_workspace(uuid)
  FROM PUBLIC, anon, authenticated;

-- A ficha do aluno no módulo Parceiros já expunha o boletim. Ao trocar a
-- origem para o documento acadêmico canônico, preserva-se essa capacidade
-- dentro do mesmo polo, sem liberar os demais documentos da Secretaria.
CREATE OR REPLACE FUNCTION public.can_manage_secretaria_document(
  p_documento text,
  p_polo_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT auth.role()), '') = 'service_role'
    OR (
      CASE
        WHEN p_documento = 'carteirinha' THEN
          public.gestor_has_tab('secretaria', 'carteirinha')
          OR public.gestor_has_tab('secretaria', 'carteirinhas')
        WHEN p_documento = 'cracha_estagio' THEN
          public.gestor_has_tab('secretaria', 'cracha-estagio')
          OR public.gestor_has_tab('secretaria', 'carteirinhas')
        WHEN p_documento = 'cracha_periodo_eleitoral' THEN
          public.gestor_has_tab(
            'secretaria',
            'cracha-periodo-eleitoral'
          )
          OR public.gestor_has_tab('secretaria', 'carteirinhas')
        WHEN p_documento = 'declaracao_matricula' THEN
          public.gestor_has_tab('secretaria', 'declaracao-matricula')
          OR public.gestor_has_tab('secretaria', 'declaracoes')
          OR public.gestor_has_module('parceiros')
        WHEN p_documento = 'declaracao_frequencia' THEN
          public.gestor_has_tab('secretaria', 'declaracao-frequencia')
          OR public.gestor_has_tab('secretaria', 'declaracoes')
        WHEN p_documento = 'boletim' THEN
          public.gestor_has_tab('secretaria', 'boletim')
          OR public.gestor_has_tab('secretaria', 'declaracoes')
          OR public.gestor_has_module('parceiros')
        WHEN p_documento = 'atestado_conclusao_tecnico' THEN
          public.gestor_has_tab('secretaria', 'atestado-conclusao')
          OR public.gestor_has_tab('secretaria', 'declaracoes')
        WHEN p_documento = 'declaracao_irpf' THEN
          public.gestor_has_tab('secretaria', 'declaracao-irpf')
          OR public.gestor_has_tab('secretaria', 'declaracoes')
          OR public.gestor_has_module('parceiros')
        WHEN p_documento = 'historico_escolar' THEN
          public.gestor_has_tab('secretaria', 'historico-escolar')
          OR public.gestor_has_tab('secretaria', 'historico')
        WHEN p_documento IN (
          'certificado_tecnico',
          'certificado_ead',
          'certificado_livre',
          'certificado_especializacao'
        ) THEN
          public.gestor_has_tab('secretaria', 'certificados')
          OR public.gestor_has_tab('secretaria', 'historico')
        WHEN p_documento = 'rematricula' THEN
          public.gestor_has_tab('secretaria', 'rematricula')
          OR public.gestor_has_tab('secretaria', 'solicitacoes')
        WHEN p_documento = 'termo_estagio' THEN
          public.gestor_has_tab('secretaria', 'termo-estagio')
          OR public.gestor_has_tab('secretaria', 'solicitacoes')
        WHEN p_documento = 'transferencia' THEN
          public.gestor_has_tab('secretaria', 'transferencia')
          OR public.gestor_has_tab('secretaria', 'solicitacoes')
        WHEN p_documento = 'pasta_identificacao' THEN
          public.gestor_has_tab('secretaria', 'pasta-identificacao')
          OR public.gestor_has_tab('secretaria', 'fichas')
        WHEN p_documento = 'ficha_matricula' THEN
          public.gestor_has_tab('secretaria', 'ficha-matricula')
          OR public.gestor_has_tab('secretaria', 'fichas')
        ELSE false
      END
      AND CASE
        WHEN p_polo_id IS NULL THEN public.gestor_has_all_polos()
        ELSE public.is_gestor_for_polo(p_polo_id)
      END
    );
$$;

REVOKE ALL ON FUNCTION
  public.can_manage_secretaria_document(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.can_manage_secretaria_document(text, uuid)
  TO authenticated, service_role;

ALTER TABLE public.matricula_disciplina_tentativas
  ADD CONSTRAINT matricula_disciplina_tentativas_terminal_state_chk
  CHECK (
    (
      status IN (
        'AGUARDANDO_PAGAMENTO',
        'LIBERADA',
        'EM_CURSO',
        'CANCELADA'
      )
      AND resultado_destino IS NULL
      AND finalizada_em IS NULL
    )
    OR (
      status = 'APROVADA'
      AND resultado_destino IN ('APROVADO', 'APROVEITADO')
      AND finalizada_em IS NOT NULL
    )
    OR (
      status = 'REPROVADA'
      AND resultado_destino IN ('REPROVADO', 'REPROVADO_FREQUENCIA')
      AND finalizada_em IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION internal_academic.validate_dependency_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_component_discipline uuid;
  v_enrollment_class uuid;
  v_source_course uuid;
  v_target_course uuid;
BEGIN
  IF TG_OP = 'INSERT'
    AND NEW.status <> 'AGUARDANDO_PAGAMENTO'
  THEN
    RAISE EXCEPTION
      'Nova tentativa de dependência deve aguardar pagamento.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.status IS DISTINCT FROM OLD.status
    AND NOT (
      (OLD.status = 'AGUARDANDO_PAGAMENTO'
        AND NEW.status IN ('LIBERADA', 'CANCELADA'))
      OR (OLD.status = 'LIBERADA'
        AND NEW.status IN (
          'AGUARDANDO_PAGAMENTO',
          'EM_CURSO',
          'APROVADA',
          'REPROVADA',
          'CANCELADA'
        ))
      OR (OLD.status = 'EM_CURSO'
        AND NEW.status IN (
          'AGUARDANDO_PAGAMENTO',
          'APROVADA',
          'REPROVADA',
          'CANCELADA'
        ))
      OR (OLD.status IN ('APROVADA', 'REPROVADA')
        AND NEW.status = 'EM_CURSO')
    )
  THEN
    RAISE EXCEPTION
      'Transição inválida da tentativa de dependência: % -> %.',
      OLD.status,
      NEW.status
      USING ERRCODE = '23514';
  END IF;

  SELECT
    componente.disciplina_id,
    matricula.turma_id,
    turma_origem.curso_id,
    turma_destino.curso_id
  INTO
    v_component_discipline,
    v_enrollment_class,
    v_source_course,
    v_target_course
  FROM public.matricula_componentes componente
  JOIN public.matriculas matricula
    ON matricula.id = componente.matricula_id
  JOIN public.turmas turma_origem
    ON turma_origem.id = matricula.turma_id
  JOIN public.turmas turma_destino
    ON turma_destino.id = NEW.turma_id
  WHERE componente.id = NEW.componente_id;

  IF v_component_discipline IS NULL THEN
    RAISE EXCEPTION 'Componente da tentativa não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.disciplina_id <> v_component_discipline THEN
    RAISE EXCEPTION
      'A disciplina da tentativa difere da disciplina do componente.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.turma_origem_id <> v_enrollment_class THEN
    RAISE EXCEPTION
      'A turma de origem da tentativa difere da matrícula original.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.turma_id = NEW.turma_origem_id THEN
    RAISE EXCEPTION
      'Dependência deve usar turma de destino diferente da origem.'
      USING ERRCODE = '23514';
  END IF;

  IF v_source_course IS DISTINCT FROM v_target_course THEN
    RAISE EXCEPTION
      'Origem e destino da dependência devem pertencer ao mesmo curso.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.validate_dependency_attempt()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_dependency_attempt
BEFORE INSERT OR UPDATE
ON public.matricula_disciplina_tentativas
FOR EACH ROW
EXECUTE FUNCTION internal_academic.validate_dependency_attempt();

CREATE OR REPLACE FUNCTION internal_academic.sync_cancelled_dependency_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'CANCELADA'
    AND OLD.status IS DISTINCT FROM 'CANCELADA'
  THEN
    UPDATE public.matricula_componentes
    SET
      status = 'PENDENTE_DEPENDENCIA',
      tentativa_aprovada_id = NULL,
      updated_at = now()
    WHERE id = NEW.componente_id;

    INSERT INTO public.matricula_dependencia_eventos (
      componente_id,
      tentativa_id,
      evento,
      actor_id,
      payload
    ) VALUES (
      NEW.componente_id,
      NEW.id,
      'CANCELADA',
      auth.uid(),
      jsonb_build_object(
        'statusAnterior', OLD.status,
        'statusNovo', NEW.status
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.sync_cancelled_dependency_attempt()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_cancelled_dependency_attempt
AFTER UPDATE OF status
ON public.matricula_disciplina_tentativas
FOR EACH ROW
EXECUTE FUNCTION internal_academic.sync_cancelled_dependency_attempt();

CREATE OR REPLACE FUNCTION internal_academic.validate_dependency_component()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_winner record;
BEGIN
  IF NEW.tentativa_aprovada_id IS NULL THEN
    IF NEW.status = 'APROVADO' THEN
      RAISE EXCEPTION
        'Componente aprovado exige tentativa vencedora.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT
    tentativa.componente_id,
    tentativa.status,
    tentativa.resultado_destino
  INTO v_winner
  FROM public.matricula_disciplina_tentativas tentativa
  WHERE tentativa.id = NEW.tentativa_aprovada_id;

  IF v_winner.componente_id IS NULL
    OR v_winner.componente_id <> NEW.id
    OR NEW.status <> 'APROVADO'
    OR v_winner.status <> 'APROVADA'
    OR v_winner.resultado_destino NOT IN ('APROVADO', 'APROVEITADO')
  THEN
    RAISE EXCEPTION
      'Tentativa vencedora não pertence ao componente ou não está aprovada.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.validate_dependency_component()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_dependency_component
BEFORE INSERT OR UPDATE OF status, tentativa_aprovada_id
ON public.matricula_componentes
FOR EACH ROW
EXECUTE FUNCTION internal_academic.validate_dependency_component();

CREATE OR REPLACE FUNCTION internal_academic.validate_dependency_charge_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Vínculos históricos de cobrança da dependência não podem ser excluídos.'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    matricula.aluno_id,
    tentativa.turma_id,
    recebivel.cliente_id,
    recebivel.turma_id AS recebivel_turma_id,
    recebivel.matricula_id AS recebivel_matricula_id,
    recebivel.tipo_lancamento
  INTO v_expected
  FROM public.matricula_disciplina_tentativas tentativa
  JOIN public.matricula_componentes componente
    ON componente.id = tentativa.componente_id
  JOIN public.matriculas matricula
    ON matricula.id = componente.matricula_id
  JOIN public.contas_receber recebivel
    ON recebivel.id = NEW.conta_receber_id
  WHERE tentativa.id = NEW.tentativa_id;

  IF v_expected.aluno_id IS NULL THEN
    RAISE EXCEPTION 'Tentativa ou recebível da dependência não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF v_expected.cliente_id IS DISTINCT FROM v_expected.aluno_id
    OR v_expected.recebivel_turma_id IS DISTINCT FROM v_expected.turma_id
    OR v_expected.recebivel_matricula_id IS NOT NULL
    OR upper(coalesce(v_expected.tipo_lancamento, '')) <> 'DEPENDENCIA'
  THEN
    RAISE EXCEPTION
      'Recebível não corresponde ao aluno e à oferta exata da dependência.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.validate_dependency_charge_link()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_dependency_charge_link
BEFORE INSERT OR UPDATE OR DELETE
ON public.matricula_dependencia_cobrancas
FOR EACH ROW
EXECUTE FUNCTION internal_academic.validate_dependency_charge_link();

CREATE OR REPLACE FUNCTION internal_academic.protect_linked_dependency_receivable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected record;
BEGIN
  SELECT
    matricula.aluno_id,
    tentativa.turma_id
  INTO v_expected
  FROM public.matricula_dependencia_cobrancas vinculo
  JOIN public.matricula_disciplina_tentativas tentativa
    ON tentativa.id = vinculo.tentativa_id
  JOIN public.matricula_componentes componente
    ON componente.id = tentativa.componente_id
  JOIN public.matriculas matricula
    ON matricula.id = componente.matricula_id
  WHERE vinculo.conta_receber_id = NEW.id;

  IF FOUND
    AND (
      NEW.cliente_id IS DISTINCT FROM v_expected.aluno_id
      OR NEW.turma_id IS DISTINCT FROM v_expected.turma_id
      OR NEW.matricula_id IS NOT NULL
      OR upper(coalesce(NEW.tipo_lancamento, '')) <> 'DEPENDENCIA'
    )
  THEN
    RAISE EXCEPTION
      'Identidade acadêmica do recebível de dependência é imutável.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.protect_linked_dependency_receivable()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_linked_dependency_receivable
BEFORE UPDATE OF cliente_id, turma_id, matricula_id, tipo_lancamento
ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION internal_academic.protect_linked_dependency_receivable();

-- A perda de uma baixa antes do resultado acadêmico volta a tentativa para
-- aguardando pagamento. Depois de um resultado terminal, preserva-se o
-- histórico acadêmico e registra-se a divergência financeira para tratamento.
CREATE OR REPLACE FUNCTION internal_academic.release_dependency_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.matricula_disciplina_tentativas%ROWTYPE;
BEGIN
  IF upper(coalesce(NEW.tipo_lancamento, '')) <> 'DEPENDENCIA' THEN
    RETURN NEW;
  END IF;

  SELECT tentativa.*
  INTO v_attempt
  FROM public.matricula_dependencia_cobrancas vinculo
  JOIN public.matricula_disciplina_tentativas tentativa
    ON tentativa.id = vinculo.tentativa_id
  WHERE vinculo.conta_receber_id = NEW.id
    AND vinculo.principal
  FOR UPDATE OF tentativa;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(NEW.status, '')) = 'PAGO'
    AND (
      TG_OP = 'INSERT'
      OR upper(coalesce(OLD.status, '')) <> 'PAGO'
    )
    AND v_attempt.status = 'AGUARDANDO_PAGAMENTO'
  THEN
    UPDATE public.matricula_disciplina_tentativas
    SET
      status = 'LIBERADA',
      updated_at = now()
    WHERE id = v_attempt.id;

    INSERT INTO public.matricula_dependencia_eventos (
      componente_id,
      tentativa_id,
      conta_receber_id,
      evento,
      actor_id,
      payload
    ) VALUES (
      v_attempt.componente_id,
      v_attempt.id,
      NEW.id,
      'STATUS_ALTERADO',
      auth.uid(),
      jsonb_build_object(
        'statusAnterior', 'AGUARDANDO_PAGAMENTO',
        'statusNovo', 'LIBERADA',
        'origem', 'PAGAMENTO_CONFIRMADO'
      )
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND upper(coalesce(OLD.status, '')) = 'PAGO'
    AND upper(coalesce(NEW.status, '')) <> 'PAGO'
  THEN
    IF v_attempt.status IN ('LIBERADA', 'EM_CURSO') THEN
      UPDATE public.matricula_disciplina_tentativas
      SET
        status = 'AGUARDANDO_PAGAMENTO',
        updated_at = now()
      WHERE id = v_attempt.id;

      UPDATE public.matricula_componentes
      SET
        status = 'DEPENDENCIA_AGENDADA',
        updated_at = now()
      WHERE id = v_attempt.componente_id;
    END IF;

    INSERT INTO public.matricula_dependencia_eventos (
      componente_id,
      tentativa_id,
      conta_receber_id,
      evento,
      actor_id,
      payload
    ) VALUES (
      v_attempt.componente_id,
      v_attempt.id,
      NEW.id,
      'STATUS_ALTERADO',
      auth.uid(),
      jsonb_build_object(
        'statusRecebivelAnterior', OLD.status,
        'statusRecebivelNovo', NEW.status,
        'statusTentativaAnterior', v_attempt.status,
        'statusTentativaNovo', CASE
          WHEN v_attempt.status IN ('LIBERADA', 'EM_CURSO')
            THEN 'AGUARDANDO_PAGAMENTO'
          ELSE v_attempt.status
        END,
        'origem', 'REVERSAO_PAGAMENTO'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.release_dependency_on_payment()
  FROM PUBLIC, anon, authenticated;

-- Preserva a implementação aplicada e adiciona uma fachada que resolve o
-- replay antes de revalidar condições acadêmicas mutáveis. Para operações
-- novas, a oferta de destino é bloqueada antes da implementação antiga
-- bloquear a matrícula, igualando a ordem usada pelo fechamento do diário.
ALTER FUNCTION public.confirmar_dependencia_reoferta_secure(
  uuid,
  uuid,
  uuid,
  date,
  text
)
RENAME TO p2_confirmar_dependencia_reoferta_secure_20260730;

REVOKE ALL ON FUNCTION
  public.p2_confirmar_dependencia_reoferta_secure_20260730(
    uuid,
    uuid,
    uuid,
    date,
    text
  )
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirmar_dependencia_reoferta_secure(
  p_matricula_id uuid,
  p_disciplina_id uuid,
  p_turma_destino_id uuid,
  p_data_vencimento date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_existing record;
BEGIN
  SELECT matricula.*
  INTO v_matricula
  FROM public.matriculas matricula
  WHERE matricula.id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT internal_academic.can_manage_dependency_workspace(
    v_matricula.turma_id
  )
    OR NOT internal_academic.can_manage_dependency_workspace(
      p_turma_destino_id
    )
  THEN
    RAISE EXCEPTION 'Acesso à confirmação da dependência não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    tentativa.id,
    tentativa.componente_id,
    tentativa.disciplina_id,
    tentativa.turma_id,
    tentativa.status,
    tentativa.valor_cobrado_snapshot,
    componente.matricula_id,
    vinculo.conta_receber_id,
    recebivel.status AS recebivel_status,
    recebivel.data_vencimento
  INTO v_existing
  FROM public.matricula_disciplina_tentativas tentativa
  JOIN public.matricula_componentes componente
    ON componente.id = tentativa.componente_id
  LEFT JOIN public.matricula_dependencia_cobrancas vinculo
    ON vinculo.tentativa_id = tentativa.id
   AND vinculo.principal
  LEFT JOIN public.contas_receber recebivel
    ON recebivel.id = vinculo.conta_receber_id
  WHERE tentativa.idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.matricula_id <> p_matricula_id
      OR v_existing.disciplina_id <> p_disciplina_id
      OR v_existing.turma_id <> p_turma_destino_id
      OR v_existing.data_vencimento IS DISTINCT FROM p_data_vencimento
    THEN
      RAISE EXCEPTION
        'Chave de idempotência já usada com outra requisição.'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing.conta_receber_id IS NULL THEN
      RAISE EXCEPTION
        'Operação idempotente existe sem recebível principal vinculado.'
        USING ERRCODE = '23514';
    END IF;

    RETURN jsonb_build_object(
      'replayed', true,
      'componenteId', v_existing.componente_id,
      'tentativaId', v_existing.id,
      'tentativaStatus', v_existing.status,
      'contaReceberId', v_existing.conta_receber_id,
      'contaReceberStatus', v_existing.recebivel_status,
      'valorCobrado', v_existing.valor_cobrado_snapshot,
      'dataVencimento', v_existing.data_vencimento,
      'turmaDestinoId', v_existing.turma_id,
      'disciplinaId', v_existing.disciplina_id,
      'emissaoBancariaSolicitada', false
    );
  END IF;

  -- Ordem global: oferta de destino -> matrícula/componente/tentativa.
  PERFORM 1
  FROM public.turmas turma
  JOIN public.turmas_disciplinas oferta
    ON oferta.turma_id = turma.id
   AND oferta.disciplina_id = p_disciplina_id
  WHERE turma.id = p_turma_destino_id
  FOR UPDATE OF turma, oferta;

  RETURN public.p2_confirmar_dependencia_reoferta_secure_20260730(
    p_matricula_id,
    p_disciplina_id,
    p_turma_destino_id,
    p_data_vencimento,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_dependencia_reoferta_secure(
  uuid,
  uuid,
  uuid,
  date,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_dependencia_reoferta_secure(
  uuid,
  uuid,
  uuid,
  date,
  text
) TO authenticated, service_role;

-- O polo solicitado não pode ser usado para consultar regras financeiras de
-- outro escopo, mesmo quando nenhuma dependência desse polo é retornada.
ALTER FUNCTION public.get_secretaria_dependencias_workspace_secure(uuid, text)
RENAME TO p2_get_secretaria_dependencias_workspace_secure_20260730;

REVOKE ALL ON FUNCTION
  public.p2_get_secretaria_dependencias_workspace_secure_20260730(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_secretaria_dependencias_workspace_secure(
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workspace jsonb;
  v_disciplines jsonb;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND (
      NOT (
        public.gestor_has_tab(
          'secretaria',
          'dependencias-academicas'
        )
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
      )
      OR (
        p_polo_id IS NOT NULL
        AND NOT public.is_gestor_for_polo(p_polo_id)
      )
    )
  THEN
    RAISE EXCEPTION
      'Acesso ao workspace de dependências não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  v_workspace :=
    public.p2_get_secretaria_dependencias_workspace_secure_20260730(
      p_polo_id,
      p_search
    );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', catalog.disciplina_id,
        'nome', catalog.disciplina_nome,
        'carga_horaria', catalog.carga_horaria,
        'cursoId', catalog.curso_id,
        'cursoNome', catalog.curso_nome
      )
      ORDER BY catalog.curso_nome, catalog.disciplina_nome
    ),
    '[]'::jsonb
  )
  INTO v_disciplines
  FROM (
    SELECT DISTINCT
      disciplina.id AS disciplina_id,
      disciplina.nome AS disciplina_nome,
      disciplina.carga_horaria,
      curso.id AS curso_id,
      curso.nome AS curso_nome
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    JOIN public.turmas_disciplinas oferta
      ON oferta.turma_id = turma.id
    JOIN public.disciplinas disciplina
      ON disciplina.id = oferta.disciplina_id
    WHERE p_polo_id IS NOT NULL
      AND turma.polo_id = p_polo_id
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
      AND internal_academic.can_manage_dependency_workspace(turma.id)
  ) catalog;

  RETURN v_workspace || jsonb_build_object(
    'disciplinas_configuraveis',
    v_disciplines
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_secretaria_dependencias_workspace_secure(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_secretaria_dependencias_workspace_secure(uuid, text)
  TO authenticated, service_role;

-- Retry de configuração retorna a versão gravada mesmo se a oferta acadêmica
-- usada na primeira chamada tiver sido encerrada posteriormente.
ALTER FUNCTION public.configurar_politica_dependencia_disciplina_secure(
  uuid,
  uuid,
  numeric,
  text
)
RENAME TO p2_configurar_politica_dependencia_disciplina_secure_20260730;

REVOKE ALL ON FUNCTION
  public.p2_configurar_politica_dependencia_disciplina_secure_20260730(
    uuid,
    uuid,
    numeric,
    text
  )
  FROM PUBLIC, anon, authenticated;

-- O núcleo renomeado preserva uma única implementação do versionamento, mas
-- passa a reconhecer também a permissão granular da nova aba.
CREATE OR REPLACE FUNCTION
  public.p2_configurar_politica_dependencia_disciplina_secure_20260730(
    p_polo_id uuid,
    p_disciplina_id uuid,
    p_multiplicador_parcela numeric,
    p_idempotency_key text
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_policy public.politicas_cobranca_dependencia%ROWTYPE;
  v_version integer;
  v_multiplier numeric(8,4);
BEGIN
  IF p_polo_id IS NULL
    OR p_disciplina_id IS NULL
    OR p_multiplicador_parcela IS NULL
    OR nullif(btrim(coalesce(p_idempotency_key, '')), '') IS NULL
  THEN
    RAISE EXCEPTION
      'Polo, disciplina, multiplicador e idempotência são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_multiplicador_parcela < 0.01
    OR p_multiplicador_parcela > 10
  THEN
    RAISE EXCEPTION
      'O multiplicador deve ficar entre 0,01 e 10 parcelas.'
      USING ERRCODE = '22023';
  END IF;

  IF length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION
      'A chave de idempotência deve ter entre 8 e 200 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  v_multiplier := round(p_multiplicador_parcela, 4);

  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT (
      public.is_gestor_for_polo(p_polo_id)
      AND (
        public.gestor_has_tab(
          'secretaria',
          'dependencias-academicas'
        )
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
        OR public.gestor_has_financeiro_tab('receber')
      )
    )
  THEN
    RAISE EXCEPTION
      'Acesso à configuração financeira da dependência não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    JOIN public.turmas_disciplinas oferta
      ON oferta.turma_id = turma.id
     AND oferta.disciplina_id = p_disciplina_id
    WHERE turma.polo_id = p_polo_id
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
  ) THEN
    RAISE EXCEPTION
      'A disciplina não pertence a uma oferta técnica deste polo.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dependencia-politica:'
        || p_polo_id::text
        || ':' || p_disciplina_id::text,
      0
    )
  );

  SELECT policy.*
  INTO v_policy
  FROM public.politicas_cobranca_dependencia policy
  WHERE policy.idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_policy.polo_id <> p_polo_id
      OR v_policy.disciplina_id <> p_disciplina_id
      OR v_policy.multiplicador_parcela <> v_multiplier
    THEN
      RAISE EXCEPTION
        'Chave de idempotência já usada em outra configuração.'
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'replayed', true,
      'id', v_policy.id,
      'poloId', v_policy.polo_id,
      'disciplinaId', v_policy.disciplina_id,
      'multiplicador', v_policy.multiplicador_parcela,
      'percentual', v_policy.multiplicador_parcela * 100,
      'versao', v_policy.versao
    );
  END IF;

  SELECT coalesce(max(policy.versao), 0) + 1
  INTO v_version
  FROM public.politicas_cobranca_dependencia policy
  WHERE policy.codigo = 'DEPENDENCIA_DISCIPLINA'
    AND policy.polo_id = p_polo_id
    AND policy.disciplina_id = p_disciplina_id;

  UPDATE public.politicas_cobranca_dependencia policy
  SET
    status = 'INATIVA',
    vigencia_fim = greatest(
      policy.vigencia_inicio,
      pg_catalog.timezone('America/Maceio', now())::date
    ),
    updated_at = now()
  WHERE policy.status = 'ATIVA'
    AND policy.polo_id = p_polo_id
    AND policy.disciplina_id = p_disciplina_id;

  INSERT INTO public.politicas_cobranca_dependencia (
    codigo,
    versao,
    polo_id,
    disciplina_id,
    carga_horaria_minima,
    carga_horaria_maxima,
    multiplicador_parcela,
    status,
    vigencia_inicio,
    created_by,
    idempotency_key
  ) VALUES (
    'DEPENDENCIA_DISCIPLINA',
    v_version,
    p_polo_id,
    p_disciplina_id,
    0,
    NULL,
    v_multiplier,
    'ATIVA',
    pg_catalog.timezone('America/Maceio', now())::date,
    auth.uid(),
    btrim(p_idempotency_key)
  )
  RETURNING * INTO v_policy;

  RETURN jsonb_build_object(
    'replayed', false,
    'id', v_policy.id,
    'poloId', v_policy.polo_id,
    'disciplinaId', v_policy.disciplina_id,
    'multiplicador', v_policy.multiplicador_parcela,
    'percentual', v_policy.multiplicador_parcela * 100,
    'versao', v_policy.versao
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.p2_configurar_politica_dependencia_disciplina_secure_20260730(
    uuid,
    uuid,
    numeric,
    text
  )
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.configurar_politica_dependencia_disciplina_secure(
  p_polo_id uuid,
  p_disciplina_id uuid,
  p_multiplicador_parcela numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_policy public.politicas_cobranca_dependencia%ROWTYPE;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT (
      public.is_gestor_for_polo(p_polo_id)
      AND (
        public.gestor_has_tab(
          'secretaria',
          'dependencias-academicas'
        )
        OR
        public.gestor_has_tab('secretaria', 'solicitacoes')
        OR public.gestor_has_financeiro_tab('receber')
      )
    )
  THEN
    RAISE EXCEPTION
      'Acesso à configuração financeira da dependência não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT politica.*
  INTO v_policy
  FROM public.politicas_cobranca_dependencia politica
  WHERE politica.idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_policy.polo_id IS DISTINCT FROM p_polo_id
      OR v_policy.disciplina_id IS DISTINCT FROM p_disciplina_id
      OR v_policy.multiplicador_parcela
        IS DISTINCT FROM round(p_multiplicador_parcela, 4)
    THEN
      RAISE EXCEPTION
        'Chave de idempotência já usada em outra configuração.'
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'replayed', true,
      'id', v_policy.id,
      'poloId', v_policy.polo_id,
      'disciplinaId', v_policy.disciplina_id,
      'multiplicador', v_policy.multiplicador_parcela,
      'percentual', v_policy.multiplicador_parcela * 100,
      'versao', v_policy.versao
    );
  END IF;

  RETURN public.p2_configurar_politica_dependencia_disciplina_secure_20260730(
    p_polo_id,
    p_disciplina_id,
    p_multiplicador_parcela,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.configurar_politica_dependencia_disciplina_secure(
    uuid,
    uuid,
    numeric,
    text
  )
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.configurar_politica_dependencia_disciplina_secure(
    uuid,
    uuid,
    numeric,
    text
  )
  TO authenticated, service_role;

COMMENT ON CONSTRAINT matricula_disciplina_tentativas_terminal_state_chk
ON public.matricula_disciplina_tentativas IS
  'Impede resultados finais ausentes, parciais ou incompatíveis com o status da tentativa.';

NOTIFY pgrst, 'reload schema';

COMMIT;
