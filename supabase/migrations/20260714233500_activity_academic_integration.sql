-- Integra atividades à carga horária sem corrida concorrente e ao diário seguro.

CREATE OR REPLACE FUNCTION public.validate_turma_disciplina_carga_horaria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_limite NUMERIC;
  v_total_aulas NUMERIC := 0;
  v_total_atividades NUMERIC := 0;
  v_total_novo NUMERIC := 0;
  v_contribuicao_antiga NUMERIC := 0;
  v_contribuicao_nova NUMERIC := 0;
BEGIN
  -- A regra nova é exclusiva do técnico para não alterar EAD/LIVRE/ESP.
  IF NOT EXISTS (
    SELECT 1 FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = NEW.turma_id AND c.modalidade = 'TECNICO'
  ) THEN
    RETURN NEW;
  END IF;

  -- Lock lógico evita depender do UPDATE/RLS da tabela de disciplinas.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'technical_workload:' || NEW.turma_id::text || ':' || NEW.disciplina_id::text,
    0
  ));
  SELECT coalesce(d.carga_horaria, 0)
  INTO v_limite
  FROM public.disciplinas d
  WHERE d.id = NEW.disciplina_id;

  IF v_limite IS NULL OR v_limite <= 0 THEN RETURN NEW; END IF;

  SELECT coalesce(sum(a.carga_horaria), 0)
  INTO v_total_aulas
  FROM public.aulas_turma a
  WHERE a.turma_id = NEW.turma_id
    AND a.disciplina_id = NEW.disciplina_id
    AND (TG_TABLE_NAME <> 'aulas_turma' OR a.id <> NEW.id);

  SELECT coalesce(sum(ae.carga_horaria_compensacao), 0)
  INTO v_total_atividades
  FROM public.atividades_extra_classe ae
  WHERE ae.turma_id = NEW.turma_id
    AND ae.disciplina_id = NEW.disciplina_id
    AND ae.status = 'PUBLICADA'
    AND (TG_TABLE_NAME <> 'atividades_extra_classe' OR ae.id <> NEW.id);

  IF TG_TABLE_NAME = 'aulas_turma' THEN
    v_contribuicao_nova := coalesce(NEW.carga_horaria, 0);
    IF TG_OP = 'UPDATE'
      AND OLD.turma_id = NEW.turma_id
      AND OLD.disciplina_id = NEW.disciplina_id THEN
      v_contribuicao_antiga := coalesce(OLD.carga_horaria, 0);
    END IF;
  ELSE
    IF NEW.status = 'PUBLICADA' THEN
      v_contribuicao_nova := coalesce(NEW.carga_horaria_compensacao, 0);
    END IF;
    IF TG_OP = 'UPDATE'
      AND OLD.turma_id = NEW.turma_id
      AND OLD.disciplina_id = NEW.disciplina_id
      AND OLD.status = 'PUBLICADA' THEN
      v_contribuicao_antiga := coalesce(OLD.carga_horaria_compensacao, 0);
    END IF;
  END IF;

  v_total_novo := v_total_aulas + v_total_atividades + v_contribuicao_nova;
  IF v_total_novo > v_limite AND v_contribuicao_nova > v_contribuicao_antiga THEN
    RAISE EXCEPTION 'Carga horaria excedida. Limite: %h; total planejado: %h.',
      trim(to_char(v_limite, 'FM999999990.00')),
      trim(to_char(v_total_novo, 'FM999999990.00'))
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_aulas_turma_carga_horaria ON public.aulas_turma;
CREATE TRIGGER validate_aulas_turma_carga_horaria
  BEFORE INSERT OR UPDATE ON public.aulas_turma
  FOR EACH ROW EXECUTE FUNCTION public.validate_turma_disciplina_carga_horaria();

DROP TRIGGER IF EXISTS validate_atividades_extra_carga_horaria
  ON public.atividades_extra_classe;
CREATE TRIGGER validate_atividades_extra_carga_horaria
  BEFORE INSERT OR UPDATE ON public.atividades_extra_classe
  FOR EACH ROW EXECUTE FUNCTION public.validate_turma_disciplina_carga_horaria();

-- Função exclusiva de trigger: não deve aparecer como RPC pública.
REVOKE EXECUTE ON FUNCTION public.validate_turma_disciplina_carga_horaria()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_access_atividade_extra_turma(p_turma_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT public.can_student_read_atividade_extra(p_turma_id))
    OR (SELECT public.can_write_turma(p_turma_id))
    OR (SELECT public.is_professor_assigned_turma(p_turma_id));
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_atividade_extra_turma(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_atividade_extra_turma(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_diarios_turma(p_turma_id UUID)
RETURNS TABLE (
  modulo_id UUID, modulo_nome TEXT, periodo_letivo_id UUID, periodo_status TEXT,
  disciplina_id UUID, disciplina_nome TEXT, professor_nome TEXT,
  carga_horaria NUMERIC, horas_realizadas NUMERIC, aulas_count BIGINT,
  progresso_percent NUMERIC, horas_status TEXT, horas_diferenca NUMERIC,
  concluida BOOLEAN, modulo_total_disciplinas BIGINT,
  modulo_progresso_percent NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH allowed_turma AS (
    SELECT t.id FROM public.turmas t
    WHERE t.id = p_turma_id
      AND (SELECT public.can_access_atividade_extra_turma(t.id))
  ), horas_aulas AS (
    SELECT disciplina_id, sum(carga_horaria) AS realizadas, count(*) AS quantidade
    FROM public.aulas_turma
    WHERE turma_id = p_turma_id AND EXISTS (SELECT 1 FROM allowed_turma)
    GROUP BY disciplina_id
  ), horas_atividades AS (
    SELECT disciplina_id, sum(carga_horaria_compensacao) AS realizadas
    FROM public.atividades_extra_classe
    WHERE turma_id = p_turma_id
      AND EXISTS (SELECT 1 FROM allowed_turma)
      AND status = 'PUBLICADA'
      AND (
        prazo_entrega IS NULL
        OR prazo_entrega <= (pg_catalog.timezone('America/Maceio', now()))::date
      )
    GROUP BY disciplina_id
  ), horas AS (
    SELECT coalesce(ha.disciplina_id, he.disciplina_id) AS disciplina_id,
      coalesce(ha.realizadas, 0) + coalesce(he.realizadas, 0) AS realizadas,
      coalesce(ha.quantidade, 0) AS quantidade_aulas
    FROM horas_aulas ha FULL JOIN horas_atividades he USING (disciplina_id)
  )
  SELECT mo.id, mo.nome, pl.id, coalesce(pl.status, 'ABERTO'), d.id, d.nome,
    coalesce(td.professor_nome, 'Não atribuído'), d.carga_horaria,
    coalesce(h.realizadas, 0), coalesce(h.quantidade_aulas, 0),
    CASE WHEN d.carga_horaria > 0 THEN least(100,
      round((coalesce(h.realizadas, 0) / d.carga_horaria) * 100, 1)) ELSE 0 END,
    CASE WHEN coalesce(h.realizadas, 0) = d.carga_horaria THEN 'EXATA'
      WHEN coalesce(h.realizadas, 0) > d.carga_horaria THEN 'EXCESSO'
      ELSE 'PENDENTE' END,
    abs(d.carga_horaria - coalesce(h.realizadas, 0)),
    coalesce(td.concluida, false), count(*) OVER (PARTITION BY mo.id),
    round((count(*) FILTER (WHERE coalesce(td.concluida, false))
      OVER (PARTITION BY mo.id))::numeric
      / nullif(count(*) OVER (PARTITION BY mo.id), 0) * 100)
  FROM public.turmas t
  JOIN allowed_turma allowed ON allowed.id = t.id
  JOIN public.modulos mo ON mo.curso_id = t.curso_id
  JOIN public.disciplinas d ON d.modulo_id = mo.id
  LEFT JOIN public.turmas_disciplinas td
    ON td.turma_id = t.id AND td.disciplina_id = d.id
  LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
  LEFT JOIN horas h ON h.disciplina_id = d.id
  WHERE t.id = p_turma_id
  ORDER BY pl.ordem NULLS LAST, mo.created_at, d.created_at, d.nome;
$$;

REVOKE EXECUTE ON FUNCTION public.get_diarios_turma(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_diarios_turma(UUID) TO authenticated, service_role;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.atividades_extra_classe;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.atividade_extra_classe_respostas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
