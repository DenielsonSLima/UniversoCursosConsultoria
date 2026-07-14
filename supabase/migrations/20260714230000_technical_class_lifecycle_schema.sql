-- Estrutura e guardas autoritativas do ciclo de turmas técnicas.

ALTER TABLE public.turmas DROP CONSTRAINT IF EXISTS turmas_status_check;
ALTER TABLE public.turmas ADD CONSTRAINT turmas_status_check CHECK (status IN (
  'PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO', 'FINALIZADA'
));

ALTER TABLE public.periodos_letivos
  DROP CONSTRAINT IF EXISTS periodos_letivos_status_check;
ALTER TABLE public.periodos_letivos
  ADD CONSTRAINT periodos_letivos_status_check CHECK (status IN (
    'PLANEJADO', 'ABERTO', 'EM_FECHAMENTO', 'FECHADO'
  ));

ALTER TABLE public.matriculas DROP CONSTRAINT IF EXISTS matriculas_status_check;
ALTER TABLE public.matriculas ADD CONSTRAINT matriculas_status_check CHECK (status IN (
  'PENDENTE', 'ATIVO', 'TRANCADO', 'CANCELADO', 'CONCLUIDO', 'REPROVADO',
  'DESISTENTE', 'TRANSFERIDO'
));

-- Backfill deliberadamente restrito: técnico futuro sem qualquer matrícula.
UPDATE public.turmas t
SET status = CASE
  WHEN coalesce(t.permitir_inscricoes_online, false)
    AND (t.data_inicio_inscricao IS NULL OR t.data_inicio_inscricao <= (pg_catalog.timezone('America/Maceio', now()))::date)
    AND (t.data_fim_inscricao IS NULL OR t.data_fim_inscricao >= (pg_catalog.timezone('America/Maceio', now()))::date)
    THEN 'INSCRICOES_ABERTAS'
  ELSE 'PLANEJADA'
END
FROM public.cursos c
WHERE c.id = t.curso_id
  AND c.modalidade = 'TECNICO'
  AND t.status = 'EM_ANDAMENTO'
  AND t.data_inicio > (pg_catalog.timezone('America/Maceio', now()))::date
  AND NOT EXISTS (SELECT 1 FROM public.matriculas m WHERE m.turma_id = t.id);

WITH eligible AS (
  SELECT t.id, t.data_inicio, t.data_previsao_termino
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  JOIN public.periodos_letivos pl ON pl.turma_id = t.id
  WHERE c.modalidade = 'TECNICO'
    AND t.status IN ('PLANEJADA', 'INSCRICOES_ABERTAS')
    AND t.data_inicio > (pg_catalog.timezone('America/Maceio', now()))::date
    AND t.data_inicio IS NOT NULL
    AND t.data_previsao_termino IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.matriculas m WHERE m.turma_id = t.id)
  GROUP BY t.id, t.data_inicio, t.data_previsao_termino
  HAVING count(*) > 1
    AND (t.data_previsao_termino - t.data_inicio + 1) >= count(*)
    AND bool_and(pl.data_inicio IS NOT DISTINCT FROM t.data_inicio)
    AND bool_and(pl.data_fim IS NOT DISTINCT FROM t.data_previsao_termino)
), ranked AS (
  SELECT pl.id, e.data_inicio, e.data_previsao_termino,
    row_number() OVER (PARTITION BY pl.turma_id ORDER BY pl.ordem, pl.id)::integer pos,
    count(*) OVER (PARTITION BY pl.turma_id)::integer total
  FROM public.periodos_letivos pl
  JOIN eligible e ON e.id = pl.turma_id
)
UPDATE public.periodos_letivos pl
SET data_inicio = r.data_inicio + floor(
      ((r.data_previsao_termino - r.data_inicio + 1)::numeric * (r.pos - 1)) / r.total
    )::integer,
    data_fim = r.data_inicio + floor(
      ((r.data_previsao_termino - r.data_inicio + 1)::numeric * r.pos) / r.total
    )::integer - 1,
    status = CASE WHEN pl.status = 'FECHADO' THEN 'FECHADO' ELSE 'PLANEJADO' END,
    updated_at = now()
FROM ranked r
WHERE r.id = pl.id;

CREATE SCHEMA IF NOT EXISTS internal_academic;
REVOKE ALL ON SCHEMA internal_academic FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS internal_academic.transition_authorizations (
  transaction_id text NOT NULL,
  backend_pid integer NOT NULL,
  entity text NOT NULL,
  record_id uuid NOT NULL,
  new_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_id, backend_pid, entity, record_id, new_status)
);
ALTER TABLE internal_academic.transition_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal_academic.transition_authorizations
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal_academic.authorize_transition(
  p_entity text, p_record_id uuid, p_new_status text
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO internal_academic.transition_authorizations (
    transaction_id, backend_pid, entity, record_id, new_status
  ) VALUES (
    pg_current_xact_id()::text, pg_backend_pid(), p_entity, p_record_id, p_new_status
  ) ON CONFLICT DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION internal_academic.resolve_responsavel(p_claimed uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_current uuid;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    IF p_claimed IS NULL THEN RETURN NULL; END IF;
    SELECT u.id INTO v_current FROM public.usuarios_sistema u
    WHERE u.id = p_claimed AND public.is_active_status(u.status);
    IF v_current IS NULL THEN RAISE EXCEPTION 'Responsável de serviço inválido.'; END IF;
    RETURN v_current;
  END IF;
  SELECT u.id INTO v_current FROM public.usuarios_sistema u
  WHERE lower(u.email) = public.auth_email() AND public.is_active_status(u.status)
  LIMIT 1;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Gestor autenticado não identificado.'; END IF;
  IF p_claimed IS NOT NULL AND p_claimed <> v_current THEN
    RAISE EXCEPTION 'O responsável informado não corresponde ao usuário autenticado.';
  END IF;
  RETURN v_current;
END;
$$;

REVOKE EXECUTE ON FUNCTION internal_academic.authorize_transition(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal_academic.resolve_responsavel(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_technical_turma_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tecnico boolean; v_old_tecnico boolean := false; v_authorized boolean;
BEGIN
  SELECT c.modalidade = 'TECNICO' INTO v_tecnico
  FROM public.cursos c WHERE c.id = NEW.curso_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT c.modalidade = 'TECNICO' INTO v_old_tecnico
    FROM public.cursos c WHERE c.id = OLD.curso_id;
    IF (coalesce(v_old_tecnico, false) OR coalesce(v_tecnico, false))
      AND NEW.curso_id IS DISTINCT FROM OLD.curso_id THEN
      RAISE EXCEPTION 'O curso de uma turma técnica existente não pode ser alterado.';
    END IF;
  END IF;
  IF NOT coalesce(v_tecnico, false) THEN RETURN NEW; END IF;
  IF NEW.status = 'INSCRICOES_ABERTAS' AND (
    NOT coalesce(NEW.permitir_inscricoes_online, false)
    OR (NEW.data_inicio_inscricao IS NOT NULL
      AND (pg_catalog.timezone('America/Maceio', now()))::date < NEW.data_inicio_inscricao)
    OR (NEW.data_fim_inscricao IS NOT NULL
      AND (pg_catalog.timezone('America/Maceio', now()))::date > NEW.data_fim_inscricao)
  ) THEN
    RAISE EXCEPTION 'Inscrições abertas exigem permissão online e janela vigente.';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('PLANEJADA', 'INSCRICOES_ABERTAS') THEN
      RAISE EXCEPTION 'Turma técnica nova deve ser planejada ou estar com inscrições abertas.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    DELETE FROM internal_academic.transition_authorizations a
    WHERE a.transaction_id = pg_current_xact_id()::text
      AND a.backend_pid = pg_backend_pid() AND a.entity = 'TURMA_STATUS'
      AND a.record_id = NEW.id AND a.new_status = NEW.status
    RETURNING true INTO v_authorized;
    IF NOT coalesce(v_authorized, false) THEN
      RAISE EXCEPTION 'Altere a fase da turma técnica somente pelas ações do ciclo acadêmico.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_technical_turma_status()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_technical_turma_status_trigger ON public.turmas;
CREATE TRIGGER enforce_technical_turma_status_trigger
BEFORE INSERT OR UPDATE ON public.turmas
FOR EACH ROW EXECUTE FUNCTION public.enforce_technical_turma_status();

CREATE OR REPLACE FUNCTION public.enforce_technical_period_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tecnico boolean; v_old_tecnico boolean := false; v_authorized boolean;
BEGIN
  SELECT c.modalidade = 'TECNICO' INTO v_tecnico
  FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = NEW.turma_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT c.modalidade = 'TECNICO' INTO v_old_tecnico
    FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = OLD.turma_id;
    IF (coalesce(v_old_tecnico, false) OR coalesce(v_tecnico, false)) AND (
      NEW.turma_id IS DISTINCT FROM OLD.turma_id
      OR NEW.modulo_id IS DISTINCT FROM OLD.modulo_id
    ) THEN
      RAISE EXCEPTION 'Turma e módulo de um período técnico existente não podem ser alterados.';
    END IF;
  END IF;
  IF NOT coalesce(v_tecnico, false) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'PLANEJADO' THEN
    RAISE EXCEPTION 'Período técnico novo deve iniciar como planejado.';
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    DELETE FROM internal_academic.transition_authorizations a
    WHERE a.transaction_id = pg_current_xact_id()::text
      AND a.backend_pid = pg_backend_pid() AND a.entity = 'PERIODO_STATUS'
      AND a.record_id = NEW.id AND a.new_status = NEW.status
    RETURNING true INTO v_authorized;
    IF NOT coalesce(v_authorized, false) THEN
      RAISE EXCEPTION 'Altere o período somente pelas ações do ciclo acadêmico.';
    END IF;
  END IF;
  IF NEW.status IN ('ABERTO', 'EM_FECHAMENTO') THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('technical_turma:' || NEW.turma_id::text, 0)
    );
    IF EXISTS (SELECT 1 FROM public.periodos_letivos pl
      WHERE pl.turma_id = NEW.turma_id AND pl.id IS DISTINCT FROM NEW.id
        AND pl.status IN ('ABERTO', 'EM_FECHAMENTO')) THEN
      RAISE EXCEPTION 'Já existe um período operacional aberto nesta turma técnica.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_technical_period_status()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_technical_period_status_trigger ON public.periodos_letivos;
CREATE TRIGGER enforce_technical_period_status_trigger
BEFORE INSERT OR UPDATE ON public.periodos_letivos
FOR EACH ROW EXECUTE FUNCTION public.enforce_technical_period_status();

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
    AND v_turma.status NOT IN ('PLANEJADA', 'INSCRICOES_ABERTAS') THEN
    RAISE EXCEPTION 'Novos períodos só podem ser criados antes do início da turma técnica.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF v_turma.status NOT IN ('PLANEJADA', 'INSCRICOES_ABERTAS')
      OR OLD.status <> 'PLANEJADO' THEN
      RAISE EXCEPTION 'Períodos operacionais ou históricos não podem ser excluídos.';
    END IF;
    RETURN OLD;
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

REVOKE EXECUTE ON FUNCTION public.protect_technical_period_structure()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_technical_period_structure_trigger ON public.periodos_letivos;
CREATE TRIGGER protect_technical_period_structure_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.periodos_letivos
FOR EACH ROW EXECUTE FUNCTION public.protect_technical_period_structure();

CREATE OR REPLACE FUNCTION public.validate_technical_class_dates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (NEW.data_inicio, NEW.data_previsao_termino)
      IS DISTINCT FROM (OLD.data_inicio, OLD.data_previsao_termino)
    AND EXISTS (SELECT 1 FROM public.cursos c
      WHERE c.id = NEW.curso_id AND c.modalidade = 'TECNICO')
    AND (NEW.status NOT IN ('PLANEJADA', 'INSCRICOES_ABERTAS')
      OR EXISTS (SELECT 1 FROM public.periodos_letivos pl
        WHERE pl.turma_id = NEW.id AND pl.status <> 'PLANEJADO')) THEN
    RAISE EXCEPTION 'Datas ficam bloqueadas após o início do ciclo acadêmico.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_technical_class_dates()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_technical_class_dates_trigger ON public.turmas;
CREATE TRIGGER validate_technical_class_dates_trigger
BEFORE UPDATE OF data_inicio, data_previsao_termino ON public.turmas
FOR EACH ROW EXECUTE FUNCTION public.validate_technical_class_dates();

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

REVOKE EXECUTE ON FUNCTION public.validate_technical_period_dates()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_technical_period_dates_trigger ON public.periodos_letivos;
CREATE TRIGGER validate_technical_period_dates_trigger
BEFORE INSERT OR UPDATE OF turma_id, data_inicio, data_fim ON public.periodos_letivos
FOR EACH ROW EXECUTE FUNCTION public.validate_technical_period_dates();

CREATE OR REPLACE FUNCTION public.sincronizar_periodos_turma_tecnica()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer; v_days integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cursos c
    WHERE c.id = NEW.curso_id AND c.modalidade = 'TECNICO') THEN RETURN NEW; END IF;
  SELECT count(*)::integer INTO v_count FROM public.modulos m WHERE m.curso_id = NEW.curso_id;
  IF v_count = 0 THEN RETURN NEW; END IF;
  IF NEW.data_inicio IS NULL OR NEW.data_previsao_termino IS NULL THEN
    RAISE EXCEPTION 'Turma técnica exige datas inicial e final.';
  END IF;
  v_days := NEW.data_previsao_termino - NEW.data_inicio + 1;
  IF v_days < v_count THEN RAISE EXCEPTION 'Informe ao menos um dia por módulo.'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.data_inicio, NEW.data_previsao_termino)
    IS DISTINCT FROM (OLD.data_inicio, OLD.data_previsao_termino) THEN
    PERFORM internal_academic.authorize_transition(
      'TURMA_DISCIPLINA_RELINK:' || NEW.id::text,
      td.disciplina_id,
      'PERIODO_NULL'
    )
    FROM public.turmas_disciplinas td
    WHERE td.turma_id = NEW.id AND td.periodo_letivo_id IS NOT NULL;
    DELETE FROM public.periodos_letivos WHERE turma_id = NEW.id;
  END IF;
  INSERT INTO public.periodos_letivos
    (turma_id, modulo_id, nome, ordem, data_inicio, data_fim, status)
  SELECT NEW.id, x.id, x.nome, x.pos,
    NEW.data_inicio + floor(v_days::numeric * (x.pos - 1) / x.total)::integer,
    NEW.data_inicio + floor(v_days::numeric * x.pos / x.total)::integer - 1,
    'PLANEJADO'
  FROM (SELECT m.id, m.nome,
    row_number() OVER (ORDER BY m.created_at, m.nome, m.id)::integer pos,
    count(*) OVER ()::integer total
    FROM public.modulos m WHERE m.curso_id = NEW.curso_id) x
  ON CONFLICT (turma_id, modulo_id) DO NOTHING;
  INSERT INTO public.turmas_disciplinas
    (turma_id, disciplina_id, periodo_letivo_id, concluida)
  SELECT NEW.id, d.id, pl.id, false
  FROM public.disciplinas d JOIN public.modulos m ON m.id = d.modulo_id
  JOIN public.periodos_letivos pl ON pl.turma_id = NEW.id AND pl.modulo_id = m.id
  WHERE m.curso_id = NEW.curso_id
  ON CONFLICT (turma_id, disciplina_id) DO UPDATE
    SET periodo_letivo_id = EXCLUDED.periodo_letivo_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sincronizar_periodos_turma_tecnica()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sincronizar_periodos_turma_tecnica_trigger ON public.turmas;
CREATE TRIGGER sincronizar_periodos_turma_tecnica_trigger
AFTER INSERT OR UPDATE OF data_inicio, data_previsao_termino ON public.turmas
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_periodos_turma_tecnica();
