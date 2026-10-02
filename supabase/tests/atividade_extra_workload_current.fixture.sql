-- Read-only function snapshot verified against the target database on 2026-10-02.
-- Isolated test dependency: preserves the current SECURITY DEFINER workload rule
-- and per-class/discipline authorized exceptions. Never apply this fixture remotely.
CREATE OR REPLACE FUNCTION public.validate_turma_disciplina_carga_horaria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_limite numeric;
  v_total_aulas numeric := 0;
  v_total_atividades numeric := 0;
  v_total_novo numeric := 0;
  v_contribuicao_antiga numeric := 0;
  v_contribuicao_nova numeric := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE turma.id = NEW.turma_id
      AND curso.modalidade = 'TECNICO'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'technical_workload:'
        || NEW.turma_id::text
        || ':'
        || NEW.disciplina_id::text,
      0
    )
  );

  SELECT greatest(
    coalesce(disciplina.carga_horaria, 0),
    coalesce(excecao.limite_autorizado, 0)
  )
  INTO v_limite
  FROM public.disciplinas disciplina
  LEFT JOIN public.turma_disciplina_carga_excecoes excecao
    ON excecao.turma_id = NEW.turma_id
   AND excecao.disciplina_id = disciplina.id
  WHERE disciplina.id = NEW.disciplina_id;

  IF v_limite IS NULL OR v_limite <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(aula.carga_horaria), 0)
  INTO v_total_aulas
  FROM public.aulas_turma aula
  WHERE aula.turma_id = NEW.turma_id
    AND aula.disciplina_id = NEW.disciplina_id
    AND (TG_TABLE_NAME <> 'aulas_turma' OR aula.id <> NEW.id);

  SELECT coalesce(sum(atividade.carga_horaria_compensacao), 0)
  INTO v_total_atividades
  FROM public.atividades_extra_classe atividade
  WHERE atividade.turma_id = NEW.turma_id
    AND atividade.disciplina_id = NEW.disciplina_id
    AND atividade.status = 'PUBLICADA'
    AND (
      TG_TABLE_NAME <> 'atividades_extra_classe'
      OR atividade.id <> NEW.id
    );

  IF TG_TABLE_NAME = 'aulas_turma' THEN
    v_contribuicao_nova := coalesce(NEW.carga_horaria, 0);
    IF TG_OP = 'UPDATE'
      AND OLD.turma_id = NEW.turma_id
      AND OLD.disciplina_id = NEW.disciplina_id
    THEN
      v_contribuicao_antiga := coalesce(OLD.carga_horaria, 0);
    END IF;
  ELSE
    IF NEW.status = 'PUBLICADA' THEN
      v_contribuicao_nova :=
        coalesce(NEW.carga_horaria_compensacao, 0);
    END IF;
    IF TG_OP = 'UPDATE'
      AND OLD.turma_id = NEW.turma_id
      AND OLD.disciplina_id = NEW.disciplina_id
      AND OLD.status = 'PUBLICADA'
    THEN
      v_contribuicao_antiga :=
        coalesce(OLD.carga_horaria_compensacao, 0);
    END IF;
  END IF;

  v_total_novo :=
    v_total_aulas + v_total_atividades + v_contribuicao_nova;

  IF v_total_novo > v_limite
    AND v_contribuicao_nova > v_contribuicao_antiga
  THEN
    RAISE EXCEPTION
      'Carga horaria excedida. Limite: %h; total planejado: %h.',
      trim(to_char(v_limite, 'FM999999990.00')),
      trim(to_char(v_total_novo, 'FM999999990.00'))
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;
