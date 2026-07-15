-- Corrige o ciclo acadêmico técnico sem reescrever o histórico existente.
-- 1. Regras acadêmicas passam a pertencer à turma.
-- 2. Frequência é calculada pela carga horária efetiva de cada aula.
-- 3. Transferências/retornos preservam aproveitamentos e auditoria.

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS frequencia_minima_percent numeric(5,2) NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS media_minima numeric(4,2) NOT NULL DEFAULT 6;

ALTER TABLE public.turmas
  DROP CONSTRAINT IF EXISTS turmas_frequencia_minima_percent_check;
ALTER TABLE public.turmas
  ADD CONSTRAINT turmas_frequencia_minima_percent_check
  CHECK (frequencia_minima_percent BETWEEN 0 AND 100);

ALTER TABLE public.turmas
  DROP CONSTRAINT IF EXISTS turmas_media_minima_check;
ALTER TABLE public.turmas
  ADD CONSTRAINT turmas_media_minima_check
  CHECK (media_minima BETWEEN 0 AND 10);

CREATE OR REPLACE FUNCTION public.validate_technical_turma_academic_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tecnico boolean := false;
BEGIN
  SELECT upper(coalesce(c.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
    INTO v_tecnico
  FROM public.cursos c
  WHERE c.id = NEW.curso_id;

  IF NOT coalesce(v_tecnico, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.frequencia_minima_percent < 75 OR NEW.frequencia_minima_percent > 100 THEN
    RAISE EXCEPTION 'A frequência mínima de turma técnica deve ficar entre 75%% e 100%%.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.media_minima < 0 OR NEW.media_minima > 10 THEN
    RAISE EXCEPTION 'A média mínima deve ficar entre 0 e 10.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW.frequencia_minima_percent IS DISTINCT FROM OLD.frequencia_minima_percent
      OR NEW.media_minima IS DISTINCT FROM OLD.media_minima
    )
    AND (
      EXISTS (SELECT 1 FROM public.diario_frequencia f WHERE f.turma_id = NEW.id)
      OR EXISTS (SELECT 1 FROM public.diario_notas n WHERE n.turma_id = NEW.id)
      OR EXISTS (SELECT 1 FROM public.matriculas_estagios e WHERE e.turma_id = NEW.id)
    ) THEN
    RAISE EXCEPTION 'As regras acadêmicas não podem mudar depois do primeiro lançamento.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_technical_turma_academic_rules()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_technical_turma_academic_rules_trigger
  ON public.turmas;
CREATE TRIGGER validate_technical_turma_academic_rules_trigger
BEFORE INSERT OR UPDATE OF curso_id, frequencia_minima_percent, media_minima
ON public.turmas
FOR EACH ROW EXECUTE FUNCTION public.validate_technical_turma_academic_rules();

ALTER TABLE public.matricula_movimentacoes
  DROP CONSTRAINT IF EXISTS matricula_movimentacoes_tipo_check;
ALTER TABLE public.matricula_movimentacoes
  ADD CONSTRAINT matricula_movimentacoes_tipo_check CHECK (tipo IN (
    'MATRICULA', 'TRANCAMENTO', 'CANCELAMENTO', 'DESISTENCIA', 'REATIVACAO',
    'RETORNO', 'TRANSFERENCIA_INTERNA', 'TRANSFERENCIA_EXTERNA_ENVIADA',
    'TRANSFERENCIA_EXTERNA_RECEBIDA', 'CONCLUSAO', 'REPROVACAO'
  ));

-- A versão anterior acessava NEW.data_movimentacao inclusive quando NEW era
-- uma transferência. A separação por TG_TABLE_NAME elimina o erro de record.
CREATE OR REPLACE FUNCTION public.stamp_and_authorize_academic_responsavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  v_data date;
BEGIN
  IF v_origem IS NULL AND v_destino IS NULL
    AND TG_TABLE_NAME = 'matricula_movimentacoes' THEN
    SELECT m.turma_id INTO v_origem
    FROM public.matriculas m
    WHERE m.id = NEW.matricula_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_origem_antiga := OLD.turma_origem_id;
    v_destino_antigo := OLD.turma_destino_id;
    IF v_origem_antiga IS NULL AND v_destino_antigo IS NULL
      AND TG_TABLE_NAME = 'matricula_movimentacoes' THEN
      SELECT m.turma_id INTO v_origem_antiga
      FROM public.matriculas m
      WHERE m.id = OLD.matricula_id;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id IN (v_origem, v_destino, v_origem_antiga, v_destino_antigo)
      AND upper(coalesce(c.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
  ) INTO v_tecnico;

  IF NOT v_tecnico THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Registros de auditoria técnica são imutáveis.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'matricula_movimentacoes' THEN
    v_data := nullif(to_jsonb(NEW) ->> 'data_movimentacao', '')::date;
    IF v_data = now()::date THEN
      NEW := jsonb_populate_record(
        NEW,
        jsonb_build_object(
          'data_movimentacao',
          (pg_catalog.timezone('America/Maceio', now()))::date
        )
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'transferencias_academicas' THEN
    v_data := nullif(to_jsonb(NEW) ->> 'data_transferencia', '')::date;
    IF v_data = now()::date THEN
      NEW := jsonb_populate_record(
        NEW,
        jsonb_build_object(
          'data_transferencia',
          (pg_catalog.timezone('America/Maceio', now()))::date
        )
      );
    END IF;
  END IF;

  SELECT t.status, t.curso_id,
         upper(coalesce(c.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
    INTO v_origem_status, v_origem_curso, v_origem_tecnica
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = v_origem;

  SELECT t.status, t.curso_id,
         upper(coalesce(c.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
    INTO v_destino_status, v_destino_curso, v_destino_tecnico
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = v_destino;

  IF TG_TABLE_NAME = 'transferencias_academicas' THEN
    IF (v_origem_tecnica AND v_origem_status <> 'EM_ANDAMENTO')
      OR (v_destino_tecnico AND v_destino_status <> 'EM_ANDAMENTO') THEN
      RAISE EXCEPTION 'Transferência técnica exige turmas em andamento.';
    END IF;
    IF NEW.tipo IN ('INTERNA_TURMA', 'INTERNA_POLO') AND (
      NOT coalesce(v_origem_tecnica, false)
      OR NOT coalesce(v_destino_tecnico, false)
      OR v_origem_curso IS DISTINCT FROM v_destino_curso
    ) THEN
      RAISE EXCEPTION 'Transferência técnica interna exige destino técnico do mesmo curso.';
    END IF;
  ELSIF NEW.tipo = 'MATRICULA' THEN
    IF (v_origem_tecnica AND v_origem_status NOT IN (
      'PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO'
    )) OR (v_destino_tecnico AND v_destino_status NOT IN (
      'PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO'
    )) THEN
      RAISE EXCEPTION 'Turma técnica finalizada não aceita matrícula.';
    END IF;
  ELSIF NEW.tipo = 'RETORNO' THEN
    IF NOT coalesce(v_origem_tecnica, false)
      OR NOT coalesce(v_destino_tecnico, false)
      OR v_origem_curso IS DISTINCT FROM v_destino_curso
      OR v_destino_status <> 'EM_ANDAMENTO' THEN
      RAISE EXCEPTION 'Retorno exige outra turma técnica em andamento do mesmo curso.';
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

  NEW.responsavel_id := CASE
    WHEN v_service_role
      THEN internal_academic.resolve_responsavel(NEW.responsavel_id)
    ELSE internal_academic.resolve_responsavel(NULL)
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stamp_and_authorize_academic_responsavel()
  FROM PUBLIC, anon, authenticated;

-- Resultado interno de uma matrícula, inclusive depois de transferência.
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
  WITH matricula AS (
    SELECT m.id, m.aluno_id, m.turma_id,
           t.frequencia_minima_percent, t.media_minima
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    WHERE m.id = p_matricula_id
  ),
  disciplinas AS (
    SELECT td.disciplina_id
    FROM public.turmas_disciplinas td
    JOIN matricula m ON m.turma_id = td.turma_id
  ),
  aulas AS (
    SELECT a.disciplina_id,
           count(*) AS total_aulas,
           sum(CASE WHEN a.carga_horaria > 0 THEN a.carga_horaria ELSE 1 END) AS total_horas
    FROM public.aulas_turma a
    JOIN matricula m ON m.turma_id = a.turma_id
    GROUP BY a.disciplina_id
  ),
  frequencias AS (
    SELECT f.disciplina_id,
           count(*) AS lancamentos,
           sum(CASE WHEN f.status = 'F' THEN 1 ELSE 0 END) AS faltas,
           sum(CASE WHEN f.status = 'F'
             THEN CASE WHEN a.carga_horaria > 0 THEN a.carga_horaria ELSE 1 END
             ELSE 0 END) AS horas_falta
    FROM public.diario_frequencia f
    JOIN public.aulas_turma a ON a.id = f.aula_id
    JOIN matricula m ON m.turma_id = f.turma_id AND m.aluno_id = f.aluno_id
    GROUP BY f.disciplina_id
  ),
  base AS (
    SELECT d.disciplina_id,
           ap.id AS aproveitamento_id,
           ap.media_final AS media_aproveitada,
           ap.frequencia_percent AS frequencia_aproveitada,
           n.nota_rec,
           CASE WHEN n.aluno_id IS NULL THEN NULL ELSE least(
             10.00,
             round(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0
               + n.nota_cq + n.nota_o)::numeric, 1)
           ) END AS media_parcial,
           CASE
             WHEN ap.id IS NOT NULL THEN ap.frequencia_percent
             WHEN a.total_horas > 0 AND coalesce(f.lancamentos, 0) = a.total_aulas
               THEN round(((a.total_horas - coalesce(f.horas_falta, 0))
                 / a.total_horas) * 100, 2)
             ELSE NULL
           END AS frequencia,
           m.frequencia_minima_percent,
           m.media_minima
    FROM disciplinas d
    CROSS JOIN matricula m
    LEFT JOIN aulas a ON a.disciplina_id = d.disciplina_id
    LEFT JOIN frequencias f ON f.disciplina_id = d.disciplina_id
    LEFT JOIN public.diario_notas n
      ON n.turma_id = m.turma_id
     AND n.disciplina_id = d.disciplina_id
     AND n.aluno_id = m.aluno_id
    LEFT JOIN public.matricula_aproveitamentos ap
      ON ap.matricula_id = m.id
     AND ap.disciplina_id = d.disciplina_id
  ),
  finais AS (
    SELECT b.*,
           CASE
             WHEN b.aproveitamento_id IS NOT NULL THEN b.media_aproveitada
             WHEN b.media_parcial IS NULL THEN NULL
             WHEN b.nota_rec IS NOT NULL AND b.nota_rec > b.media_parcial THEN b.nota_rec
             ELSE b.media_parcial
           END AS final
    FROM base b
  )
  SELECT f.disciplina_id,
         f.final,
         coalesce(f.frequencia_aproveitada, f.frequencia),
         CASE
           WHEN f.aproveitamento_id IS NOT NULL THEN 'APROVEITADO'
           WHEN f.media_parcial IS NULL THEN 'SEM_LANCAMENTO'
           WHEN f.frequencia IS NULL THEN 'FREQUENCIA_PENDENTE'
           WHEN f.frequencia < f.frequencia_minima_percent THEN 'REPROVADO_FREQUENCIA'
           WHEN f.final >= f.media_minima THEN 'APROVADO'
           WHEN f.nota_rec IS NULL THEN 'EM_RECUPERACAO'
           ELSE 'REPROVADO'
         END
  FROM finais f;
$$;

REVOKE ALL ON FUNCTION internal_academic.get_enrollment_results(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal_academic.copy_enrollment_credits(
  p_matricula_origem_id uuid,
  p_matricula_destino_id uuid,
  p_observacao text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.matriculas origem
    JOIN public.turmas turma_origem ON turma_origem.id = origem.turma_id
    JOIN public.matriculas destino ON destino.id = p_matricula_destino_id
    JOIN public.turmas turma_destino ON turma_destino.id = destino.turma_id
    WHERE origem.id = p_matricula_origem_id
      AND origem.aluno_id = destino.aluno_id
      AND turma_origem.curso_id = turma_destino.curso_id
  ) THEN
    RAISE EXCEPTION 'As matrículas de continuidade devem ser do mesmo aluno e curso.';
  END IF;

  WITH candidatos AS (
    SELECT ap.disciplina_id, ap.media_final, ap.frequencia_percent,
           ap.situacao, 1 AS prioridade
    FROM public.matricula_aproveitamentos ap
    WHERE ap.matricula_id = p_matricula_origem_id

    UNION ALL

    SELECT r.disciplina_id, r.media_final, r.frequencia_percent,
           'APROVEITADO'::text, 2 AS prioridade
    FROM internal_academic.get_enrollment_results(p_matricula_origem_id) r
    WHERE r.resultado_final = 'APROVADO'
  ),
  selecionados AS (
    SELECT DISTINCT ON (c.disciplina_id)
           c.disciplina_id, c.media_final, c.frequencia_percent, c.situacao
    FROM candidatos c
    JOIN public.matriculas destino ON destino.id = p_matricula_destino_id
    JOIN public.turmas_disciplinas td
      ON td.turma_id = destino.turma_id
     AND td.disciplina_id = c.disciplina_id
    ORDER BY c.disciplina_id, c.prioridade
  )
  INSERT INTO public.matricula_aproveitamentos (
    matricula_id, matricula_origem_id, disciplina_id, media_final,
    frequencia_percent, situacao, observacao
  )
  SELECT p_matricula_destino_id, p_matricula_origem_id,
         s.disciplina_id, s.media_final, s.frequencia_percent,
         s.situacao, p_observacao
  FROM selecionados s
  ON CONFLICT (matricula_id, disciplina_id) DO UPDATE SET
    matricula_origem_id = EXCLUDED.matricula_origem_id,
    media_final = EXCLUDED.media_final,
    frequencia_percent = EXCLUDED.frequencia_percent,
    situacao = EXCLUDED.situacao,
    observacao = EXCLUDED.observacao;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.copy_enrollment_credits(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_diario_resultados(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS TABLE (
  turma_id uuid,
  disciplina_id uuid,
  aluno_id uuid,
  nota_p numeric,
  nota_ti numeric,
  nota_tg numeric,
  nota_s numeric,
  nota_cq numeric,
  nota_o numeric,
  nota_rec numeric,
  total_aulas bigint,
  total_faltas bigint,
  frequencia_percent numeric,
  media_parcial numeric,
  media_final numeric,
  resultado_final text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid := public.current_aluno_id();
  v_full_access boolean := false;
  v_student_access boolean := false;
BEGIN
  SELECT
    coalesce((SELECT auth.role()), '') = 'service_role'
    OR public.is_gestor_for_polo(t.polo_id)
    OR public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id)
  INTO v_full_access
  FROM public.turmas t
  WHERE t.id = p_turma_id;

  v_full_access := coalesce(v_full_access, false);

  IF NOT v_full_access AND v_aluno_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.matriculas m
      JOIN public.turmas t ON t.id = m.turma_id
      JOIN public.cursos c ON c.id = t.curso_id
      WHERE m.turma_id = p_turma_id
        AND m.aluno_id = v_aluno_id
        AND upper(coalesce(c.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
        AND (
          (upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
            AND upper(coalesce(m.status, '')) = 'ATIVO')
          OR (upper(coalesce(t.status, '')) = 'FINALIZADA'
            AND upper(coalesce(m.status, '')) IN ('CONCLUIDO', 'REPROVADO'))
        )
    ) INTO v_student_access;
  END IF;

  IF NOT v_full_access AND NOT v_student_access THEN
    RAISE EXCEPTION 'Acesso acadêmico não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH regras AS (
    SELECT t.frequencia_minima_percent, t.media_minima
    FROM public.turmas t
    WHERE t.id = p_turma_id
  ),
  alunos AS (
    SELECT m.id AS matricula_id, m.aluno_id
    FROM public.matriculas m
    WHERE m.turma_id = p_turma_id
      AND upper(coalesce(m.status, '')) NOT IN ('CANCELADO', 'DESISTENTE', 'TRANSFERIDO')
      AND (v_full_access OR m.aluno_id = v_aluno_id)
  ),
  aulas AS (
    SELECT count(*) AS total,
           sum(CASE WHEN a.carga_horaria > 0 THEN a.carga_horaria ELSE 1 END) AS horas
    FROM public.aulas_turma a
    WHERE a.turma_id = p_turma_id
      AND a.disciplina_id = p_disciplina_id
  ),
  frequencias AS (
    SELECT f.aluno_id,
           count(*) FILTER (WHERE f.status = 'F') AS faltas,
           count(*) AS lancamentos,
           sum(CASE WHEN f.status = 'F'
             THEN CASE WHEN a.carga_horaria > 0 THEN a.carga_horaria ELSE 1 END
             ELSE 0 END) AS horas_falta
    FROM public.diario_frequencia f
    JOIN public.aulas_turma a ON a.id = f.aula_id
    WHERE f.turma_id = p_turma_id
      AND f.disciplina_id = p_disciplina_id
    GROUP BY f.aluno_id
  ),
  base AS (
    SELECT a.matricula_id, a.aluno_id,
           n.nota_p, n.nota_ti, n.nota_tg, n.nota_s,
           n.nota_cq, n.nota_o, n.nota_rec,
           au.total AS aulas,
           coalesce(f.faltas, 0) AS faltas,
           CASE
             WHEN ap.id IS NOT NULL THEN ap.frequencia_percent
             WHEN au.horas > 0 AND coalesce(f.lancamentos, 0) = au.total
               THEN round(((au.horas - coalesce(f.horas_falta, 0)) / au.horas) * 100, 2)
             ELSE NULL
           END AS frequencia,
           CASE
             WHEN ap.id IS NOT NULL THEN ap.media_final
             WHEN n.aluno_id IS NULL THEN NULL
             ELSE least(
               10.00,
               round(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0
                 + n.nota_cq + n.nota_o)::numeric, 1)
             )
           END AS parcial,
           ap.id AS aproveitamento_id,
           r.frequencia_minima_percent,
           r.media_minima
    FROM alunos a
    CROSS JOIN aulas au
    CROSS JOIN regras r
    LEFT JOIN frequencias f ON f.aluno_id = a.aluno_id
    LEFT JOIN public.diario_notas n
      ON n.turma_id = p_turma_id
     AND n.disciplina_id = p_disciplina_id
     AND n.aluno_id = a.aluno_id
    LEFT JOIN public.matricula_aproveitamentos ap
      ON ap.matricula_id = a.matricula_id
     AND ap.disciplina_id = p_disciplina_id
  ),
  finais AS (
    SELECT b.*,
           CASE
             WHEN b.parcial IS NULL THEN NULL
             WHEN b.nota_rec IS NOT NULL AND b.nota_rec > b.parcial THEN b.nota_rec
             ELSE b.parcial
           END AS final
    FROM base b
  )
  SELECT p_turma_id, p_disciplina_id, f.aluno_id,
         f.nota_p, f.nota_ti, f.nota_tg, f.nota_s,
         f.nota_cq, f.nota_o, f.nota_rec,
         f.aulas, f.faltas, f.frequencia, f.parcial, f.final,
         CASE
           WHEN f.aproveitamento_id IS NOT NULL THEN 'APROVEITADO'
           WHEN f.parcial IS NULL THEN 'SEM_LANCAMENTO'
           WHEN f.frequencia IS NULL THEN 'FREQUENCIA_PENDENTE'
           WHEN f.frequencia < f.frequencia_minima_percent THEN 'REPROVADO_FREQUENCIA'
           WHEN f.final >= f.media_minima THEN 'APROVADO'
           WHEN f.nota_rec IS NULL THEN 'EM_RECUPERACAO'
           ELSE 'REPROVADO'
         END
  FROM finais f;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_diario_resultados(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_diario_resultados(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_diario_resultados(uuid, uuid)
  IS 'Resultados do diário com frequência ponderada pela carga horária e regras próprias da turma.';

CREATE OR REPLACE FUNCTION public.processar_continuidade_transferencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_turma_destino public.turmas%rowtype;
BEGIN
  IF NEW.tipo NOT IN ('INTERNA_TURMA', 'INTERNA_POLO')
    OR NEW.matricula_origem_id IS NULL
    OR NEW.matricula_destino_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_turma_destino
  FROM public.turmas
  WHERE id = NEW.turma_destino_id;

  UPDATE public.matriculas
  SET origem_matricula_id = NEW.matricula_origem_id,
      continuidade_tipo = 'TRANSFERENCIA_INTERNA'
  WHERE id = NEW.matricula_destino_id;

  PERFORM internal_academic.copy_enrollment_credits(
    NEW.matricula_origem_id,
    NEW.matricula_destino_id,
    'Aproveitamento automático por transferência interna.'
  );

  DELETE FROM public.contas_receber
  WHERE matricula_id = NEW.matricula_destino_id
    AND tipo_lancamento = 'MATRICULA'
    AND status IN ('PENDENTE', 'VENCIDO')
    AND data_pagamento IS NULL;

  UPDATE public.contas_receber
  SET matricula_id = NEW.matricula_destino_id,
      turma_id = NEW.turma_destino_id,
      polo_id = v_turma_destino.polo_id,
      status = CASE
        WHEN data_vencimento < (pg_catalog.timezone('America/Maceio', now()))::date
          THEN 'VENCIDO'
        ELSE 'PENDENTE'
      END,
      descricao = pg_catalog.regexp_replace(descricao, ' - .*$', '')
        || ' - ' || v_turma_destino.nome,
      updated_at = now()
  WHERE matricula_id = NEW.matricula_origem_id
    AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    AND data_vencimento >= NEW.data_transferencia;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.processar_continuidade_transferencia()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.retornar_matricula_em_nova_turma(
  p_matricula_origem_id uuid,
  p_turma_destino_id uuid,
  p_motivo text,
  p_observacao text DEFAULT NULL,
  p_data_retorno date DEFAULT NULL,
  p_responsavel_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origem public.matriculas%rowtype;
  v_turma_origem public.turmas%rowtype;
  v_turma_destino public.turmas%rowtype;
  v_destino public.matriculas%rowtype;
  v_data date := coalesce(
    p_data_retorno,
    (pg_catalog.timezone('America/Maceio', now()))::date
  );
  v_creditos integer := 0;
  v_service_role boolean := coalesce((SELECT auth.role()), '') = 'service_role';
BEGIN
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do retorno.';
  END IF;

  SELECT * INTO v_origem
  FROM public.matriculas
  WHERE id = p_matricula_origem_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula de origem não encontrada.';
  END IF;
  IF v_origem.status NOT IN ('TRANCADO', 'CANCELADO', 'DESISTENTE') THEN
    RAISE EXCEPTION 'O retorno em outra turma exige matrícula trancada, cancelada ou desistente.';
  END IF;

  SELECT * INTO v_turma_origem
  FROM public.turmas
  WHERE id = v_origem.turma_id;
  SELECT * INTO v_turma_destino
  FROM public.turmas
  WHERE id = p_turma_destino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma de destino não encontrada.';
  END IF;
  IF v_turma_destino.id = v_turma_origem.id
    OR v_turma_destino.curso_id IS DISTINCT FROM v_turma_origem.curso_id
    OR v_turma_destino.status <> 'EM_ANDAMENTO' THEN
    RAISE EXCEPTION 'Selecione outra turma em andamento do mesmo curso.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cursos c
    WHERE c.id = v_turma_destino.curso_id
      AND upper(coalesce(c.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
  ) THEN
    RAISE EXCEPTION 'O retorno acadêmico é exclusivo de turma técnica.';
  END IF;
  IF NOT v_service_role AND (
    NOT public.can_write_turma(v_turma_origem.id)
    OR NOT public.can_write_turma(v_turma_destino.id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registrar o retorno.'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.matriculas m
    WHERE m.aluno_id = v_origem.aluno_id
      AND m.turma_id = v_turma_destino.id
  ) THEN
    RAISE EXCEPTION 'O aluno já possui histórico na turma de destino; revise a matrícula existente.';
  END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical_return:' || v_origem.aluno_id::text || ':' || v_turma_destino.id::text,
    0
  ));
  PERFORM internal_academic.authorize_enrollment_upsert(
    v_origem.aluno_id, v_turma_destino.id, 'ATIVO'
  );

  INSERT INTO public.matriculas (
    aluno_id, turma_id, status, data_matricula,
    origem_matricula_id, continuidade_tipo,
    valor_matricula_individual, valor_rematricula_individual,
    valor_parcela_individual, dia_vencimento_individual,
    financeiro_herdado, gerar_cobranca_inicial,
    gerar_cobranca_futura, sincronizar_asaas
  ) VALUES (
    v_origem.aluno_id, v_turma_destino.id, 'ATIVO', v_data::timestamptz,
    v_origem.id, 'RETORNO',
    v_origem.valor_matricula_individual, v_origem.valor_rematricula_individual,
    v_origem.valor_parcela_individual, v_origem.dia_vencimento_individual,
    v_origem.financeiro_herdado, false,
    v_origem.gerar_cobranca_futura, v_origem.sincronizar_asaas
  )
  RETURNING * INTO v_destino;

  v_creditos := internal_academic.copy_enrollment_credits(
    v_origem.id,
    v_destino.id,
    'Aproveitamento automático por retorno em nova turma.'
  );

  INSERT INTO public.matricula_movimentacoes (
    matricula_id, aluno_id, tipo, status_anterior, status_novo,
    turma_origem_id, turma_destino_id, motivo, observacao,
    data_movimentacao, responsavel_id, metadados
  ) VALUES (
    v_destino.id, v_destino.aluno_id, 'RETORNO', NULL, 'ATIVO',
    v_turma_origem.id, v_turma_destino.id, btrim(p_motivo),
    nullif(btrim(p_observacao), ''), v_data, p_responsavel_id,
    jsonb_build_object(
      'matricula_origem_id', v_origem.id,
      'aproveitamentos_copiados', v_creditos
    )
  );

  RETURN jsonb_build_object(
    'matriculaOrigemId', v_origem.id,
    'matriculaDestinoId', v_destino.id,
    'aproveitamentosCopiados', v_creditos
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retornar_matricula_em_nova_turma(
  uuid, uuid, text, text, date, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retornar_matricula_em_nova_turma(
  uuid, uuid, text, text, date, uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.salvar_aproveitamentos_transferencia_externa(
  p_matricula_id uuid,
  p_itens jsonb,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matricula public.matriculas%rowtype;
  v_item jsonb;
  v_disciplina_id uuid;
  v_media numeric;
  v_frequencia numeric;
  v_situacao text;
  v_total integer := 0;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
  END IF;
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT public.can_write_turma(v_matricula.turma_id) THEN
    RAISE EXCEPTION 'Sem permissão para registrar aproveitamentos.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.transferencias_academicas ta
    WHERE ta.matricula_destino_id = v_matricula.id
      AND ta.tipo = 'EXTERNA_RECEBIDA'
  ) THEN
    RAISE EXCEPTION 'A matrícula não foi recebida por transferência externa.';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'A lista de aproveitamentos é inválida.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 100 THEN
    RAISE EXCEPTION 'A lista de aproveitamentos excede o limite permitido.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_disciplina_id := nullif(v_item ->> 'disciplinaId', '')::uuid;
    v_media := nullif(v_item ->> 'mediaFinal', '')::numeric;
    v_frequencia := nullif(v_item ->> 'frequenciaPercent', '')::numeric;
    v_situacao := upper(coalesce(nullif(btrim(v_item ->> 'situacao'), ''), 'EQUIVALENCIA'));

    IF v_disciplina_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.turmas_disciplinas td
      WHERE td.turma_id = v_matricula.turma_id
        AND td.disciplina_id = v_disciplina_id
    ) THEN
      RAISE EXCEPTION 'Uma disciplina informada não pertence à turma de destino.';
    END IF;
    IF v_media IS NOT NULL AND (v_media < 0 OR v_media > 10) THEN
      RAISE EXCEPTION 'A média de aproveitamento deve ficar entre 0 e 10.';
    END IF;
    IF v_frequencia IS NOT NULL AND (v_frequencia < 0 OR v_frequencia > 100) THEN
      RAISE EXCEPTION 'A frequência de aproveitamento deve ficar entre 0 e 100.';
    END IF;
    IF v_situacao NOT IN ('APROVEITADO', 'DISPENSADO', 'EQUIVALENCIA') THEN
      RAISE EXCEPTION 'Situação de aproveitamento inválida.';
    END IF;

    INSERT INTO public.matricula_aproveitamentos (
      matricula_id, matricula_origem_id, disciplina_id,
      media_final, frequencia_percent, situacao, observacao
    ) VALUES (
      v_matricula.id, NULL, v_disciplina_id,
      v_media, v_frequencia, v_situacao,
      coalesce(nullif(btrim(p_observacao), ''),
        'Aproveitamento informado na transferência externa.')
    )
    ON CONFLICT (matricula_id, disciplina_id) DO UPDATE SET
      media_final = EXCLUDED.media_final,
      frequencia_percent = EXCLUDED.frequencia_percent,
      situacao = EXCLUDED.situacao,
      observacao = EXCLUDED.observacao;

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'matriculaId', v_matricula.id,
    'aproveitamentosSalvos', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.salvar_aproveitamentos_transferencia_externa(
  uuid, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_aproveitamentos_transferencia_externa(
  uuid, jsonb, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.receber_transferencia_externa_com_aproveitamentos(
  p_aluno_id uuid,
  p_turma_destino_id uuid,
  p_instituicao_origem text,
  p_curso_origem text,
  p_motivo text,
  p_observacao text DEFAULT NULL,
  p_data_transferencia date DEFAULT NULL,
  p_responsavel_id uuid DEFAULT NULL,
  p_aproveitamentos jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matricula public.matriculas%rowtype;
  v_creditos jsonb;
BEGIN
  v_matricula := public.receber_transferencia_externa(
    p_aluno_id,
    p_turma_destino_id,
    p_instituicao_origem,
    p_curso_origem,
    p_motivo,
    p_observacao,
    coalesce(p_data_transferencia,
      (pg_catalog.timezone('America/Maceio', now()))::date),
    p_responsavel_id
  );

  v_creditos := public.salvar_aproveitamentos_transferencia_externa(
    v_matricula.id,
    coalesce(p_aproveitamentos, '[]'::jsonb),
    p_observacao
  );

  RETURN jsonb_build_object(
    'matriculaId', v_matricula.id,
    'aproveitamentosSalvos', coalesce(
      (v_creditos ->> 'aproveitamentosSalvos')::integer,
      0
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.receber_transferencia_externa_com_aproveitamentos(
  uuid, uuid, text, text, text, text, date, uuid, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receber_transferencia_externa_com_aproveitamentos(
  uuid, uuid, text, text, text, text, date, uuid, jsonb
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_pendencias_fechamento_periodo(
  p_periodo_letivo_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH periodo AS (
    SELECT p.*, t.frequencia_minima_percent, t.media_minima
    FROM public.periodos_letivos p
    JOIN public.turmas t ON t.id = p.turma_id
    WHERE p.id = p_periodo_letivo_id
      AND (
        coalesce((SELECT auth.role()), '') = 'service_role'
        OR public.can_write_turma(p.turma_id)
      )
  ),
  disciplinas_periodo AS (
    SELECT td.turma_id, td.disciplina_id,
           coalesce(td.concluida, false) AS concluida,
           coalesce(d.carga_horaria_estagio, 0) AS carga_horaria_estagio
    FROM public.turmas_disciplinas td
    JOIN public.disciplinas d ON d.id = td.disciplina_id
    JOIN periodo p ON p.id = td.periodo_letivo_id
  ),
  alunos_ativos AS (
    SELECT m.aluno_id
    FROM public.matriculas m
    JOIN periodo p ON p.turma_id = m.turma_id
    WHERE m.status = 'ATIVO'
  ),
  aulas_periodo AS (
    SELECT a.id AS aula_id, a.turma_id, a.disciplina_id
    FROM public.aulas_turma a
    JOIN disciplinas_periodo dp
      ON dp.turma_id = a.turma_id
     AND dp.disciplina_id = a.disciplina_id
  ),
  sem_aula AS (
    SELECT dp.disciplina_id
    FROM disciplinas_periodo dp
    WHERE NOT EXISTS (
      SELECT 1 FROM aulas_periodo ap
      WHERE ap.turma_id = dp.turma_id
        AND ap.disciplina_id = dp.disciplina_id
    )
  ),
  sem_nota AS (
    SELECT aa.aluno_id, dp.disciplina_id
    FROM alunos_ativos aa
    CROSS JOIN disciplinas_periodo dp
    WHERE NOT EXISTS (
      SELECT 1 FROM public.diario_notas dn
      WHERE dn.turma_id = dp.turma_id
        AND dn.aluno_id = aa.aluno_id
        AND dn.disciplina_id = dp.disciplina_id
        AND dn.nota_p IS NOT NULL
        AND dn.nota_ti IS NOT NULL
        AND dn.nota_tg IS NOT NULL
        AND dn.nota_s IS NOT NULL
        AND dn.nota_cq IS NOT NULL
        AND dn.nota_o IS NOT NULL
    )
  ),
  frequencia_pendente AS (
    SELECT aa.aluno_id, ap.disciplina_id, ap.aula_id
    FROM alunos_ativos aa
    CROSS JOIN aulas_periodo ap
    WHERE NOT EXISTS (
      SELECT 1 FROM public.diario_frequencia df
      WHERE df.turma_id = ap.turma_id
        AND df.disciplina_id = ap.disciplina_id
        AND df.aula_id = ap.aula_id
        AND df.aluno_id = aa.aluno_id
        AND df.status IN ('P', 'F')
    )
  ),
  recuperacao_pendente AS (
    SELECT r.aluno_id, r.disciplina_id
    FROM disciplinas_periodo dp
    CROSS JOIN LATERAL public.get_diario_resultados(dp.turma_id, dp.disciplina_id) r
    JOIN alunos_ativos aa ON aa.aluno_id = r.aluno_id
    WHERE r.resultado_final = 'EM_RECUPERACAO'
  ),
  estagio_pendente AS (
    SELECT aa.aluno_id, dp.disciplina_id
    FROM alunos_ativos aa
    CROSS JOIN disciplinas_periodo dp
    WHERE dp.carga_horaria_estagio > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.matriculas_estagios me
        WHERE me.turma_id = dp.turma_id
          AND me.disciplina_id = dp.disciplina_id
          AND me.aluno_id = aa.aluno_id
          AND me.nota_final IS NOT NULL
          AND me.frequencia_estagio IS NOT NULL
      )
  ),
  estagio_reprovado AS (
    SELECT me.aluno_id, me.disciplina_id
    FROM disciplinas_periodo dp
    JOIN public.matriculas_estagios me
      ON me.turma_id = dp.turma_id
     AND me.disciplina_id = dp.disciplina_id
    JOIN alunos_ativos aa ON aa.aluno_id = me.aluno_id
    CROSS JOIN periodo p
    WHERE dp.carga_horaria_estagio > 0
      AND (me.nota_final < p.media_minima
        OR me.frequencia_estagio < p.frequencia_minima_percent)
  )
  SELECT jsonb_build_object(
    'disciplinasNaoConcluidas',
      (SELECT count(*) FROM disciplinas_periodo WHERE concluida = false),
    'disciplinasSemAula', (SELECT count(*) FROM sem_aula),
    'lancamentosDeNotaPendentes', (SELECT count(*) FROM sem_nota),
    'frequenciasPendentes', (SELECT count(*) FROM frequencia_pendente),
    'recuperacoesPendentes', (SELECT count(*) FROM recuperacao_pendente),
    'avaliacoesEstagioPendentes', (SELECT count(*) FROM estagio_pendente),
    'estagiosReprovados', (SELECT count(*) FROM estagio_reprovado),
    'podeFechar',
      (SELECT count(*) FROM disciplinas_periodo) > 0
      AND (SELECT count(*) FROM disciplinas_periodo WHERE concluida = false) = 0
      AND (SELECT count(*) FROM sem_aula) = 0
      AND (SELECT count(*) FROM sem_nota) = 0
      AND (SELECT count(*) FROM frequencia_pendente) = 0
      AND (SELECT count(*) FROM recuperacao_pendente) = 0
      AND (SELECT count(*) FROM estagio_pendente) = 0
  );
$$;

REVOKE ALL ON FUNCTION public.get_pendencias_fechamento_periodo(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pendencias_fechamento_periodo(uuid)
  TO authenticated, service_role;

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
  WITH regras AS (
    SELECT t.frequencia_minima_percent, t.media_minima
    FROM public.turmas t
    WHERE t.id = p_turma_id
  ),
  resultados AS (
    SELECT td.disciplina_id, result.resultado_final
    FROM public.turmas_disciplinas td
    LEFT JOIN LATERAL (
      SELECT r.resultado_final
      FROM public.get_diario_resultados(p_turma_id, td.disciplina_id) r
      WHERE r.aluno_id = p_aluno_id
      LIMIT 1
    ) result ON true
    WHERE td.turma_id = p_turma_id
  ),
  estagios AS (
    SELECT me.nota_final, me.frequencia_estagio
    FROM public.turmas_disciplinas td
    JOIN public.disciplinas d ON d.id = td.disciplina_id
    LEFT JOIN public.matriculas_estagios me
      ON me.turma_id = td.turma_id
     AND me.disciplina_id = td.disciplina_id
     AND me.aluno_id = p_aluno_id
    WHERE td.turma_id = p_turma_id
      AND coalesce(d.carga_horaria_estagio, 0) > 0
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM resultados) > 0
      AND coalesce((
        SELECT bool_and(resultado_final IN ('APROVADO', 'APROVEITADO'))
        FROM resultados
      ), false)
      AND NOT EXISTS (
        SELECT 1
        FROM estagios e
        CROSS JOIN regras r
        WHERE e.nota_final IS NULL
          OR e.frequencia_estagio IS NULL
          OR e.nota_final < r.media_minima
          OR e.frequencia_estagio < r.frequencia_minima_percent
      )
    THEN 'CONCLUIDO'
    ELSE 'REPROVADO'
  END;
$$;

REVOKE ALL ON FUNCTION internal_academic.final_enrollment_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

