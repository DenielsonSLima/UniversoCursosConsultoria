begin;

-- Narrow INSERT exceptions for an executing, private historical request.
-- All ordinary lifecycle, course/module, deletion and update guards remain.

CREATE OR REPLACE FUNCTION public.protect_technical_period_structure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.periodos_letivos%rowtype;
  v_turma public.turmas%rowtype;
  v_tecnico boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('technical_turma:' || v_row.turma_id::text, 0)
  );
  SELECT t.* INTO v_turma
  FROM public.turmas t
  WHERE t.id = v_row.turma_id FOR UPDATE OF t;
  SELECT c.modalidade = 'TECNICO' INTO v_tecnico
  FROM public.cursos c WHERE c.id = v_turma.curso_id;
  IF NOT coalesce(v_tecnico, false) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF v_row.modulo_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.modulos m
    WHERE m.id = v_row.modulo_id AND m.curso_id = v_turma.curso_id
  ) THEN
    RAISE EXCEPTION 'O módulo do período deve pertencer ao curso da turma.';
  END IF;
  IF TG_OP = 'INSERT'
    AND v_turma.status NOT IN ('PLANEJADA', 'INSCRICOES_ABERTAS')
    AND NOT (v_turma.status = 'EM_ANDAMENTO'
      AND internal_academic.consume_historical_period_claim(
        'HISTORICAL_PERIOD_STRUCTURE', to_jsonb(NEW))) THEN
    RAISE EXCEPTION 'Novos períodos só podem ser criados antes do início da turma técnica.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF v_turma.status NOT IN ('PLANEJADA', 'INSCRICOES_ABERTAS')
      OR OLD.status <> 'PLANEJADO' THEN
      RAISE EXCEPTION 'Períodos operacionais ou históricos não podem ser excluídos.';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status <> 'PLANEJADO' AND EXISTS (
    SELECT 1 FROM internal_academic.historical_period_scopes s
    WHERE s.periodo_letivo_id = OLD.id AND s.calendar_state = 'REVIEW'
  ) THEN
    RAISE EXCEPTION 'O calendário histórico está em conferência; o período não pode ser aberto.';
  END IF;
  IF TG_OP = 'UPDATE' AND v_turma.status IN ('EM_ANDAMENTO', 'FINALIZADA')
    AND (NEW.turma_id, NEW.modulo_id, NEW.nome, NEW.ordem, NEW.data_inicio, NEW.data_fim)
      IS DISTINCT FROM
        (OLD.turma_id, OLD.modulo_id, OLD.nome, OLD.ordem, OLD.data_inicio, OLD.data_fim) THEN
    RAISE EXCEPTION 'A estrutura dos períodos fica bloqueada após o início da turma.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_technical_period_dates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_turma public.turmas%rowtype; v_tecnico boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('technical_turma:' || NEW.turma_id::text, 0)
  );
  SELECT t.* INTO v_turma FROM public.turmas t
  WHERE t.id = NEW.turma_id;
  SELECT c.modalidade = 'TECNICO' INTO v_tecnico
  FROM public.cursos c WHERE c.id = v_turma.curso_id;
  IF NOT coalesce(v_tecnico, false) THEN RETURN NEW; END IF;
  -- Only the insert issued by the historical structure RPC can keep unknown
  -- boundaries. Updating dates or opening a period keeps all ordinary guards.
  IF TG_OP = 'INSERT' AND v_turma.status = 'EM_ANDAMENTO'
    AND NEW.data_inicio IS NULL AND NEW.data_fim IS NULL
    AND internal_academic.consume_historical_period_claim(
      'HISTORICAL_PERIOD_DATES', to_jsonb(NEW)) THEN
    RETURN NEW;
  END IF;
  IF NEW.data_inicio IS NULL OR NEW.data_fim IS NULL OR NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'Período técnico exige datas inicial e final válidas.';
  END IF;
  IF NEW.data_inicio < v_turma.data_inicio OR NEW.data_fim > v_turma.data_previsao_termino THEN
    RAISE EXCEPTION 'O período deve permanecer dentro das datas da turma.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.periodos_letivos pl
    WHERE pl.turma_id = NEW.turma_id AND pl.id IS DISTINCT FROM NEW.id
      AND daterange(pl.data_inicio, pl.data_fim, '[]') && daterange(NEW.data_inicio, NEW.data_fim, '[]')) THEN
    RAISE EXCEPTION 'Períodos técnicos não podem ter datas sobrepostas.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_technical_class_discipline_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.turmas_disciplinas%rowtype;
  v_new_status text;
  v_old_status text;
  v_new_tecnico boolean := false;
  v_old_tecnico boolean := false;
  v_relink_authorized boolean := false;
  v_binding_exists boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  -- A trava da turma serializa o início/finalização contra alterações do vínculo.
  PERFORM t.id
  FROM public.turmas t
  WHERE t.id IN (v_row.turma_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.turma_id ELSE v_row.turma_id END)
  ORDER BY t.id
  FOR UPDATE;

  SELECT t.status, c.modalidade = 'TECNICO'
  INTO v_new_status, v_new_tecnico
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = v_row.turma_id;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT t.status, c.modalidade = 'TECNICO'
    INTO v_old_status, v_old_tecnico
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = OLD.turma_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF coalesce(v_old_tecnico, false)
      AND v_old_status IN ('EM_ANDAMENTO', 'FINALIZADA') THEN
      RAISE EXCEPTION 'Disciplinas não podem ser removidas após o início da turma técnica.';
    END IF;
    RETURN OLD;
  END IF;

  IF coalesce(v_new_tecnico, false) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.turmas t
      JOIN public.disciplinas d ON d.id = NEW.disciplina_id
      JOIN public.modulos m ON m.id = d.modulo_id
      WHERE t.id = NEW.turma_id AND m.curso_id = t.curso_id
    ) THEN
      RAISE EXCEPTION 'A disciplina deve pertencer ao curso da turma técnica.';
    END IF;

    IF TG_OP = 'INSERT' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.turmas_disciplinas td
        WHERE td.turma_id = NEW.turma_id
          AND td.disciplina_id = NEW.disciplina_id
      ) INTO v_binding_exists;

      IF NEW.periodo_letivo_id IS NULL THEN
        SELECT td.periodo_letivo_id INTO NEW.periodo_letivo_id
        FROM public.turmas_disciplinas td
        WHERE td.turma_id = NEW.turma_id
          AND td.disciplina_id = NEW.disciplina_id;
      END IF;

      IF NEW.periodo_letivo_id IS NULL THEN
        SELECT pl.id INTO NEW.periodo_letivo_id
        FROM public.periodos_letivos pl
        JOIN public.disciplinas d ON d.id = NEW.disciplina_id
        WHERE pl.turma_id = NEW.turma_id AND pl.modulo_id = d.modulo_id;
      END IF;
    END IF;

    IF NEW.periodo_letivo_id IS NULL THEN
      DELETE FROM internal_academic.transition_authorizations a
      WHERE a.transaction_id = pg_current_xact_id()::text
        AND a.backend_pid = pg_backend_pid()
        AND a.entity = 'TURMA_DISCIPLINA_RELINK:' || NEW.turma_id::text
        AND a.record_id = NEW.disciplina_id
        AND a.new_status = 'PERIODO_NULL'
      RETURNING true INTO v_relink_authorized;
      IF NOT coalesce(v_relink_authorized, false) THEN
        RAISE EXCEPTION 'O vínculo técnico exige um período letivo válido.';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.periodos_letivos pl
      JOIN public.disciplinas d ON d.id = NEW.disciplina_id
      WHERE pl.id = NEW.periodo_letivo_id
        AND pl.turma_id = NEW.turma_id
        AND pl.modulo_id = d.modulo_id
    ) THEN
      RAISE EXCEPTION 'O período deve pertencer à turma e ao módulo da disciplina.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND coalesce(v_new_tecnico, false)
    AND NOT v_binding_exists
    AND v_new_status IN ('EM_ANDAMENTO', 'FINALIZADA')
    AND NOT (v_new_status = 'EM_ANDAMENTO'
      AND internal_academic.consume_historical_binding_claim(to_jsonb(NEW))) THEN
    RAISE EXCEPTION 'Disciplinas não podem ser incluídas após o início da turma técnica.';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (coalesce(v_old_tecnico, false) OR coalesce(v_new_tecnico, false))
    AND (v_old_status = 'FINALIZADA' OR v_new_status = 'FINALIZADA')
    AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Vínculos de disciplina da turma técnica finalizada são imutáveis.';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (coalesce(v_old_tecnico, false) OR coalesce(v_new_tecnico, false))
    AND (NEW.turma_id, NEW.disciplina_id, NEW.periodo_letivo_id)
      IS DISTINCT FROM (OLD.turma_id, OLD.disciplina_id, OLD.periodo_letivo_id)
    AND (
      (coalesce(v_old_tecnico, false)
        AND v_old_status IN ('EM_ANDAMENTO', 'FINALIZADA'))
      OR (coalesce(v_new_tecnico, false)
        AND v_new_status IN ('EM_ANDAMENTO', 'FINALIZADA'))
    ) THEN
    RAISE EXCEPTION 'A estrutura de disciplinas fica bloqueada após o início da turma técnica.';
  END IF;

  RETURN NEW;
END;
$$;

revoke all on function public.protect_technical_period_structure(),
  public.validate_technical_period_dates(), public.protect_technical_class_discipline_binding()
  from public, anon, authenticated, service_role;

commit;
