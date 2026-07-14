-- Períodos e fechamentos: leitura por escopo; mutações somente pelos RPCs.

ALTER TABLE public.periodos_letivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamentos_academicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura periodos letivos" ON public.periodos_letivos;
DROP POLICY IF EXISTS "portal_periodos_letivos_select" ON public.periodos_letivos;
DROP POLICY IF EXISTS "portal_periodos_letivos_write" ON public.periodos_letivos;
DROP POLICY IF EXISTS "portal_periodos_letivos_insert" ON public.periodos_letivos;
DROP POLICY IF EXISTS "portal_periodos_letivos_update" ON public.periodos_letivos;
DROP POLICY IF EXISTS "portal_periodos_letivos_delete" ON public.periodos_letivos;

CREATE POLICY "portal_periodos_letivos_select"
  ON public.periodos_letivos FOR SELECT TO authenticated
  USING ((SELECT public.can_access_turma(turma_id)));

DROP POLICY IF EXISTS "Leitura fechamentos academicos"
  ON public.fechamentos_academicos;
DROP POLICY IF EXISTS "portal_fechamentos_academicos_select"
  ON public.fechamentos_academicos;
DROP POLICY IF EXISTS "portal_fechamentos_academicos_write"
  ON public.fechamentos_academicos;
DROP POLICY IF EXISTS "portal_fechamentos_academicos_insert"
  ON public.fechamentos_academicos;
DROP POLICY IF EXISTS "portal_fechamentos_academicos_update"
  ON public.fechamentos_academicos;
DROP POLICY IF EXISTS "portal_fechamentos_academicos_delete"
  ON public.fechamentos_academicos;

CREATE POLICY "portal_fechamentos_academicos_select"
  ON public.fechamentos_academicos FOR SELECT TO authenticated
  USING ((SELECT public.can_access_turma(turma_id)));

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.periodos_letivos FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.periodos_letivos FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.fechamentos_academicos FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fechamentos_academicos FROM authenticated;
GRANT SELECT ON public.periodos_letivos TO authenticated;
GRANT SELECT ON public.fechamentos_academicos TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_technical_period_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tecnico boolean := false;
  v_authorized boolean := false;
BEGIN
  SELECT c.modalidade = 'TECNICO' INTO v_tecnico
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = NEW.turma_id;

  IF NOT coalesce(v_tecnico, false) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.fechado_em IS NOT NULL OR NEW.fechado_por IS NOT NULL
      OR NEW.reaberto_em IS NOT NULL OR NEW.reaberto_por IS NOT NULL
      OR NEW.motivo_reabertura IS NOT NULL THEN
      RAISE EXCEPTION 'Período técnico planejado não aceita auditoria de fechamento.';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.fechado_em, NEW.fechado_por, NEW.reaberto_em,
      NEW.reaberto_por, NEW.motivo_reabertura)
    IS NOT DISTINCT FROM
    (OLD.fechado_em, OLD.fechado_por, OLD.reaberto_em,
      OLD.reaberto_por, OLD.motivo_reabertura) THEN
    RETURN NEW;
  END IF;

  DELETE FROM internal_academic.transition_authorizations a
  WHERE a.transaction_id = pg_current_xact_id()::text
    AND a.backend_pid = pg_backend_pid()
    AND a.entity = 'PERIODO_AUDIT'
    AND a.record_id = NEW.id
    AND a.new_status = NEW.status
  RETURNING true INTO v_authorized;

  IF NOT coalesce(v_authorized, false) THEN
    RAISE EXCEPTION 'Fechamento, reabertura e responsáveis só podem mudar pelos RPCs acadêmicos.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'FECHADO' THEN
    IF OLD.status <> 'ABERTO' OR NEW.fechado_em IS NULL
      OR (NEW.reaberto_em, NEW.reaberto_por, NEW.motivo_reabertura)
        IS DISTINCT FROM
        (OLD.reaberto_em, OLD.reaberto_por, OLD.motivo_reabertura) THEN
      RAISE EXCEPTION 'Auditoria de fechamento de período inválida.';
    END IF;
  ELSIF NEW.status = 'ABERTO' THEN
    IF OLD.status <> 'FECHADO' OR NEW.reaberto_em IS NULL
      OR nullif(btrim(NEW.motivo_reabertura), '') IS NULL THEN
      RAISE EXCEPTION 'Auditoria de reabertura de período inválida.';
    END IF;
    IF (NEW.fechado_em, NEW.fechado_por)
      IS DISTINCT FROM (OLD.fechado_em, OLD.fechado_por) THEN
      RAISE EXCEPTION 'O fechamento original do período é imutável.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Transição incompatível com a auditoria do período.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_technical_period_audit()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_technical_period_audit_trigger
  ON public.periodos_letivos;
CREATE TRIGGER protect_technical_period_audit_trigger
BEFORE INSERT OR UPDATE ON public.periodos_letivos
FOR EACH ROW EXECUTE FUNCTION public.protect_technical_period_audit();

CREATE OR REPLACE FUNCTION public.protect_technical_closing_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.fechamentos_academicos%rowtype;
  v_tecnico boolean := false;
  v_authorized boolean := false;
  v_entity text;
  v_record_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE c.modalidade = 'TECNICO'
      AND t.id IN (v_row.turma_id,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.turma_id ELSE v_row.turma_id END)
  ) INTO v_tecnico;

  IF NOT coalesce(v_tecnico, false) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Fechamentos acadêmicos técnicos são histórico imutável.'
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'INSERT' THEN
    v_entity := 'FECHAMENTO_INSERT';
    v_record_id := NEW.periodo_letivo_id;
  ELSE
    v_entity := 'FECHAMENTO_UPDATE';
    v_record_id := OLD.id;
  END IF;

  DELETE FROM internal_academic.transition_authorizations a
  WHERE a.transaction_id = pg_current_xact_id()::text
    AND a.backend_pid = pg_backend_pid()
    AND a.entity = v_entity
    AND a.record_id = v_record_id
    AND a.new_status = NEW.status
  RETURNING true INTO v_authorized;

  IF NOT coalesce(v_authorized, false) THEN
    RAISE EXCEPTION 'Fechamento acadêmico técnico só pode mudar pelos RPCs acadêmicos.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo <> 'PERIODO' OR NEW.status <> 'FECHADO'
      OR NEW.fechado_em IS NULL
      OR NEW.reaberto_em IS NOT NULL OR NEW.reaberto_por IS NOT NULL
      OR NEW.motivo_reabertura IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.periodos_letivos pl
        WHERE pl.id = NEW.periodo_letivo_id
          AND pl.turma_id = NEW.turma_id
          AND pl.status = 'FECHADO'
      ) THEN
      RAISE EXCEPTION 'Registro de fechamento técnico inconsistente.';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.periodo_letivo_id, NEW.turma_id, NEW.tipo, NEW.resumo,
      NEW.fechado_em, NEW.fechado_por, NEW.created_at)
    IS DISTINCT FROM
    (OLD.periodo_letivo_id, OLD.turma_id, OLD.tipo, OLD.resumo,
      OLD.fechado_em, OLD.fechado_por, OLD.created_at)
    OR OLD.status <> 'FECHADO' OR NEW.status <> 'REABERTO'
    OR NEW.reaberto_em IS NULL
    OR nullif(btrim(NEW.motivo_reabertura), '') IS NULL THEN
    RAISE EXCEPTION 'Somente a reabertura auditada do fechamento é permitida.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_technical_closing_audit()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_technical_closing_audit_trigger
  ON public.fechamentos_academicos;
CREATE TRIGGER protect_technical_closing_audit_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.fechamentos_academicos
FOR EACH ROW EXECUTE FUNCTION public.protect_technical_closing_audit();
