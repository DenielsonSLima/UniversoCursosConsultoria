BEGIN;

-- Versão local alinhada ao registro criado pelo MCP Supabase.

-- Integra a reoferta de dependência ao diário sem criar uma segunda matrícula
-- na turma de destino. O vínculo operacional continua sendo a tentativa exata
-- (turma_id, disciplina_id) e o resultado canônico pertence à matrícula original.

ALTER TABLE public.matriculas
  DROP CONSTRAINT IF EXISTS matriculas_status_check;

ALTER TABLE public.matriculas
  ADD CONSTRAINT matriculas_status_check
  CHECK (status IN (
    'PENDENTE',
    'ATIVO',
    'TRANCADO',
    'CANCELADO',
    'CONCLUIDO',
    'REPROVADO',
    'EM_DEPENDENCIA',
    'DESISTENTE',
    'TRANSFERIDO'
  ));

ALTER TABLE public.matricula_componentes
  ADD COLUMN tentativa_aprovada_id uuid;

ALTER TABLE public.matricula_componentes
  ADD CONSTRAINT matricula_componentes_tentativa_aprovada_fkey
  FOREIGN KEY (tentativa_aprovada_id)
  REFERENCES public.matricula_disciplina_tentativas(id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX matricula_componentes_tentativa_aprovada_uidx
  ON public.matricula_componentes (tentativa_aprovada_id)
  WHERE tentativa_aprovada_id IS NOT NULL;

ALTER TABLE public.matricula_disciplina_tentativas
  ADD COLUMN resultado_destino text,
  ADD COLUMN frequencia_destino numeric(7,2),
  ADD COLUMN media_parcial_destino numeric(7,2),
  ADD COLUMN nota_rec_destino numeric(7,2),
  ADD COLUMN media_final_destino numeric(7,2),
  ADD COLUMN finalizada_em timestamptz;

ALTER TABLE public.matricula_disciplina_tentativas
  ADD CONSTRAINT matricula_disciplina_tentativas_resultado_destino_chk
  CHECK (
    resultado_destino IS NULL
    OR resultado_destino IN (
      'APROVADO',
      'APROVEITADO',
      'REPROVADO_FREQUENCIA',
      'REPROVADO',
      'SEM_LANCAMENTO',
      'FREQUENCIA_PENDENTE',
      'EM_RECUPERACAO'
    )
  );

ALTER TABLE public.matricula_dependencia_eventos
  DROP CONSTRAINT IF EXISTS matricula_dependencia_eventos_evento_check;

ALTER TABLE public.matricula_dependencia_eventos
  ADD CONSTRAINT matricula_dependencia_eventos_evento_check
  CHECK (evento IN (
    'PENDENCIA_REGISTRADA',
    'TENTATIVA_CONFIRMADA',
    'COBRANCA_CRIADA',
    'COBRANCA_SUBSTITUIDA',
    'STATUS_ALTERADO',
    'RESULTADO_REGISTRADO',
    'RESULTADO_REABERTO',
    'MATRICULA_CONCLUIDA',
    'CANCELADA'
  ));

CREATE OR REPLACE FUNCTION internal_academic.is_dependency_student_in_diary(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_matricula_id uuid,
  p_aluno_id uuid,
  p_write boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matricula_disciplina_tentativas tentativa
    JOIN public.matricula_componentes componente
      ON componente.id = tentativa.componente_id
    JOIN public.matriculas matricula
      ON matricula.id = componente.matricula_id
    WHERE tentativa.turma_id = p_turma_id
      AND tentativa.disciplina_id = p_disciplina_id
      AND matricula.aluno_id = p_aluno_id
      AND (
        p_matricula_id IS NULL
        OR matricula.id = p_matricula_id
      )
      AND (
        (
          p_write
          AND tentativa.status IN ('LIBERADA', 'EM_CURSO')
        )
        OR (
          NOT p_write
          AND tentativa.status IN (
            'LIBERADA',
            'EM_CURSO',
            'APROVADA',
            'REPROVADA'
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION
  internal_academic.is_dependency_student_in_diary(
    uuid,
    uuid,
    uuid,
    uuid,
    boolean
  )
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal_academic.p2_diario_matriculas_elegiveis_20260725(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS TABLE (
  matricula_id uuid,
  aluno_id uuid,
  data_saida date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH inicio_disciplina AS (
    SELECT min(aula.data_aula) AS primeira_aula
    FROM public.aulas_turma aula
    WHERE aula.turma_id = p_turma_id
      AND aula.disciplina_id = p_disciplina_id
      AND aula.data_aula IS NOT NULL
  ),
  regulares AS (
    SELECT
      matricula.id AS matricula_id,
      matricula.aluno_id,
      saida.data_movimentacao AS data_saida,
      2 AS prioridade
    FROM public.matriculas matricula
    CROSS JOIN inicio_disciplina inicio
    LEFT JOIN LATERAL (
      SELECT movimento.data_movimentacao
      FROM public.matricula_movimentacoes movimento
      WHERE movimento.matricula_id = matricula.id
        AND upper(coalesce(movimento.status_novo, ''))
          = upper(coalesce(matricula.status, ''))
        AND upper(coalesce(movimento.status_novo, '')) IN (
          'CANCELADO',
          'DESISTENTE',
          'TRANSFERIDO'
        )
      ORDER BY
        movimento.created_at DESC,
        movimento.data_movimentacao DESC,
        movimento.id DESC
      LIMIT 1
    ) saida ON true
    WHERE matricula.turma_id = p_turma_id
      AND (
        upper(coalesce(matricula.status, '')) NOT IN (
          'CANCELADO',
          'DESISTENTE',
          'TRANSFERIDO'
        )
        OR (
          saida.data_movimentacao IS NOT NULL
          AND inicio.primeira_aula IS NOT NULL
          AND saida.data_movimentacao >= inicio.primeira_aula
        )
        OR EXISTS (
          SELECT 1
          FROM public.diario_frequencia frequencia
          WHERE frequencia.turma_id = p_turma_id
            AND frequencia.disciplina_id = p_disciplina_id
            AND frequencia.aluno_id = matricula.aluno_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.diario_notas nota
          WHERE nota.turma_id = p_turma_id
            AND nota.disciplina_id = p_disciplina_id
            AND nota.aluno_id = matricula.aluno_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.matricula_aproveitamentos aproveitamento
          WHERE aproveitamento.matricula_id = matricula.id
            AND aproveitamento.disciplina_id = p_disciplina_id
        )
      )
  ),
  dependencias AS (
    SELECT
      matricula.id AS matricula_id,
      matricula.aluno_id,
      NULL::date AS data_saida,
      1 AS prioridade
    FROM public.matricula_disciplina_tentativas tentativa
    JOIN public.matricula_componentes componente
      ON componente.id = tentativa.componente_id
    JOIN public.matriculas matricula
      ON matricula.id = componente.matricula_id
    WHERE tentativa.turma_id = p_turma_id
      AND tentativa.disciplina_id = p_disciplina_id
      AND tentativa.status IN (
        'LIBERADA',
        'EM_CURSO',
        'APROVADA',
        'REPROVADA'
      )
  ),
  candidatos AS (
    SELECT * FROM regulares
    UNION ALL
    SELECT * FROM dependencias
  )
  SELECT DISTINCT ON (candidato.aluno_id)
    candidato.matricula_id,
    candidato.aluno_id,
    candidato.data_saida
  FROM candidatos candidato
  ORDER BY
    candidato.aluno_id,
    candidato.prioridade,
    candidato.matricula_id;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.p2_diario_matriculas_elegiveis_20260725(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal_academic.is_student_in_diary_roster(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_matricula_id uuid,
  p_aluno_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    internal_academic.is_dependency_student_in_diary(
      p_turma_id,
      p_disciplina_id,
      p_matricula_id,
      p_aluno_id,
      false
    )
    OR CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.diario_matriculas_roster roster
        WHERE roster.turma_id = p_turma_id
          AND roster.disciplina_id = p_disciplina_id
      ) THEN EXISTS (
        SELECT 1
        FROM public.diario_matriculas_roster roster
        WHERE roster.turma_id = p_turma_id
          AND roster.disciplina_id = p_disciplina_id
          AND (
            p_matricula_id IS NULL
            OR roster.matricula_id = p_matricula_id
          )
          AND roster.aluno_id = p_aluno_id
      )
      ELSE
        internal_academic.is_student_released_for_diary(
          p_turma_id,
          p_aluno_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.diario_frequencia frequencia
          WHERE frequencia.turma_id = p_turma_id
            AND frequencia.disciplina_id = p_disciplina_id
            AND frequencia.aluno_id = p_aluno_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.diario_notas nota
          WHERE nota.turma_id = p_turma_id
            AND nota.disciplina_id = p_disciplina_id
            AND nota.aluno_id = p_aluno_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.matricula_aproveitamentos aproveitamento
          WHERE aproveitamento.matricula_id = p_matricula_id
            AND aproveitamento.disciplina_id = p_disciplina_id
        )
    END;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.is_student_in_diary_roster(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  internal_academic.is_student_in_diary_roster(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION internal_academic.can_write_student_in_diary(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_matricula_id uuid,
  p_aluno_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    internal_academic.is_dependency_student_in_diary(
      p_turma_id,
      p_disciplina_id,
      p_matricula_id,
      p_aluno_id,
      true
    )
    OR (
      internal_academic.is_student_released_for_diary(
        p_turma_id,
        p_aluno_id
      )
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.diario_matriculas_roster roster
          WHERE roster.turma_id = p_turma_id
            AND roster.disciplina_id = p_disciplina_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.diario_matriculas_roster roster
          WHERE roster.turma_id = p_turma_id
            AND roster.disciplina_id = p_disciplina_id
            AND (
              p_matricula_id IS NULL
              OR roster.matricula_id = p_matricula_id
            )
            AND roster.aluno_id = p_aluno_id
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION
  internal_academic.can_write_student_in_diary(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  internal_academic.can_write_student_in_diary(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION internal_academic.release_dependency_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt_id uuid;
  v_component_id uuid;
BEGIN
  IF upper(coalesce(NEW.status, '')) <> 'PAGO'
    OR (
      TG_OP = 'UPDATE'
      AND upper(coalesce(OLD.status, '')) = 'PAGO'
    )
    OR upper(coalesce(NEW.tipo_lancamento, '')) <> 'DEPENDENCIA'
  THEN
    RETURN NEW;
  END IF;

  SELECT
    cobranca.tentativa_id,
    tentativa.componente_id
  INTO
    v_attempt_id,
    v_component_id
  FROM public.matricula_dependencia_cobrancas cobranca
  JOIN public.matricula_disciplina_tentativas tentativa
    ON tentativa.id = cobranca.tentativa_id
  WHERE cobranca.conta_receber_id = NEW.id
    AND cobranca.principal
  FOR UPDATE OF tentativa;

  IF v_attempt_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.matricula_disciplina_tentativas
  SET
    status = 'LIBERADA',
    updated_at = now()
  WHERE id = v_attempt_id
    AND status = 'AGUARDANDO_PAGAMENTO';

  IF FOUND THEN
    INSERT INTO public.matricula_dependencia_eventos (
      componente_id,
      tentativa_id,
      conta_receber_id,
      evento,
      actor_id,
      payload
    ) VALUES (
      v_component_id,
      v_attempt_id,
      NEW.id,
      'STATUS_ALTERADO',
      auth.uid(),
      jsonb_build_object(
        'statusAnterior',
        'AGUARDANDO_PAGAMENTO',
        'statusNovo',
        'LIBERADA',
        'origem',
        'PAGAMENTO_CONFIRMADO'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.release_dependency_on_payment()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_release_dependency_on_payment
AFTER INSERT OR UPDATE OF status
ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION internal_academic.release_dependency_on_payment();

CREATE OR REPLACE FUNCTION internal_academic.start_dependency_on_diary_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt record;
BEGIN
  FOR v_attempt IN
    SELECT
      tentativa.id,
      tentativa.componente_id
    FROM public.matricula_disciplina_tentativas tentativa
    JOIN public.matricula_componentes componente
      ON componente.id = tentativa.componente_id
    JOIN public.matriculas matricula
      ON matricula.id = componente.matricula_id
    WHERE tentativa.turma_id = NEW.turma_id
      AND tentativa.disciplina_id = NEW.disciplina_id
      AND matricula.aluno_id = NEW.aluno_id
      AND tentativa.status = 'LIBERADA'
    FOR UPDATE OF tentativa
  LOOP
    UPDATE public.matricula_disciplina_tentativas
    SET
      status = 'EM_CURSO',
      updated_at = now()
    WHERE id = v_attempt.id;

    UPDATE public.matricula_componentes
    SET
      status = 'EM_CURSO',
      updated_at = now()
    WHERE id = v_attempt.componente_id;

    INSERT INTO public.matricula_dependencia_eventos (
      componente_id,
      tentativa_id,
      evento,
      actor_id,
      payload
    ) VALUES (
      v_attempt.componente_id,
      v_attempt.id,
      'STATUS_ALTERADO',
      auth.uid(),
      jsonb_build_object(
        'statusAnterior',
        'LIBERADA',
        'statusNovo',
        'EM_CURSO',
        'origem',
        TG_TABLE_NAME
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.start_dependency_on_diary_write()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_start_dependency_on_frequency
AFTER INSERT OR UPDATE
ON public.diario_frequencia
FOR EACH ROW
EXECUTE FUNCTION internal_academic.start_dependency_on_diary_write();

CREATE TRIGGER trg_start_dependency_on_grade
AFTER INSERT OR UPDATE
ON public.diario_notas
FOR EACH ROW
EXECUTE FUNCTION internal_academic.start_dependency_on_diary_write();

CREATE OR REPLACE FUNCTION internal_academic.mark_legacy_enrollment_in_dependency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_component public.matricula_componentes%ROWTYPE;
  v_enrollment public.matriculas%ROWTYPE;
BEGIN
  SELECT componente.*
  INTO v_component
  FROM public.matricula_componentes componente
  WHERE componente.id = NEW.componente_id;

  SELECT matricula.*
  INTO v_enrollment
  FROM public.matriculas matricula
  WHERE matricula.id = v_component.matricula_id
  FOR UPDATE;

  -- Antes deste modelo a finalização da turma gravava REPROVADO. Ao agendar
  -- uma reoferta válida, converte-se somente esse legado para o estado
  -- explícito EM_DEPENDENCIA, com autorização e evento auditável.
  IF v_enrollment.status = 'REPROVADO'
    AND internal_academic.final_enrollment_status(
      v_enrollment.turma_id,
      v_enrollment.aluno_id
    ) = 'EM_DEPENDENCIA'
  THEN
    PERFORM internal_academic.authorize_transition(
      'MATRICULA_STATUS',
      v_enrollment.id,
      'EM_DEPENDENCIA'
    );

    UPDATE public.matriculas
    SET
      status = 'EM_DEPENDENCIA',
      updated_at = now()
    WHERE id = v_enrollment.id
      AND status = 'REPROVADO';

    INSERT INTO public.matricula_dependencia_eventos (
      componente_id,
      tentativa_id,
      evento,
      actor_id,
      payload
    ) VALUES (
      v_component.id,
      NEW.id,
      'STATUS_ALTERADO',
      auth.uid(),
      jsonb_build_object(
        'entidade',
        'MATRICULA',
        'matriculaId',
        v_enrollment.id,
        'statusAnterior',
        'REPROVADO',
        'statusNovo',
        'EM_DEPENDENCIA',
        'origem',
        'NORMALIZACAO_LEGADA_NA_REOFERTA'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.mark_legacy_enrollment_in_dependency()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_mark_legacy_enrollment_in_dependency
AFTER INSERT
ON public.matricula_disciplina_tentativas
FOR EACH ROW
EXECUTE FUNCTION internal_academic.mark_legacy_enrollment_in_dependency();

ALTER FUNCTION internal_academic.get_enrollment_results(uuid)
  RENAME TO p1_get_enrollment_results_20260730;

CREATE OR REPLACE FUNCTION internal_academic.get_enrollment_results(
  p_matricula_id uuid
)
RETURNS TABLE (
  disciplina_id uuid,
  media_final numeric,
  frequencia_percent numeric,
  resultado_final text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH origem AS (
    SELECT resultado.*
    FROM internal_academic.p1_get_enrollment_results_20260730(
      p_matricula_id
    ) resultado
  ),
  dependencia_aprovada AS (
    SELECT
      componente.disciplina_id,
      tentativa.media_final_destino,
      tentativa.frequencia_destino
    FROM public.matricula_componentes componente
    JOIN public.matricula_disciplina_tentativas tentativa
      ON tentativa.id = componente.tentativa_aprovada_id
    WHERE componente.matricula_id = p_matricula_id
      AND componente.status = 'APROVADO'
      AND tentativa.status = 'APROVADA'
      AND tentativa.resultado_destino IN ('APROVADO', 'APROVEITADO')
  )
  SELECT
    origem.disciplina_id,
    coalesce(dependencia.media_final_destino, origem.media_final),
    coalesce(
      dependencia.frequencia_destino,
      origem.frequencia_percent
    ),
    CASE
      WHEN dependencia.disciplina_id IS NOT NULL THEN 'APROVADO'
      ELSE origem.resultado_final
    END
  FROM origem
  LEFT JOIN dependencia_aprovada dependencia
    ON dependencia.disciplina_id = origem.disciplina_id;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.p1_get_enrollment_results_20260730(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION internal_academic.get_enrollment_results(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal_academic.final_enrollment_status(
  p_turma_id uuid,
  p_aluno_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH matricula AS (
    SELECT enrolment.id
    FROM public.matriculas enrolment
    WHERE enrolment.turma_id = p_turma_id
      AND enrolment.aluno_id = p_aluno_id
    LIMIT 1
  ),
  regras AS (
    SELECT turma.frequencia_minima_percent, turma.media_minima
    FROM public.turmas turma
    WHERE turma.id = p_turma_id
  ),
  resultados AS (
    SELECT resultado.*
    FROM matricula
    CROSS JOIN LATERAL internal_academic.get_enrollment_results(
      matricula.id
    ) resultado
  ),
  estagios AS (
    SELECT estagio.nota_final, estagio.frequencia_estagio
    FROM public.turmas_disciplinas oferta
    JOIN public.disciplinas disciplina
      ON disciplina.id = oferta.disciplina_id
    LEFT JOIN public.matriculas_estagios estagio
      ON estagio.turma_id = oferta.turma_id
     AND estagio.disciplina_id = oferta.disciplina_id
     AND estagio.aluno_id = p_aluno_id
    WHERE oferta.turma_id = p_turma_id
      AND coalesce(disciplina.carga_horaria_estagio, 0) > 0
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM resultados) > 0
      AND coalesce((
        SELECT bool_and(
          resultado_final IN ('APROVADO', 'APROVEITADO')
        )
        FROM resultados
      ), false)
      AND NOT EXISTS (
        SELECT 1
        FROM estagios estagio
        CROSS JOIN regras regra
        WHERE estagio.nota_final IS NULL
          OR estagio.frequencia_estagio IS NULL
          OR estagio.nota_final < regra.media_minima
          OR estagio.frequencia_estagio
            < regra.frequencia_minima_percent
      )
    THEN 'CONCLUIDO'
    WHEN EXISTS (
      SELECT 1
      FROM resultados
      WHERE resultado_final IN (
        'REPROVADO',
        'REPROVADO_FREQUENCIA'
      )
    )
    THEN 'EM_DEPENDENCIA'
    ELSE 'REPROVADO'
  END;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.final_enrollment_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_technical_enrollment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_tecnico boolean := false;
  v_old_tecnico boolean := false;
  v_service boolean :=
    coalesce((SELECT auth.role()), '') = 'service_role';
  v_activation boolean := TG_OP = 'INSERT';
  v_authorized boolean;
BEGIN
  SELECT turma.status, curso.modalidade = 'TECNICO'
  INTO v_status, v_tecnico
  FROM public.turmas turma
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE turma.id = NEW.turma_id;

  IF TG_OP = 'UPDATE' THEN
    SELECT curso.modalidade = 'TECNICO'
    INTO v_old_tecnico
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE turma.id = OLD.turma_id;

    IF (coalesce(v_tecnico, false) OR coalesce(v_old_tecnico, false))
      AND NEW.turma_id IS DISTINCT FROM OLD.turma_id
    THEN
      RAISE EXCEPTION
        'Matrícula técnica deve mudar de turma somente pela transferência acadêmica.';
    END IF;

    IF (coalesce(v_tecnico, false) OR coalesce(v_old_tecnico, false))
      AND NEW.aluno_id IS DISTINCT FROM OLD.aluno_id
    THEN
      RAISE EXCEPTION 'O aluno de uma matrícula técnica é imutável.';
    END IF;

    v_activation :=
      NEW.status = 'ATIVO'
      AND OLD.status IS DISTINCT FROM 'ATIVO';
  END IF;

  IF NOT coalesce(v_tecnico, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
    AND NEW.status NOT IN ('PENDENTE', 'ATIVO')
  THEN
    RAISE EXCEPTION
      'Matrícula técnica nova deve iniciar pendente ou ativa.';
  END IF;

  IF TG_OP = 'UPDATE'
    AND v_status = 'FINALIZADA'
    AND (to_jsonb(NEW) - 'status' - 'updated_at')
      IS DISTINCT FROM
      (to_jsonb(OLD) - 'status' - 'updated_at')
  THEN
    RAISE EXCEPTION
      'Dados de matrícula técnica finalizada são imutáveis.';
  END IF;

  IF v_activation THEN
    IF v_status NOT IN (
      'PLANEJADA',
      'INSCRICOES_ABERTAS',
      'EM_ANDAMENTO'
    ) THEN
      RAISE EXCEPTION
        'Turma técnica finalizada não aceita matrícula ou reativação.';
    END IF;

    IF NOT v_service
      AND NOT (SELECT public.can_write_turma(NEW.turma_id))
    THEN
      RAISE EXCEPTION
        'Sem permissão para matricular nesta turma técnica.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT v_service
    AND (
      TG_OP = 'INSERT'
      OR (
        TG_OP = 'UPDATE'
        AND NEW.status IS DISTINCT FROM OLD.status
      )
    )
  THEN
    DELETE FROM internal_academic.transition_authorizations ta
    WHERE ta.transaction_id = pg_current_xact_id()::text
      AND ta.backend_pid = pg_backend_pid()
      AND ta.entity = CASE
        WHEN TG_OP = 'INSERT' THEN 'MATRICULA_INSERT'
        ELSE 'MATRICULA_STATUS'
      END
      AND ta.record_id = CASE
        WHEN TG_OP = 'INSERT' THEN NEW.turma_id
        ELSE NEW.id
      END
      AND ta.new_status = NEW.status
    RETURNING true INTO v_authorized;

    IF NOT coalesce(v_authorized, false) THEN
      RAISE EXCEPTION
        'Use a ação acadêmica oficial para alterar matrícula técnica.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    IF v_status = 'FINALIZADA'
      AND NOT (
        (
          OLD.status = 'ATIVO'
          AND NEW.status IN (
            'CONCLUIDO',
            'REPROVADO',
            'EM_DEPENDENCIA'
          )
        )
        OR (
          OLD.status = 'EM_DEPENDENCIA'
          AND NEW.status = 'CONCLUIDO'
        )
        OR (
          OLD.status = 'REPROVADO'
          AND NEW.status = 'EM_DEPENDENCIA'
        )
      )
    THEN
      RAISE EXCEPTION
        'Matrícula de turma técnica finalizada é somente leitura.';
    END IF;

    IF NEW.status IN (
      'CONCLUIDO',
      'REPROVADO',
      'EM_DEPENDENCIA'
    )
      AND v_status <> 'FINALIZADA'
    THEN
      RAISE EXCEPTION
        'Conclusão, reprovação ou dependência exige a finalização acadêmica oficial.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_technical_enrollment_lifecycle()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal_academic.reopen_dependency_attempts_for_diary(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.matricula_disciplina_tentativas tentativa
    JOIN public.matricula_componentes componente
      ON componente.id = tentativa.componente_id
    JOIN public.matriculas matricula
      ON matricula.id = componente.matricula_id
    LEFT JOIN public.certificados_academicos certificado
      ON certificado.matricula_id = matricula.id
    WHERE tentativa.turma_id = p_turma_id
      AND tentativa.disciplina_id = p_disciplina_id
      AND tentativa.status = 'APROVADA'
      AND (
        matricula.status = 'CONCLUIDO'
        OR certificado.id IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'Este diário concluiu uma dependência com certificado vinculado e não pode ser reaberto sem procedimento de retificação.'
      USING ERRCODE = '55000';
  END IF;

  FOR v_attempt IN
    SELECT
      tentativa.*,
      componente.matricula_id
    FROM public.matricula_disciplina_tentativas tentativa
    JOIN public.matricula_componentes componente
      ON componente.id = tentativa.componente_id
    WHERE tentativa.turma_id = p_turma_id
      AND tentativa.disciplina_id = p_disciplina_id
      AND tentativa.status IN ('APROVADA', 'REPROVADA')
    FOR UPDATE OF tentativa, componente
  LOOP
    INSERT INTO public.matricula_dependencia_eventos (
      componente_id,
      tentativa_id,
      evento,
      actor_id,
      payload
    ) VALUES (
      v_attempt.componente_id,
      v_attempt.id,
      'RESULTADO_REABERTO',
      auth.uid(),
      jsonb_build_object(
        'resultadoDestino',
        v_attempt.resultado_destino,
        'frequenciaDestino',
        v_attempt.frequencia_destino,
        'mediaParcialDestino',
        v_attempt.media_parcial_destino,
        'notaRecDestino',
        v_attempt.nota_rec_destino,
        'mediaFinalDestino',
        v_attempt.media_final_destino,
        'finalizadaEm',
        v_attempt.finalizada_em
      )
    );

    UPDATE public.matricula_disciplina_tentativas
    SET
      status = 'EM_CURSO',
      resultado_destino = NULL,
      frequencia_destino = NULL,
      media_parcial_destino = NULL,
      nota_rec_destino = NULL,
      media_final_destino = NULL,
      finalizada_em = NULL,
      updated_at = now()
    WHERE id = v_attempt.id;

    UPDATE public.matricula_componentes
    SET
      status = 'EM_CURSO',
      tentativa_aprovada_id = NULL,
      updated_at = now()
    WHERE id = v_attempt.componente_id
      AND (
        tentativa_aprovada_id = v_attempt.id
        OR tentativa_aprovada_id IS NULL
      );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.reopen_dependency_attempts_for_diary(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal_academic.finalize_dependency_attempts_for_diary(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt record;
  v_result record;
  v_status text;
  v_enrollment_status text;
  v_responsavel uuid;
BEGIN
  FOR v_attempt IN
    SELECT
      tentativa.id,
      tentativa.componente_id,
      tentativa.status,
      componente.matricula_id,
      matricula.aluno_id,
      matricula.turma_id AS turma_origem_id,
      matricula.status AS matricula_status
    FROM public.matricula_disciplina_tentativas tentativa
    JOIN public.matricula_componentes componente
      ON componente.id = tentativa.componente_id
    JOIN public.matriculas matricula
      ON matricula.id = componente.matricula_id
    WHERE tentativa.turma_id = p_turma_id
      AND tentativa.disciplina_id = p_disciplina_id
      AND tentativa.status IN ('LIBERADA', 'EM_CURSO')
    FOR UPDATE OF tentativa, componente, matricula
  LOOP
    SELECT resultado.*
    INTO v_result
    FROM internal_academic.p1_get_diario_resultados_20260719(
      p_turma_id,
      p_disciplina_id
    ) resultado
    WHERE resultado.aluno_id = v_attempt.aluno_id
    LIMIT 1;

    IF v_result.aluno_id IS NULL THEN
      RAISE EXCEPTION
        'Não foi possível apurar o resultado da tentativa de dependência %.',
        v_attempt.id
        USING ERRCODE = '23514';
    END IF;

    IF v_result.resultado_final NOT IN (
      'APROVADO',
      'APROVEITADO',
      'REPROVADO',
      'REPROVADO_FREQUENCIA'
    ) THEN
      RAISE EXCEPTION
        'A tentativa de dependência % ainda possui resultado não terminal (%). Regularize notas, frequência ou recuperação antes do fechamento.',
        v_attempt.id,
        coalesce(v_result.resultado_final, 'SEM_RESULTADO')
        USING ERRCODE = '23514';
    END IF;

    v_status := CASE
      WHEN v_result.resultado_final IN ('APROVADO', 'APROVEITADO')
        THEN 'APROVADA'
      ELSE 'REPROVADA'
    END;

    UPDATE public.matricula_disciplina_tentativas
    SET
      status = v_status,
      resultado_destino = v_result.resultado_final,
      frequencia_destino = v_result.frequencia_percent,
      media_parcial_destino = v_result.media_parcial,
      nota_rec_destino = v_result.nota_rec,
      media_final_destino = v_result.media_final,
      finalizada_em = now(),
      updated_at = now()
    WHERE id = v_attempt.id;

    IF v_status = 'APROVADA' THEN
      UPDATE public.matricula_componentes
      SET
        status = 'APROVADO',
        tentativa_aprovada_id = v_attempt.id,
        updated_at = now()
      WHERE id = v_attempt.componente_id;
    ELSE
      UPDATE public.matricula_componentes
      SET
        status = 'PENDENTE_DEPENDENCIA',
        tentativa_aprovada_id = NULL,
        updated_at = now()
      WHERE id = v_attempt.componente_id;
    END IF;

    INSERT INTO public.matricula_dependencia_eventos (
      componente_id,
      tentativa_id,
      evento,
      actor_id,
      payload
    ) VALUES (
      v_attempt.componente_id,
      v_attempt.id,
      'RESULTADO_REGISTRADO',
      auth.uid(),
      jsonb_build_object(
        'statusTentativa',
        v_status,
        'resultadoDestino',
        v_result.resultado_final,
        'frequenciaDestino',
        v_result.frequencia_percent,
        'mediaParcialDestino',
        v_result.media_parcial,
        'notaRecDestino',
        v_result.nota_rec,
        'mediaFinalDestino',
        v_result.media_final,
        'turmaDestinoId',
        p_turma_id,
        'disciplinaId',
        p_disciplina_id
      )
    );

    v_enrollment_status :=
      internal_academic.final_enrollment_status(
        v_attempt.turma_origem_id,
        v_attempt.aluno_id
      );

    IF v_status = 'APROVADA'
      AND v_attempt.matricula_status = 'EM_DEPENDENCIA'
      AND v_enrollment_status = 'CONCLUIDO'
    THEN
      v_responsavel :=
        internal_academic.resolve_responsavel(NULL);

      INSERT INTO public.matricula_movimentacoes (
        matricula_id,
        aluno_id,
        tipo,
        status_anterior,
        status_novo,
        turma_origem_id,
        motivo,
        responsavel_id,
        metadados
      ) VALUES (
        v_attempt.matricula_id,
        v_attempt.aluno_id,
        'CONCLUSAO',
        'EM_DEPENDENCIA',
        'CONCLUIDO',
        v_attempt.turma_origem_id,
        'Conclusão após aprovação da última dependência acadêmica.',
        v_responsavel,
        jsonb_build_object(
          'tentativaDependenciaId',
          v_attempt.id,
          'turmaDestinoId',
          p_turma_id,
          'disciplinaId',
          p_disciplina_id
        )
      );

      PERFORM internal_academic.authorize_transition(
        'MATRICULA_STATUS',
        v_attempt.matricula_id,
        'CONCLUIDO'
      );

      UPDATE public.matriculas
      SET
        status = 'CONCLUIDO',
        updated_at = now()
      WHERE id = v_attempt.matricula_id
        AND status = 'EM_DEPENDENCIA';

      INSERT INTO public.matricula_dependencia_eventos (
        componente_id,
        tentativa_id,
        evento,
        actor_id,
        payload
      ) VALUES (
        v_attempt.componente_id,
        v_attempt.id,
        'MATRICULA_CONCLUIDA',
        auth.uid(),
        jsonb_build_object(
          'matriculaId',
          v_attempt.matricula_id
        )
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION
  internal_academic.finalize_dependency_attempts_for_diary(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_diario_bloqueio_confirmado(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_bloqueio text,
  p_motivo text DEFAULT NULL,
  p_confirmar_pendencias boolean DEFAULT false
)
RETURNS public.turmas_disciplinas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_gestor boolean;
  v_is_professor boolean;
  v_carga numeric;
  v_realizadas numeric;
  v_anterior text;
  v_periodo_status text;
  v_pendencias jsonb := '{}'::jsonb;
  v_motivo text;
  v_result public.turmas_disciplinas;
BEGIN
  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtext(p_turma_id::text),
    pg_catalog.hashtext(p_disciplina_id::text)
  );

  p_bloqueio := upper(trim(coalesce(p_bloqueio, '')));
  IF p_bloqueio NOT IN ('ABERTO', 'PROFESSOR', 'TOTAL') THEN
    RAISE EXCEPTION 'Bloqueio de diário inválido.';
  END IF;

  v_is_gestor := public.can_operate_turma_academics(p_turma_id);
  v_is_professor :=
    public.is_professor_assigned_disciplina(
      p_turma_id,
      p_disciplina_id
    );

  IF NOT v_is_gestor
    AND NOT (v_is_professor AND p_bloqueio = 'PROFESSOR')
  THEN
    RAISE EXCEPTION
      'Sem permissão para alterar o fechamento deste diário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT oferta.bloqueio_diario, periodo.status
  INTO v_anterior, v_periodo_status
  FROM public.turmas_disciplinas oferta
  LEFT JOIN public.periodos_letivos periodo
    ON periodo.id = oferta.periodo_letivo_id
  WHERE oferta.turma_id = p_turma_id
    AND oferta.disciplina_id = p_disciplina_id
  FOR UPDATE OF oferta;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Disciplina não vinculada à turma.';
  END IF;

  IF v_periodo_status = 'FECHADO' THEN
    RAISE EXCEPTION
      'Reabra o período letivo antes de alterar este diário.';
  END IF;

  IF NOT v_is_gestor AND v_anterior <> 'ABERTO' THEN
    RAISE EXCEPTION
      'Somente a Gestão pode alterar um diário que já está em revisão ou fechado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_bloqueio = v_anterior THEN
    SELECT oferta.*
    INTO v_result
    FROM public.turmas_disciplinas oferta
    WHERE oferta.turma_id = p_turma_id
      AND oferta.disciplina_id = p_disciplina_id;
    RETURN v_result;
  END IF;

  IF p_bloqueio = 'ABERTO'
    AND v_anterior <> 'ABERTO'
    AND nullif(trim(p_motivo), '') IS NULL
  THEN
    RAISE EXCEPTION
      'Informe o motivo da reabertura ou devolução para ajustes.';
  END IF;

  SELECT
    disciplina.carga_horaria,
    coalesce(sum(aula.carga_horaria) FILTER (
      WHERE aula.data_aula IS NULL
        OR aula.data_aula
          <= pg_catalog.timezone('America/Maceio', now())::date
    ), 0)
    + coalesce((
      SELECT sum(atividade.carga_horaria_compensacao)
      FROM public.atividades_extra_classe atividade
      WHERE atividade.turma_id = p_turma_id
        AND atividade.disciplina_id = p_disciplina_id
        AND atividade.status = 'PUBLICADA'
        AND (
          atividade.prazo_entrega IS NULL
          OR atividade.prazo_entrega
            <= pg_catalog.timezone('America/Maceio', now())::date
        )
    ), 0)
  INTO v_carga, v_realizadas
  FROM public.disciplinas disciplina
  LEFT JOIN public.aulas_turma aula
    ON aula.disciplina_id = disciplina.id
   AND aula.turma_id = p_turma_id
  WHERE disciplina.id = p_disciplina_id
  GROUP BY disciplina.carga_horaria;

  IF p_bloqueio <> 'ABERTO'
    AND coalesce(v_realizadas, 0) < coalesce(v_carga, 0)
  THEN
    RAISE EXCEPTION
      'A carga horária precisa atingir 100%% antes do fechamento.';
  END IF;

  IF p_bloqueio = 'TOTAL' THEN
    -- Serializa a decisão de encerramento com o gatilho de baixa financeira:
    -- nenhuma tentativa pode mudar de AGUARDANDO_PAGAMENTO para LIBERADA
    -- entre a checagem e o snapshot final do diário.
    PERFORM tentativa.id
    FROM public.matricula_disciplina_tentativas tentativa
    WHERE tentativa.turma_id = p_turma_id
      AND tentativa.disciplina_id = p_disciplina_id
      AND tentativa.status IN (
        'AGUARDANDO_PAGAMENTO',
        'LIBERADA',
        'EM_CURSO'
      )
    ORDER BY tentativa.id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.matricula_disciplina_tentativas tentativa
      WHERE tentativa.turma_id = p_turma_id
        AND tentativa.disciplina_id = p_disciplina_id
        AND tentativa.status = 'AGUARDANDO_PAGAMENTO'
    ) THEN
      RAISE EXCEPTION
        'O diário possui dependência agendada aguardando pagamento e ainda não pode ser encerrado.'
        USING ERRCODE = '55000';
    END IF;

    v_pendencias :=
      public.get_pendencias_fechamento_diario(
        p_turma_id,
        p_disciplina_id
      );

    IF NOT coalesce(
      (v_pendencias ->> 'podeFechar')::boolean,
      false
    )
      AND NOT coalesce(p_confirmar_pendencias, false)
    THEN
      RAISE EXCEPTION
        'Confirme explicitamente o fechamento com pendências.';
    END IF;
  END IF;

  v_motivo := nullif(trim(p_motivo), '');
  IF p_bloqueio = 'TOTAL'
    AND NOT coalesce(
      (v_pendencias ->> 'podeFechar')::boolean,
      false
    )
    AND v_motivo IS NULL
  THEN
    v_motivo :=
      'Fechamento confirmado pela Gestão com pendências.';
  END IF;

  -- Reabrir desfaz somente o resultado corrente da tentativa. O snapshot
  -- anterior permanece no log imutável de eventos.
  IF p_bloqueio = 'ABERTO' AND v_anterior = 'TOTAL' THEN
    PERFORM
      internal_academic.reopen_dependency_attempts_for_diary(
        p_turma_id,
        p_disciplina_id
      );
  END IF;

  PERFORM set_config('app.diario_lock_rpc', '1', true);

  UPDATE public.turmas_disciplinas oferta
  SET
    bloqueio_diario = p_bloqueio,
    concluida = p_bloqueio = 'TOTAL',
    diario_bloqueado_em = CASE
      WHEN p_bloqueio = 'ABERTO' THEN NULL
      ELSE now()
    END,
    diario_bloqueado_por = CASE
      WHEN p_bloqueio = 'ABERTO' THEN NULL
      ELSE auth.uid()
    END,
    diario_bloqueio_motivo = v_motivo
  WHERE oferta.turma_id = p_turma_id
    AND oferta.disciplina_id = p_disciplina_id
  RETURNING oferta.* INTO v_result;

  INSERT INTO public.diario_fechamento_historico (
    turma_id,
    disciplina_id,
    bloqueio_anterior,
    bloqueio_novo,
    motivo,
    responsavel_id,
    pendencias
  ) VALUES (
    p_turma_id,
    p_disciplina_id,
    v_anterior,
    p_bloqueio,
    v_motivo,
    auth.uid(),
    CASE
      WHEN p_bloqueio = 'TOTAL' THEN v_pendencias
      ELSE '{}'::jsonb
    END
  );

  IF p_bloqueio = 'TOTAL' THEN
    PERFORM
      internal_academic.finalize_dependency_attempts_for_diary(
        p_turma_id,
        p_disciplina_id
      );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION
  public.set_diario_bloqueio_confirmado(
    uuid,
    uuid,
    text,
    text,
    boolean
  )
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.set_diario_bloqueio_confirmado(
    uuid,
    uuid,
    text,
    text,
    boolean
  )
  TO authenticated, service_role;

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
  v_dependencias jsonb;
  v_regras jsonb;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT public.gestor_has_any_module(
      ARRAY['secretaria', 'gestao']
    )
  THEN
    RAISE EXCEPTION
      'Acesso ao workspace de dependências não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      row_data
      ORDER BY
        row_data ->> 'alunoNome',
        row_data ->> 'disciplinaNome'
    ),
    '[]'::jsonb
  )
  INTO v_dependencias
  FROM (
    SELECT jsonb_build_object(
      'id',
      coalesce(
        componente.id::text,
        matricula.id::text || ':' || disciplina.id::text
      ),
      'matriculaId',
      matricula.id,
      'alunoId',
      aluno.id,
      'alunoNome',
      aluno.nome,
      'aluno_cpf',
      aluno.cpf_cnpj,
      'turmaOrigemId',
      turma_origem.id,
      'turmaOrigemCodigo',
      turma_origem.codigo,
      'turmaOrigemNome',
      turma_origem.nome,
      'cursoId',
      curso.id,
      'cursoNome',
      curso.nome,
      'poloId',
      turma_origem.polo_id,
      'disciplinaId',
      disciplina.id,
      'disciplinaNome',
      disciplina.nome,
      'cargaHoraria',
      disciplina.carga_horaria,
      'resultadoFinal',
      resultado.resultado_final,
      'frequenciaPercent',
      resultado.frequencia_percent,
      'mediaParcial',
      resultado.media_parcial,
      'notaRec',
      resultado.nota_rec,
      'mediaFinal',
      resultado.media_final,
      'diarioFechadoEm',
      oferta_origem.diario_bloqueado_em,
      'componenteId',
      componente.id,
      'componenteStatus',
      coalesce(componente.status, 'PENDENTE_DEPENDENCIA'),
      'tentativaId',
      tentativa.id,
      'tentativaNumero',
      coalesce(tentativa.numero_tentativa, 1),
      'tentativaStatus',
      tentativa.status,
      'turmaDestinoId',
      tentativa.turma_id,
      'turma_destino_nome',
      turma_destino.nome,
      'turma_destino_codigo',
      turma_destino.codigo,
      'professor_nome',
      oferta_destino.professor_nome,
      'data_inicio',
      turma_destino.data_inicio,
      'proxima_aula',
      (
        SELECT min(aula.data_aula)
        FROM public.aulas_turma aula
        WHERE aula.turma_id = tentativa.turma_id
          AND aula.disciplina_id = tentativa.disciplina_id
          AND aula.data_aula
            >= pg_catalog.timezone(
              'America/Maceio',
              now()
            )::date
      ),
      'data_encerramento',
      tentativa.finalizada_em,
      'nota_final',
      tentativa.media_final_destino,
      'frequencia_final',
      tentativa.frequencia_destino,
      'cobrancaId',
      cobranca.conta_receber_id,
      'cobranca_status',
      recebivel.status,
      'valorCobrado',
      coalesce(
        tentativa.valor_cobrado_snapshot,
        recebivel.valor
      ),
      'data_vencimento',
      recebivel.data_vencimento,
      'gateway_boleto_linha_digitavel',
      recebivel.gateway_boleto_linha_digitavel,
      'gateway_boleto_codigo_barras',
      recebivel.gateway_boleto_codigo_barras,
      'gateway_boleto_nosso_numero',
      recebivel.gateway_boleto_nosso_numero
    ) AS row_data
    FROM public.matriculas matricula
    JOIN public.parceiros aluno
      ON aluno.id = matricula.aluno_id
    JOIN public.turmas turma_origem
      ON turma_origem.id = matricula.turma_id
    JOIN public.cursos curso
      ON curso.id = turma_origem.curso_id
    JOIN public.turmas_disciplinas oferta_origem
      ON oferta_origem.turma_id = turma_origem.id
    JOIN public.disciplinas disciplina
      ON disciplina.id = oferta_origem.disciplina_id
    CROSS JOIN LATERAL public.get_diario_resultados(
      turma_origem.id,
      disciplina.id
    ) resultado
    LEFT JOIN public.matricula_componentes componente
      ON componente.matricula_id = matricula.id
     AND componente.disciplina_id = disciplina.id
    LEFT JOIN LATERAL (
      SELECT tentativa_ordenada.*
      FROM public.matricula_disciplina_tentativas tentativa_ordenada
      WHERE tentativa_ordenada.componente_id = componente.id
      ORDER BY
        tentativa_ordenada.numero_tentativa DESC,
        tentativa_ordenada.created_at DESC,
        tentativa_ordenada.id DESC
      LIMIT 1
    ) tentativa ON true
    LEFT JOIN public.turmas turma_destino
      ON turma_destino.id = tentativa.turma_id
    LEFT JOIN public.turmas_disciplinas oferta_destino
      ON oferta_destino.turma_id = tentativa.turma_id
     AND oferta_destino.disciplina_id = tentativa.disciplina_id
    LEFT JOIN LATERAL (
      SELECT vinculo.conta_receber_id
      FROM public.matricula_dependencia_cobrancas vinculo
      WHERE vinculo.tentativa_id = tentativa.id
      ORDER BY
        vinculo.principal DESC,
        vinculo.created_at DESC
      LIMIT 1
    ) cobranca ON true
    LEFT JOIN public.contas_receber recebivel
      ON recebivel.id = cobranca.conta_receber_id
    WHERE resultado.aluno_id = matricula.aluno_id
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
      AND oferta_origem.bloqueio_diario = 'TOTAL'
      AND oferta_origem.diario_bloqueado_em IS NOT NULL
      AND resultado.resultado_final IN (
        'REPROVADO_FREQUENCIA',
        'REPROVADO'
      )
      AND (
        p_polo_id IS NULL
        OR turma_origem.polo_id = p_polo_id
      )
      AND internal_academic.can_manage_dependency_workspace(
        turma_origem.id
      )
      AND (
        nullif(btrim(coalesce(p_search, '')), '') IS NULL
        OR lower(aluno.nome)
          LIKE '%' || lower(btrim(p_search)) || '%'
        OR lower(disciplina.nome)
          LIKE '%' || lower(btrim(p_search)) || '%'
        OR lower(turma_origem.codigo)
          LIKE '%' || lower(btrim(p_search)) || '%'
      )
  ) rows;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
        politica.id,
        'disciplina_id',
        politica.disciplina_id,
        'disciplina_nome',
        coalesce(disciplina_politica.nome, 'Regra institucional'),
        'faixa',
        CASE
          WHEN politica.disciplina_id IS NOT NULL
            THEN 'Por disciplina'
          WHEN politica.carga_horaria_maxima <= 40
            THEN 'Até 40h'
          ELSE 'Acima de 40h'
        END,
        'carga_horaria',
        coalesce(
          disciplina_politica.carga_horaria,
          politica.carga_horaria_maxima
        ),
        'percentual',
        politica.multiplicador_parcela,
        'vigencia_inicio',
        politica.vigencia_inicio,
        'origem',
        politica.codigo,
        'updated_at',
        politica.updated_at
      )
      ORDER BY politica.carga_horaria_minima
    ),
    '[]'::jsonb
  )
  INTO v_regras
  FROM public.politicas_cobranca_dependencia politica
  LEFT JOIN public.disciplinas disciplina_politica
    ON disciplina_politica.id = politica.disciplina_id
  WHERE politica.status = 'ATIVA'
    AND (
      politica.polo_id IS NULL
      OR politica.polo_id = p_polo_id
    );

  RETURN jsonb_build_object(
    'dependencias',
    v_dependencias,
    'regras_financeiras',
    v_regras,
    'atualizado_em',
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_secretaria_dependencias_workspace_secure(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_secretaria_dependencias_workspace_secure(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_secretaria_documento_academico(
  p_matricula_id uuid,
  p_documento text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_polo_id uuid;
BEGIN
  IF p_documento NOT IN (
    'boletim',
    'atestado_conclusao_tecnico',
    'declaracao_frequencia',
    'historico_escolar',
    'transferencia'
  ) THEN
    RAISE EXCEPTION
      'Tipo de documento acadêmico não suportado.'
      USING ERRCODE = '22023';
  END IF;

  SELECT turma.polo_id
  INTO v_polo_id
  FROM public.matriculas matricula
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  WHERE matricula.id = p_matricula_id;

  IF v_polo_id IS NULL THEN
    RAISE EXCEPTION
      'Matrícula acadêmica não localizada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND (
      (SELECT auth.uid()) IS NULL
      OR NOT public.can_manage_secretaria_document(
        p_documento,
        v_polo_id
      )
    )
  THEN
    RAISE EXCEPTION
      'Acesso ao documento acadêmico não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  WITH matricula_base AS (
    SELECT
      matricula.id,
      matricula.status,
      matricula.data_matricula,
      turma.data_inicio,
      curso.carga_horaria AS carga_horaria_curso,
      curso.area AS curso_area,
      curso.eixo_tecnologico,
      curso.perfil_profissional_conclusao,
      (
        SELECT certificado.data_conclusao
        FROM public.certificados_academicos certificado
        WHERE certificado.matricula_id = matricula.id
          AND certificado.status = 'FINALIZADO'
        ORDER BY certificado.emitido_em DESC
        LIMIT 1
      ) AS data_conclusao
    FROM public.matriculas matricula
    JOIN public.turmas turma
      ON turma.id = matricula.turma_id
    JOIN public.cursos curso
      ON curso.id = turma.curso_id
    WHERE matricula.id = p_matricula_id
  ),
  resultados AS (
    SELECT resultado.*
    FROM internal_academic.get_enrollment_results(
      p_matricula_id
    ) resultado
  ),
  componentes AS (
    SELECT
      modulo.id AS modulo_id,
      modulo.nome AS modulo_nome,
      modulo.ordem AS modulo_ordem,
      modulo.created_at AS modulo_criado_em,
      disciplina.id AS disciplina_id,
      disciplina.nome AS disciplina_nome,
      disciplina.ordem AS disciplina_ordem,
      disciplina.created_at AS disciplina_criada_em,
      coalesce(disciplina.carga_horaria, 0) AS carga_horaria,
      coalesce(
        disciplina.carga_horaria_teoria,
        0
      ) AS carga_horaria_teoria,
      coalesce(
        disciplina.carga_horaria_pratica,
        0
      ) AS carga_horaria_pratica,
      coalesce(
        disciplina.carga_horaria_estagio,
        0
      ) AS carga_horaria_estagio,
      resultado.media_final AS nota,
      resultado.frequencia_percent AS frequencia,
      resultado.resultado_final,
      tentativa.id AS tentativa_dependencia_id,
      tentativa.numero_tentativa AS tentativa_dependencia_numero,
      tentativa.turma_id AS turma_dependencia_id,
      turma_dependencia.codigo AS turma_dependencia_codigo,
      CASE
        WHEN tentativa.id IS NOT NULL
          AND resultado.resultado_final = 'APROVADO'
          THEN 'Aprovado em dependência'
        ELSE CASE resultado.resultado_final
          WHEN 'APROVEITADO' THEN 'Aproveitado'
          WHEN 'SEM_LANCAMENTO' THEN 'Sem lançamento'
          WHEN 'FREQUENCIA_PENDENTE' THEN 'Frequência pendente'
          WHEN 'REPROVADO_FREQUENCIA'
            THEN 'Reprovado por frequência'
          WHEN 'APROVADO' THEN 'Aprovado'
          WHEN 'EM_RECUPERACAO' THEN 'Recuperação'
          WHEN 'REPROVADO' THEN 'Reprovado'
          ELSE 'Sem lançamento'
        END
      END AS situacao
    FROM matricula_base base
    JOIN public.matriculas matricula
      ON matricula.id = base.id
    JOIN public.turmas_disciplinas oferta
      ON oferta.turma_id = matricula.turma_id
    JOIN public.disciplinas disciplina
      ON disciplina.id = oferta.disciplina_id
    LEFT JOIN public.modulos modulo
      ON modulo.id = disciplina.modulo_id
    LEFT JOIN resultados resultado
      ON resultado.disciplina_id = oferta.disciplina_id
    LEFT JOIN public.matricula_componentes componente
      ON componente.matricula_id = matricula.id
     AND componente.disciplina_id = disciplina.id
     AND componente.status = 'APROVADO'
    LEFT JOIN public.matricula_disciplina_tentativas tentativa
      ON tentativa.id = componente.tentativa_aprovada_id
     AND tentativa.status = 'APROVADA'
    LEFT JOIN public.turmas turma_dependencia
      ON turma_dependencia.id = tentativa.turma_id
  ),
  resumo AS (
    SELECT
      coalesce(sum(componente.carga_horaria), 0)::integer
        AS carga_componentes,
      round(
        avg(componente.nota)
          FILTER (WHERE componente.nota IS NOT NULL),
        2
      ) AS media_geral,
      round(
        sum(
          componente.frequencia
          * greatest(componente.carga_horaria, 1)
        ) FILTER (
          WHERE componente.frequencia IS NOT NULL
        )
        / nullif(
          sum(
            greatest(componente.carga_horaria, 1)
          ) FILTER (
            WHERE componente.frequencia IS NOT NULL
          ),
          0
        ),
        2
      ) AS frequencia_geral,
      coalesce(
        sum(componente.carga_horaria) FILTER (
          WHERE componente.resultado_final IN (
            'APROVADO',
            'APROVEITADO'
          )
        ),
        0
      )::integer AS carga_cumprida,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'moduleId',
            componente.modulo_id,
            'moduleName',
            coalesce(componente.modulo_nome, 'Módulo'),
            'moduleOrder',
            coalesce(componente.modulo_ordem, 2147483647),
            'disciplineId',
            componente.disciplina_id,
            'disciplineOrder',
            coalesce(
              componente.disciplina_ordem,
              2147483647
            ),
            'discipline',
            componente.disciplina_nome,
            'cargaHoraria',
            componente.carga_horaria,
            'cargaHorariaTeoria',
            componente.carga_horaria_teoria,
            'cargaHorariaPratica',
            componente.carga_horaria_pratica,
            'cargaHorariaEstagio',
            componente.carga_horaria_estagio,
            'nota',
            componente.nota,
            'notaEstagio',
            NULL,
            'frequencia',
            componente.frequencia,
            'frequenciaEstagio',
            NULL,
            'situacao',
            componente.situacao,
            'dependencyAttemptId',
            componente.tentativa_dependencia_id,
            'dependencyAttemptNumber',
            componente.tentativa_dependencia_numero,
            'dependencyClassId',
            componente.turma_dependencia_id,
            'dependencyClassCode',
            componente.turma_dependencia_codigo
          )
          ORDER BY
            componente.modulo_ordem NULLS LAST,
            componente.modulo_criado_em NULLS LAST,
            componente.disciplina_ordem NULLS LAST,
            componente.disciplina_criada_em NULLS LAST,
            componente.disciplina_nome
        ),
        '[]'::jsonb
      ) AS componentes
    FROM componentes componente
  )
  SELECT jsonb_build_object(
    'componentes',
    resumo.componentes,
    'mediaGeral',
    resumo.media_geral,
    'frequenciaGeral',
    resumo.frequencia_geral,
    'cargaHorariaCumprida',
    resumo.carga_cumprida,
    'cargaHorariaTotal',
    CASE
      WHEN coalesce(base.carga_horaria_curso, 0) > 0
        THEN base.carga_horaria_curso
      ELSE resumo.carga_componentes
    END,
    'inicioCurso',
    coalesce(base.data_inicio, base.data_matricula),
    'fimCurso',
    base.data_conclusao,
    'courseArea',
    coalesce(base.curso_area, ''),
    'courseTechnologicalAxis',
    coalesce(base.eixo_tecnologico, ''),
    'courseProfessionalProfile',
    coalesce(base.perfil_profissional_conclusao, ''),
    'situacaoAcademica',
    CASE
      WHEN upper(coalesce(base.status, '')) = 'EM_DEPENDENCIA'
        THEN 'Em dependência'
      WHEN upper(coalesce(base.status, '')) LIKE '%CONCLU%'
        THEN 'Concluído(a)'
      WHEN upper(coalesce(base.status, '')) LIKE '%TRANC%'
        THEN 'Trancado(a)'
      WHEN upper(coalesce(base.status, '')) LIKE '%SUSP%'
        THEN 'Suspenso(a)'
      WHEN upper(coalesce(base.status, '')) LIKE '%INATIV%'
        THEN 'Inativo(a)'
      WHEN upper(coalesce(base.status, '')) LIKE '%ATIV%'
        THEN 'Ativo(a)'
      WHEN upper(coalesce(base.status, '')) LIKE '%EXCL%'
        OR upper(coalesce(base.status, '')) LIKE '%CANCEL%'
        THEN 'Cancelado(a)'
      ELSE coalesce(
        nullif(base.status, ''),
        'Em análise'
      )
    END
  )
  INTO v_payload
  FROM matricula_base base
  CROSS JOIN resumo;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_secretaria_documento_academico(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_secretaria_documento_academico(uuid, text)
  TO authenticated, service_role;

COMMENT ON COLUMN public.matricula_componentes.tentativa_aprovada_id IS
  'Tentativa vencedora usada pelo resultado canônico da matrícula original.';
COMMENT ON COLUMN public.matricula_disciplina_tentativas.resultado_destino IS
  'Resultado apurado no diário exato da reoferta, sem duplicar a carga curricular.';
COMMENT ON FUNCTION internal_academic.is_dependency_student_in_diary(
  uuid,
  uuid,
  uuid,
  uuid,
  boolean
) IS
  'Autoriza somente a combinação exata turma + disciplina da tentativa; não equivale a matrícula integral na turma.';

NOTIFY pgrst, 'reload schema';

COMMIT;
