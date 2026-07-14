-- Finalização, acesso histórico e escrita acadêmica autoritativa.

CREATE OR REPLACE FUNCTION internal_academic.final_enrollment_status(
  p_turma_id uuid, p_aluno_id uuid
)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH resultados AS (
    SELECT td.disciplina_id, result.resultado_final
    FROM public.turmas_disciplinas td
    LEFT JOIN LATERAL (
      SELECT r.resultado_final FROM public.get_diario_resultados(
        p_turma_id, td.disciplina_id
      ) r WHERE r.aluno_id = p_aluno_id LIMIT 1
    ) result ON true
    WHERE td.turma_id = p_turma_id
  )
  SELECT CASE
    WHEN count(*) > 0 AND coalesce(bool_and(
      resultado_final IN ('APROVADO', 'APROVEITADO')
    ), false) THEN 'CONCLUIDO'
    ELSE 'REPROVADO'
  END
  FROM resultados;
$$;

REVOKE EXECUTE ON FUNCTION internal_academic.final_enrollment_status(uuid, uuid)
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.finalizar_turma_academica(
  p_turma_id uuid, p_responsavel_id uuid DEFAULT NULL
)
RETURNS public.turmas LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_turma public.turmas%rowtype; v_responsavel uuid;
BEGIN
  v_responsavel := internal_academic.resolve_responsavel(p_responsavel_id);
  PERFORM pg_advisory_xact_lock(
    hashtextextended('technical_turma:' || p_turma_id::text, 0)
  );
  SELECT t.* INTO v_turma FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = p_turma_id AND c.modalidade = 'TECNICO' FOR UPDATE OF t;
  IF NOT FOUND OR v_turma.status <> 'EM_ANDAMENTO' THEN
    RAISE EXCEPTION 'Somente turma técnica em andamento pode ser finalizada.';
  END IF;
  IF NOT public.can_write_turma(p_turma_id) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  PERFORM pl.id FROM public.periodos_letivos pl
  WHERE pl.turma_id = p_turma_id ORDER BY pl.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.periodos_letivos pl WHERE pl.turma_id = p_turma_id)
    OR EXISTS (SELECT 1 FROM public.periodos_letivos pl
      WHERE pl.turma_id = p_turma_id AND pl.status <> 'FECHADO') THEN
    RAISE EXCEPTION 'Todos os períodos devem estar fechados.';
  END IF;
  PERFORM internal_academic.authorize_transition('TURMA_STATUS', p_turma_id, 'FINALIZADA');
  UPDATE public.turmas SET status = 'FINALIZADA' WHERE id = p_turma_id
  RETURNING * INTO v_turma;
  INSERT INTO public.matricula_movimentacoes (
    matricula_id, aluno_id, tipo, status_anterior, status_novo,
    turma_origem_id, motivo, responsavel_id
  ) SELECT m.id, m.aluno_id,
      CASE WHEN outcome.status_novo = 'CONCLUIDO' THEN 'CONCLUSAO' ELSE 'REPROVACAO' END,
      m.status, outcome.status_novo, m.turma_id,
      CASE WHEN outcome.status_novo = 'CONCLUIDO'
        THEN 'Conclusão após fechamento acadêmico da turma.'
        ELSE 'Reprovação acadêmica após fechamento da turma.' END,
      v_responsavel
    FROM public.matriculas m
    CROSS JOIN LATERAL (SELECT internal_academic.final_enrollment_status(
      p_turma_id, m.aluno_id
    ) AS status_novo) outcome
    WHERE m.turma_id = p_turma_id AND m.status = 'ATIVO';
  PERFORM internal_academic.authorize_transition(
    'MATRICULA_STATUS', m.id,
    internal_academic.final_enrollment_status(p_turma_id, m.aluno_id)
  )
  FROM public.matriculas m
  WHERE m.turma_id = p_turma_id AND m.status = 'ATIVO';
  UPDATE public.matriculas m SET status =
    internal_academic.final_enrollment_status(p_turma_id, m.aluno_id)
  WHERE m.turma_id = p_turma_id AND m.status = 'ATIVO';
  RETURN v_turma;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_aluno_matriculado_turma(p_turma_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE m.turma_id = p_turma_id AND m.aluno_id = (SELECT public.current_aluno_id())
      AND (c.modalidade <> 'TECNICO'
        OR (t.status = 'EM_ANDAMENTO' AND upper(coalesce(m.status, '')) = 'ATIVO')
        OR (t.status = 'FINALIZADA'
          AND upper(coalesce(m.status, '')) IN ('CONCLUIDO', 'REPROVADO')))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_student_read_atividade_extra(p_turma_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE m.turma_id = p_turma_id AND m.aluno_id = (SELECT public.current_aluno_id())
      AND ((c.modalidade <> 'TECNICO'
          AND upper(coalesce(m.status, '')) IN ('ATIVO', 'CONCLUIDO'))
        OR (c.modalidade = 'TECNICO' AND t.status = 'EM_ANDAMENTO'
          AND upper(coalesce(m.status, '')) = 'ATIVO')
        OR (c.modalidade = 'TECNICO' AND t.status = 'FINALIZADA'
          AND upper(coalesce(m.status, '')) IN ('CONCLUIDO', 'REPROVADO')))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_aluno_matriculado_turma_status(
  p_turma_id uuid,
  p_statuses text[] DEFAULT ARRAY['ATIVO', 'CONCLUIDO']::text[]
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE m.turma_id = p_turma_id AND m.aluno_id = (SELECT public.current_aluno_id())
      AND ((c.modalidade <> 'TECNICO'
          AND upper(coalesce(m.status, '')) = ANY(array_remove(p_statuses, 'REPROVADO')))
        OR (c.modalidade = 'TECNICO' AND t.status = 'EM_ANDAMENTO'
          AND upper(coalesce(m.status, '')) = 'ATIVO' AND 'ATIVO' = ANY(p_statuses))
        OR (c.modalidade = 'TECNICO' AND t.status = 'FINALIZADA'
          AND upper(coalesce(m.status, '')) IN ('CONCLUIDO', 'REPROVADO')
          AND upper(m.status) = ANY(p_statuses)))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_professor_assigned_disciplina_open(
  p_turma_id uuid, p_disciplina_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.turmas_disciplinas td
    JOIN public.turmas t ON t.id = td.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
    WHERE td.turma_id = p_turma_id AND td.disciplina_id = p_disciplina_id
      AND td.professor_id = (SELECT public.current_professor_id())
      AND ((c.modalidade <> 'TECNICO' AND upper(coalesce(t.status, '')) <> 'FINALIZADA')
        OR (c.modalidade = 'TECNICO' AND t.status = 'EM_ANDAMENTO'
          AND pl.status IN ('ABERTO', 'EM_FECHAMENTO')))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_professor_assigned_disciplina_periodo_open(
  p_turma_id uuid, p_disciplina_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_professor_assigned_disciplina_open(p_turma_id, p_disciplina_id);
$$;

CREATE OR REPLACE FUNCTION public.can_write_academic_record_open(
  p_turma_id uuid, p_disciplina_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT auth.role()), '') = 'service_role' OR EXISTS (
    SELECT 1 FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
    JOIN public.turmas_disciplinas td ON td.turma_id = t.id
      AND td.disciplina_id = p_disciplina_id
    LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
    WHERE t.id = p_turma_id AND (
      (c.modalidade <> 'TECNICO' AND (
        (SELECT public.can_write_turma(t.id))
        OR td.professor_id = (SELECT public.current_professor_id())
      )) OR (c.modalidade = 'TECNICO' AND t.status = 'EM_ANDAMENTO'
        AND pl.status IN ('ABERTO', 'EM_FECHAMENTO') AND (
          (SELECT public.can_write_turma(t.id))
          OR td.professor_id = (SELECT public.current_professor_id())
        ))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_aluno_vacinas_estagio_liberado(
  p_turma_id uuid, p_aluno_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH config AS (
    SELECT c.id AS curso_id, coalesce(c.vacinas_config,
      '{"exigirCarteiraEstagio":false,"vacinas":[]}'::jsonb) AS value
    FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = p_turma_id
  ), obrigatorias AS (
    SELECT config.curso_id, vacina.item ->> 'codigo' AS codigo,
      (dose.item ->> 'numero')::integer AS numero
    FROM config
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(config.value -> 'vacinas', '[]'))
      vacina(item)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(vacina.item -> 'doses', '[]'))
      dose(item)
    WHERE coalesce((config.value ->> 'exigirCarteiraEstagio')::boolean, false)
      AND coalesce((vacina.item ->> 'obrigatoria')::boolean, true)
  )
  SELECT EXISTS (SELECT 1 FROM config) AND NOT EXISTS (
    SELECT 1 FROM obrigatorias o WHERE NOT EXISTS (
      SELECT 1 FROM public.aluno_vacinas av
      WHERE av.aluno_id = p_aluno_id AND av.curso_id = o.curso_id
        AND av.vacina_codigo = o.codigo AND av.dose_numero = o.numero
        AND av.status = 'aprovado'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_public_turma(p_turma_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = p_turma_id AND t.status = 'EM_ANDAMENTO'
      AND lower(coalesce(c.status, '')) = 'ativo' AND coalesce(c.publicar_site, false)
      AND coalesce(t.permitir_inscricoes_online, false)
      AND (c.modalidade <> 'TECNICO' OR (
        (t.data_inicio_inscricao IS NULL OR t.data_inicio_inscricao <= (pg_catalog.timezone('America/Maceio', now()))::date)
        AND (t.data_fim_inscricao IS NULL OR t.data_fim_inscricao >= (pg_catalog.timezone('America/Maceio', now()))::date)
      ))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_public_enrollment_turma(p_turma_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.turmas t JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = p_turma_id AND c.modalidade = 'TECNICO'
      AND t.status IN ('INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
      AND lower(coalesce(c.status, '')) = 'ativo' AND coalesce(c.publicar_site, false)
      AND coalesce(t.permitir_inscricoes_online, false)
      AND (t.data_inicio_inscricao IS NULL OR t.data_inicio_inscricao <= (pg_catalog.timezone('America/Maceio', now()))::date)
      AND (t.data_fim_inscricao IS NULL OR t.data_fim_inscricao >= (pg_catalog.timezone('America/Maceio', now()))::date)
  );
$$;

DROP POLICY IF EXISTS "portal_turmas_public_select" ON public.turmas;
CREATE POLICY "portal_turmas_public_select" ON public.turmas FOR SELECT TO anon, authenticated
USING ((SELECT public.is_public_enrollment_turma(id)) OR (SELECT public.is_public_turma(id)));

DROP POLICY IF EXISTS "portal_diario_frequencia_access" ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_select" ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_insert" ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_update" ON public.diario_frequencia;
DROP POLICY IF EXISTS "portal_diario_frequencia_delete" ON public.diario_frequencia;
CREATE POLICY "portal_diario_frequencia_select" ON public.diario_frequencia FOR SELECT
TO authenticated USING ((aluno_id = (SELECT public.current_aluno_id())
  AND (SELECT public.is_aluno_matriculado_turma(turma_id)))
  OR (SELECT public.can_write_turma(turma_id))
  OR (SELECT public.is_professor_assigned_disciplina(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_frequencia_insert" ON public.diario_frequencia FOR INSERT
TO authenticated WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_frequencia_update" ON public.diario_frequencia FOR UPDATE
TO authenticated USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)))
WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_frequencia_delete" ON public.diario_frequencia FOR DELETE
TO authenticated USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));

DROP POLICY IF EXISTS "portal_diario_notas_access" ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_select" ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_insert" ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_update" ON public.diario_notas;
DROP POLICY IF EXISTS "portal_diario_notas_delete" ON public.diario_notas;
CREATE POLICY "portal_diario_notas_select" ON public.diario_notas FOR SELECT TO authenticated
USING ((aluno_id = (SELECT public.current_aluno_id())
  AND (SELECT public.is_aluno_matriculado_turma(turma_id)))
  OR (SELECT public.can_write_turma(turma_id))
  OR (SELECT public.is_professor_assigned_disciplina(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_notas_insert" ON public.diario_notas FOR INSERT TO authenticated
WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_notas_update" ON public.diario_notas FOR UPDATE TO authenticated
USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)))
WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_notas_delete" ON public.diario_notas FOR DELETE TO authenticated
USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));

DROP POLICY IF EXISTS "portal_matriculas_estagios_access" ON public.matriculas_estagios;
DROP POLICY IF EXISTS "portal_matriculas_estagios_select" ON public.matriculas_estagios;
DROP POLICY IF EXISTS "portal_matriculas_estagios_insert" ON public.matriculas_estagios;
DROP POLICY IF EXISTS "portal_matriculas_estagios_update" ON public.matriculas_estagios;
DROP POLICY IF EXISTS "portal_matriculas_estagios_delete" ON public.matriculas_estagios;
CREATE POLICY "portal_matriculas_estagios_select" ON public.matriculas_estagios FOR SELECT
TO authenticated USING ((aluno_id = (SELECT public.current_aluno_id())
  AND (SELECT public.is_aluno_matriculado_turma(turma_id)))
  OR (SELECT public.can_write_turma(turma_id))
  OR (SELECT public.is_professor_assigned_disciplina(turma_id, disciplina_id)));
CREATE POLICY "portal_matriculas_estagios_insert" ON public.matriculas_estagios FOR INSERT
TO authenticated WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_matriculas_estagios_update" ON public.matriculas_estagios FOR UPDATE
TO authenticated USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)))
WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_matriculas_estagios_delete" ON public.matriculas_estagios FOR DELETE
TO authenticated USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));

CREATE OR REPLACE FUNCTION public.enforce_estagio_operacional()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.matriculas_estagios%rowtype;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  IF NOT public.can_write_academic_record_open(v_row.turma_id, v_row.disciplina_id) THEN
    RAISE EXCEPTION 'O estágio só pode ser alterado por ator autorizado em período operacional.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'DELETE'
    AND NOT public.is_aluno_vacinas_estagio_liberado(v_row.turma_id, v_row.aluno_id) THEN
    RAISE EXCEPTION 'O aluno possui doses obrigatórias sem aprovação para o estágio.'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_estagio_operacional()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_estagio_operacional_trigger ON public.matriculas_estagios;
CREATE TRIGGER enforce_estagio_operacional_trigger BEFORE INSERT OR UPDATE OR DELETE
ON public.matriculas_estagios FOR EACH ROW EXECUTE FUNCTION public.enforce_estagio_operacional();

-- Policies antigas FOR ALL também transformavam SELECT em permissão de escrita.
DROP POLICY IF EXISTS "portal_aulas_turma_public_select" ON public.aulas_turma;
CREATE POLICY "portal_aulas_turma_public_select" ON public.aulas_turma FOR SELECT
TO anon, authenticated USING ((SELECT public.is_public_turma(turma_id)));
DROP POLICY IF EXISTS "portal_aulas_turma_write" ON public.aulas_turma;
DROP POLICY IF EXISTS "portal_aulas_turma_insert" ON public.aulas_turma;
DROP POLICY IF EXISTS "portal_aulas_turma_update" ON public.aulas_turma;
DROP POLICY IF EXISTS "portal_aulas_turma_delete" ON public.aulas_turma;
CREATE POLICY "portal_aulas_turma_insert" ON public.aulas_turma FOR INSERT TO authenticated
WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_aulas_turma_update" ON public.aulas_turma FOR UPDATE TO authenticated
USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)))
WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_aulas_turma_delete" ON public.aulas_turma FOR DELETE TO authenticated
USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));

DROP POLICY IF EXISTS "portal_diario_praticas_access" ON public.diario_praticas;
DROP POLICY IF EXISTS "portal_diario_praticas_select" ON public.diario_praticas;
DROP POLICY IF EXISTS "portal_diario_praticas_insert" ON public.diario_praticas;
DROP POLICY IF EXISTS "portal_diario_praticas_update" ON public.diario_praticas;
DROP POLICY IF EXISTS "portal_diario_praticas_delete" ON public.diario_praticas;
CREATE POLICY "portal_diario_praticas_select" ON public.diario_praticas FOR SELECT TO authenticated
USING ((SELECT public.can_write_turma(turma_id))
  OR (SELECT public.is_professor_assigned_disciplina(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_praticas_insert" ON public.diario_praticas FOR INSERT TO authenticated
WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_praticas_update" ON public.diario_praticas FOR UPDATE TO authenticated
USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)))
WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_praticas_delete" ON public.diario_praticas FOR DELETE TO authenticated
USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));

DROP POLICY IF EXISTS "portal_diario_observacoes_access" ON public.diario_observacoes;
DROP POLICY IF EXISTS "portal_diario_observacoes_select" ON public.diario_observacoes;
DROP POLICY IF EXISTS "portal_diario_observacoes_insert" ON public.diario_observacoes;
DROP POLICY IF EXISTS "portal_diario_observacoes_update" ON public.diario_observacoes;
DROP POLICY IF EXISTS "portal_diario_observacoes_delete" ON public.diario_observacoes;
CREATE POLICY "portal_diario_observacoes_select" ON public.diario_observacoes FOR SELECT TO authenticated
USING ((SELECT public.can_write_turma(turma_id))
  OR (SELECT public.is_professor_assigned_disciplina(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_observacoes_insert" ON public.diario_observacoes FOR INSERT TO authenticated
WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_observacoes_update" ON public.diario_observacoes FOR UPDATE TO authenticated
USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)))
WITH CHECK ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));
CREATE POLICY "portal_diario_observacoes_delete" ON public.diario_observacoes FOR DELETE TO authenticated
USING ((SELECT public.can_write_academic_record_open(turma_id, disciplina_id)));

REVOKE EXECUTE ON FUNCTION public.finalizar_turma_academica(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_aluno_matriculado_turma(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_student_read_atividade_extra(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_aluno_matriculado_turma_status(uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_professor_assigned_disciplina_open(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_professor_assigned_disciplina_periodo_open(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_academic_record_open(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_aluno_vacinas_estagio_liberado(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_public_turma(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_public_enrollment_turma(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_turma_academica(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_aluno_matriculado_turma(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_student_read_atividade_extra(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_aluno_matriculado_turma_status(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_professor_assigned_disciplina_open(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_professor_assigned_disciplina_periodo_open(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_academic_record_open(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_aluno_vacinas_estagio_liberado(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_public_turma(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_public_enrollment_turma(uuid) TO anon, authenticated, service_role;
