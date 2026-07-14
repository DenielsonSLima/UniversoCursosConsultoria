-- Vínculos turma/disciplina: leitura por escopo e escrita exclusiva do gestor.

ALTER TABLE public.turmas_disciplinas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total local turmas_disciplinas"
  ON public.turmas_disciplinas;
DROP POLICY IF EXISTS "portal_turmas_disciplinas_write"
  ON public.turmas_disciplinas;
DROP POLICY IF EXISTS "portal_turmas_disciplinas_select"
  ON public.turmas_disciplinas;
DROP POLICY IF EXISTS "portal_turmas_disciplinas_insert"
  ON public.turmas_disciplinas;
DROP POLICY IF EXISTS "portal_turmas_disciplinas_update"
  ON public.turmas_disciplinas;
DROP POLICY IF EXISTS "portal_turmas_disciplinas_delete"
  ON public.turmas_disciplinas;

CREATE POLICY "portal_turmas_disciplinas_select"
  ON public.turmas_disciplinas FOR SELECT TO authenticated
  USING (
    (SELECT public.can_access_turma(turma_id))
    OR professor_id = (SELECT public.current_professor_id())
  );

CREATE POLICY "portal_turmas_disciplinas_insert"
  ON public.turmas_disciplinas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_turma(turma_id)));

CREATE POLICY "portal_turmas_disciplinas_update"
  ON public.turmas_disciplinas FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_turma(turma_id)))
  WITH CHECK ((SELECT public.can_write_turma(turma_id)));

CREATE POLICY "portal_turmas_disciplinas_delete"
  ON public.turmas_disciplinas FOR DELETE TO authenticated
  USING ((SELECT public.can_write_turma(turma_id)));

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
    AND v_new_status IN ('EM_ANDAMENTO', 'FINALIZADA') THEN
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

REVOKE EXECUTE ON FUNCTION public.protect_technical_class_discipline_binding()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_technical_class_discipline_binding_trigger
  ON public.turmas_disciplinas;
CREATE TRIGGER protect_technical_class_discipline_binding_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.turmas_disciplinas
FOR EACH ROW EXECUTE FUNCTION public.protect_technical_class_discipline_binding();
