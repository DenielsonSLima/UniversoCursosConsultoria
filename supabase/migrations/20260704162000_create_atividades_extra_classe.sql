-- Atividades extra-classe para complementar carga horaria por turma/disciplina.

CREATE TABLE IF NOT EXISTS public.atividades_extra_classe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tema TEXT,
  tipo_resposta TEXT NOT NULL DEFAULT 'TEXTO'
    CHECK (tipo_resposta IN ('TEXTO', 'PERGUNTAS', 'ENVIO', 'MISTO')),
  texto TEXT,
  video_url TEXT,
  perguntas JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(perguntas) = 'array'),
  carga_horaria_compensacao NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (carga_horaria_compensacao >= 0),
  prazo_entrega DATE,
  status TEXT NOT NULL DEFAULT 'PUBLICADA'
    CHECK (status IN ('RASCUNHO', 'PUBLICADA', 'ARQUIVADA')),
  criado_por_tipo TEXT
    CHECK (criado_por_tipo IS NULL OR criado_por_tipo IN ('GESTOR', 'PROFESSOR')),
  criado_por_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.atividade_extra_classe_respostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES public.atividades_extra_classe(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  resposta_texto TEXT,
  respostas JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(respostas) = 'array'),
  anexo_url TEXT,
  status TEXT NOT NULL DEFAULT 'ENTREGUE'
    CHECK (status IN ('PENDENTE', 'ENTREGUE', 'CORRIGIDA')),
  nota NUMERIC(5,2) CHECK (nota IS NULL OR (nota >= 0 AND nota <= 10)),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (atividade_id, aluno_id)
);

CREATE INDEX IF NOT EXISTS idx_atividades_extra_classe_turma_disciplina
  ON public.atividades_extra_classe (turma_id, disciplina_id);

CREATE INDEX IF NOT EXISTS idx_atividades_extra_classe_status
  ON public.atividades_extra_classe (status)
  WHERE status <> 'ARQUIVADA';

CREATE INDEX IF NOT EXISTS idx_atividade_extra_respostas_atividade
  ON public.atividade_extra_classe_respostas (atividade_id);

CREATE INDEX IF NOT EXISTS idx_atividade_extra_respostas_aluno
  ON public.atividade_extra_classe_respostas (aluno_id);

CREATE INDEX IF NOT EXISTS idx_matriculas_turma_aluno_status
  ON public.matriculas (turma_id, aluno_id, status);

ALTER TABLE public.atividades_extra_classe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividade_extra_classe_respostas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_atividade_extra_classe_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_atividades_extra_classe_updated_at
  ON public.atividades_extra_classe;
CREATE TRIGGER touch_atividades_extra_classe_updated_at
  BEFORE UPDATE ON public.atividades_extra_classe
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_atividade_extra_classe_updated_at();

DROP TRIGGER IF EXISTS touch_atividade_extra_respostas_updated_at
  ON public.atividade_extra_classe_respostas;
CREATE TRIGGER touch_atividade_extra_respostas_updated_at
  BEFORE UPDATE ON public.atividade_extra_classe_respostas
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_atividade_extra_classe_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_atividade_extra_resposta_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.atividade_id IS DISTINCT FROM OLD.atividade_id
    OR NEW.aluno_id IS DISTINCT FROM OLD.aluno_id THEN
    RAISE EXCEPTION 'Não é permitido alterar o aluno ou a atividade da resposta.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_atividade_extra_resposta_identity_change
  ON public.atividade_extra_classe_respostas;
CREATE TRIGGER prevent_atividade_extra_resposta_identity_change
  BEFORE UPDATE ON public.atividade_extra_classe_respostas
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_atividade_extra_resposta_identity_change();

CREATE OR REPLACE FUNCTION public.validate_turma_disciplina_carga_horaria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_turma_id UUID;
  v_disciplina_id UUID;
  v_limite NUMERIC;
  v_total_aulas NUMERIC := 0;
  v_total_atividades NUMERIC := 0;
  v_old_total NUMERIC := 0;
  v_total NUMERIC := 0;
  v_excesso NUMERIC := 0;
BEGIN
  v_turma_id := NEW.turma_id;
  v_disciplina_id := NEW.disciplina_id;

  SELECT COALESCE(d.carga_horaria, 0)
    INTO v_limite
  FROM public.disciplinas d
  WHERE d.id = v_disciplina_id;

  IF v_limite IS NULL OR v_limite <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(a.carga_horaria), 0)
    INTO v_total_aulas
  FROM public.aulas_turma a
  WHERE a.turma_id = v_turma_id
    AND a.disciplina_id = v_disciplina_id
    AND (
      TG_TABLE_NAME <> 'aulas_turma'
      OR a.id <> NEW.id
    );

  SELECT COALESCE(SUM(ae.carga_horaria_compensacao), 0)
    INTO v_total_atividades
  FROM public.atividades_extra_classe ae
  WHERE ae.turma_id = v_turma_id
    AND ae.disciplina_id = v_disciplina_id
    AND ae.status <> 'ARQUIVADA'
    AND (
      TG_TABLE_NAME <> 'atividades_extra_classe'
      OR ae.id <> NEW.id
    );

  v_old_total := v_total_aulas + v_total_atividades;

  IF TG_OP = 'UPDATE'
    AND TG_TABLE_NAME = 'aulas_turma'
    AND OLD.turma_id = NEW.turma_id
    AND OLD.disciplina_id = NEW.disciplina_id THEN
    v_old_total := v_old_total + COALESCE(OLD.carga_horaria, 0);
  ELSIF TG_OP = 'UPDATE'
    AND TG_TABLE_NAME = 'atividades_extra_classe'
    AND OLD.turma_id = NEW.turma_id
    AND OLD.disciplina_id = NEW.disciplina_id
    AND OLD.status <> 'ARQUIVADA' THEN
    v_old_total := v_old_total + COALESCE(OLD.carga_horaria_compensacao, 0);
  END IF;

  IF TG_TABLE_NAME = 'aulas_turma' THEN
    v_total := v_total_aulas + v_total_atividades + COALESCE(NEW.carga_horaria, 0);
  ELSE
    v_total := v_total_aulas + v_total_atividades;
    IF NEW.status <> 'ARQUIVADA' THEN
      v_total := v_total + COALESCE(NEW.carga_horaria_compensacao, 0);
    END IF;
  END IF;

  IF v_total > v_limite AND v_total > v_old_total THEN
    v_excesso := v_total - v_limite;
    RAISE EXCEPTION 'Carga horaria excedida em %h. Limite da disciplina: %h; total planejado: %h.',
      trim(to_char(v_excesso, 'FM999999990.00')),
      trim(to_char(v_limite, 'FM999999990.00')),
      trim(to_char(v_total, 'FM999999990.00'))
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_aulas_turma_carga_horaria
  ON public.aulas_turma;
CREATE TRIGGER validate_aulas_turma_carga_horaria
  BEFORE INSERT OR UPDATE ON public.aulas_turma
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_turma_disciplina_carga_horaria();

DROP TRIGGER IF EXISTS validate_atividades_extra_classe_carga_horaria
  ON public.atividades_extra_classe;
CREATE TRIGGER validate_atividades_extra_classe_carga_horaria
  BEFORE INSERT OR UPDATE ON public.atividades_extra_classe
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_turma_disciplina_carga_horaria();

CREATE OR REPLACE FUNCTION public.is_aluno_matriculado_turma_status(
  p_turma_id uuid,
  p_statuses text[] DEFAULT ARRAY['ATIVO', 'CONCLUIDO']::text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas m
    WHERE m.turma_id = p_turma_id
      AND m.aluno_id = (SELECT public.current_aluno_id())
      AND upper(coalesce(m.status, '')) = ANY(p_statuses)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_atividade_extra_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas t
    WHERE t.id = p_turma_id
      AND (
        (SELECT public.can_write_turma(t.id))
        OR public.is_professor_assigned_turma(t.id)
        OR public.is_aluno_matriculado_turma_status(t.id, ARRAY['ATIVO', 'CONCLUIDO']::text[])
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_answer_atividade_extra_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_aluno_matriculado_turma_status(p_turma_id, ARRAY['ATIVO']::text[]);
$$;

CREATE OR REPLACE FUNCTION public.is_professor_assigned_disciplina_periodo_open(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas_disciplinas td
    JOIN public.turmas t ON t.id = td.turma_id
    LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
    WHERE td.turma_id = p_turma_id
      AND td.disciplina_id = p_disciplina_id
      AND td.professor_id = (SELECT public.current_professor_id())
      AND upper(coalesce(t.status, '')) <> 'FINALIZADA'
      AND upper(coalesce(pl.status, 'ABERTO')) <> 'FECHADO'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_aluno_matriculado_turma_status(uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_atividade_extra_turma(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_answer_atividade_extra_turma(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_professor_assigned_disciplina_periodo_open(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_aluno_matriculado_turma_status(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_atividade_extra_turma(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_answer_atividade_extra_turma(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_professor_assigned_disciplina_periodo_open(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "portal_atividades_extra_select" ON public.atividades_extra_classe;
DROP POLICY IF EXISTS "portal_atividades_extra_insert" ON public.atividades_extra_classe;
DROP POLICY IF EXISTS "portal_atividades_extra_update" ON public.atividades_extra_classe;
DROP POLICY IF EXISTS "portal_atividades_extra_delete" ON public.atividades_extra_classe;

CREATE POLICY "portal_atividades_extra_select"
  ON public.atividades_extra_classe FOR SELECT
  TO authenticated
  USING ((SELECT public.can_access_atividade_extra_turma(turma_id)));

CREATE POLICY "portal_atividades_extra_insert"
  ON public.atividades_extra_classe FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.can_write_turma(turma_id))
    OR public.is_professor_assigned_disciplina_periodo_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_atividades_extra_update"
  ON public.atividades_extra_classe FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.can_write_turma(turma_id))
    OR public.is_professor_assigned_disciplina_periodo_open(turma_id, disciplina_id)
  )
  WITH CHECK (
    (SELECT public.can_write_turma(turma_id))
    OR public.is_professor_assigned_disciplina_periodo_open(turma_id, disciplina_id)
  );

CREATE POLICY "portal_atividades_extra_delete"
  ON public.atividades_extra_classe FOR DELETE
  TO authenticated
  USING (
    (SELECT public.can_write_turma(turma_id))
    OR public.is_professor_assigned_disciplina_periodo_open(turma_id, disciplina_id)
  );

DROP POLICY IF EXISTS "portal_atividade_extra_respostas_select" ON public.atividade_extra_classe_respostas;
DROP POLICY IF EXISTS "portal_atividade_extra_respostas_insert" ON public.atividade_extra_classe_respostas;
DROP POLICY IF EXISTS "portal_atividade_extra_respostas_update" ON public.atividade_extra_classe_respostas;
DROP POLICY IF EXISTS "portal_atividade_extra_respostas_delete" ON public.atividade_extra_classe_respostas;

CREATE POLICY "portal_atividade_extra_respostas_select"
  ON public.atividade_extra_classe_respostas FOR SELECT
  TO authenticated
  USING (
    (
      aluno_id = (SELECT public.current_aluno_id())
      AND EXISTS (
        SELECT 1
        FROM public.atividades_extra_classe ae
        WHERE ae.id = atividade_id
          AND ae.status = 'PUBLICADA'
          AND public.can_access_atividade_extra_turma(ae.turma_id)
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.atividades_extra_classe ae
      WHERE ae.id = atividade_id
        AND (
          (SELECT public.can_write_turma(ae.turma_id))
          OR public.is_professor_assigned_disciplina(ae.turma_id, ae.disciplina_id)
        )
    )
  );

CREATE POLICY "portal_atividade_extra_respostas_insert"
  ON public.atividade_extra_classe_respostas FOR INSERT
  TO authenticated
  WITH CHECK (
    aluno_id = (SELECT public.current_aluno_id())
    AND status = 'ENTREGUE'
    AND nota IS NULL
    AND feedback IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.atividades_extra_classe ae
      WHERE ae.id = atividade_id
        AND ae.status = 'PUBLICADA'
        AND public.can_answer_atividade_extra_turma(ae.turma_id)
    )
  );

CREATE POLICY "portal_atividade_extra_respostas_update"
  ON public.atividade_extra_classe_respostas FOR UPDATE
  TO authenticated
  USING (
    (
      aluno_id = (SELECT public.current_aluno_id())
      AND status <> 'CORRIGIDA'
      AND EXISTS (
        SELECT 1
        FROM public.atividades_extra_classe ae
        WHERE ae.id = atividade_id
          AND ae.status = 'PUBLICADA'
          AND public.can_answer_atividade_extra_turma(ae.turma_id)
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.atividades_extra_classe ae
      WHERE ae.id = atividade_id
        AND (
          (SELECT public.can_write_turma(ae.turma_id))
          OR public.is_professor_assigned_disciplina_periodo_open(ae.turma_id, ae.disciplina_id)
        )
    )
  )
  WITH CHECK (
    (
      aluno_id = (SELECT public.current_aluno_id())
      AND status = 'ENTREGUE'
      AND nota IS NULL
      AND feedback IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.atividades_extra_classe ae
        WHERE ae.id = atividade_id
          AND ae.status = 'PUBLICADA'
          AND public.can_answer_atividade_extra_turma(ae.turma_id)
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.atividades_extra_classe ae
      WHERE ae.id = atividade_id
        AND (
          (SELECT public.can_write_turma(ae.turma_id))
          OR public.is_professor_assigned_disciplina_periodo_open(ae.turma_id, ae.disciplina_id)
        )
    )
  );

CREATE POLICY "portal_atividade_extra_respostas_delete"
  ON public.atividade_extra_classe_respostas FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.atividades_extra_classe ae
      WHERE ae.id = atividade_id
        AND (
          (SELECT public.can_write_turma(ae.turma_id))
          OR public.is_professor_assigned_disciplina_periodo_open(ae.turma_id, ae.disciplina_id)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.get_diarios_turma(
  p_turma_id UUID
)
RETURNS TABLE (
  modulo_id UUID,
  modulo_nome TEXT,
  periodo_letivo_id UUID,
  periodo_status TEXT,
  disciplina_id UUID,
  disciplina_nome TEXT,
  professor_nome TEXT,
  carga_horaria NUMERIC,
  horas_realizadas NUMERIC,
  aulas_count BIGINT,
  progresso_percent NUMERIC,
  horas_status TEXT,
  horas_diferenca NUMERIC,
  concluida BOOLEAN,
  modulo_total_disciplinas BIGINT,
  modulo_progresso_percent NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed_turma AS (
    SELECT t.id
    FROM public.turmas t
    WHERE t.id = p_turma_id
      AND public.can_access_atividade_extra_turma(t.id)
  ),
  horas_aulas AS (
    SELECT disciplina_id, SUM(carga_horaria) AS realizadas, COUNT(*) AS quantidade
    FROM public.aulas_turma
    WHERE turma_id = p_turma_id
      AND EXISTS (SELECT 1 FROM allowed_turma)
    GROUP BY disciplina_id
  ),
  horas_atividades AS (
    SELECT disciplina_id, SUM(carga_horaria_compensacao) AS realizadas, COUNT(*) AS quantidade
    FROM public.atividades_extra_classe
    WHERE turma_id = p_turma_id
      AND EXISTS (SELECT 1 FROM allowed_turma)
      AND status <> 'ARQUIVADA'
    GROUP BY disciplina_id
  ),
  horas AS (
    SELECT
      COALESCE(ha.disciplina_id, he.disciplina_id) AS disciplina_id,
      COALESCE(ha.realizadas, 0) + COALESCE(he.realizadas, 0) AS realizadas,
      COALESCE(ha.quantidade, 0) AS quantidade_aulas
    FROM horas_aulas ha
    FULL OUTER JOIN horas_atividades he ON he.disciplina_id = ha.disciplina_id
  )
  SELECT
    mo.id,
    mo.nome,
    pl.id,
    COALESCE(pl.status, 'ABERTO'),
    d.id,
    d.nome,
    COALESCE(td.professor_nome, 'Não atribuído'),
    d.carga_horaria,
    COALESCE(h.realizadas, 0),
    COALESCE(h.quantidade_aulas, 0),
    CASE
      WHEN d.carga_horaria > 0
        THEN LEAST(100, ROUND((COALESCE(h.realizadas, 0) / d.carga_horaria) * 100, 1))
      ELSE 0
    END,
    CASE
      WHEN COALESCE(h.realizadas, 0) = d.carga_horaria THEN 'EXATA'
      WHEN COALESCE(h.realizadas, 0) > d.carga_horaria THEN 'EXCESSO'
      ELSE 'PENDENTE'
    END,
    ABS(d.carga_horaria - COALESCE(h.realizadas, 0)),
    COALESCE(td.concluida, FALSE),
    COUNT(*) OVER (PARTITION BY mo.id),
    ROUND(
      (
        (
          COUNT(*) FILTER (WHERE COALESCE(td.concluida, FALSE))
          OVER (PARTITION BY mo.id)
        )::NUMERIC
        / NULLIF(COUNT(*) OVER (PARTITION BY mo.id), 0)
      ) * 100
    )
  FROM public.turmas t
  JOIN allowed_turma at ON at.id = t.id
  JOIN public.modulos mo ON mo.curso_id = t.curso_id
  JOIN public.disciplinas d ON d.modulo_id = mo.id
  LEFT JOIN public.turmas_disciplinas td
    ON td.turma_id = t.id
   AND td.disciplina_id = d.id
  LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
  LEFT JOIN horas h ON h.disciplina_id = d.id
  WHERE t.id = p_turma_id
  ORDER BY pl.ordem NULLS LAST, mo.created_at, d.created_at, d.nome;
$$;

REVOKE EXECUTE ON FUNCTION public.get_diarios_turma(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_diarios_turma(UUID) TO authenticated, service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.atividades_extra_classe;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.atividade_extra_classe_respostas;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
