-- Corrige o contrato físico da fotografia acadêmica: disciplinas.carga_horaria
-- é integer, enquanto a RPC pública promete numeric.

CREATE OR REPLACE FUNCTION public.get_gestao_turmas_academic_progress(
  p_turma_ids uuid[]
)
RETURNS TABLE (
  turma_id uuid,
  total_disciplinas bigint,
  disciplinas_concluidas bigint,
  grade_concluida boolean,
  modulo_atual_id uuid,
  modulo_atual_nome text,
  modulo_atual_ordem integer,
  disciplina_atual_id uuid,
  disciplina_atual_nome text,
  disciplina_atual_ordem bigint,
  professor_atual text,
  carga_horaria numeric,
  horas_realizadas numeric,
  proxima_aula_data date,
  proxima_aula_titulo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_turma_ids IS NULL OR cardinality(p_turma_ids) = 0 THEN
    RETURN;
  END IF;

  IF cardinality(p_turma_ids) > 200
    OR array_position(p_turma_ids, NULL) IS NOT NULL
    OR cardinality(p_turma_ids) <> (
      SELECT count(DISTINCT requested_id)
      FROM unnest(p_turma_ids) requested(requested_id)
    )
  THEN
    RAISE EXCEPTION 'Informe até 200 IDs de turmas, sem nulos ou repetições.'
      USING ERRCODE = '23514';
  END IF;

  IF coalesce(auth.role(), '') <> 'service_role'
    AND EXISTS (
      SELECT 1
      FROM unnest(p_turma_ids) requested(requested_id)
      WHERE NOT coalesce(
        public.can_operate_turma_academics(requested.requested_id),
        false
      )
    )
  THEN
    RAISE EXCEPTION 'Sem permissão para consultar uma ou mais turmas.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_turma_ids) requested(requested_id)
    LEFT JOIN public.turmas t ON t.id = requested.requested_id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Uma ou mais turmas solicitadas não existem.'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  WITH requested_ids AS (
    SELECT requested_id, request_order
    FROM unnest(p_turma_ids) WITH ORDINALITY requested(
      requested_id,
      request_order
    )
  ), requested_turmas AS (
    SELECT ri.requested_id AS id, ri.request_order, t.curso_id
    FROM requested_ids ri
    JOIN public.turmas t ON t.id = ri.requested_id
  ), aulas_horas AS (
    SELECT a.turma_id, a.disciplina_id, sum(a.carga_horaria) AS horas
    FROM public.aulas_turma a
    JOIN requested_turmas rt ON rt.id = a.turma_id
    WHERE a.data_aula IS NOT NULL
      AND a.data_aula <= (pg_catalog.timezone('America/Maceio', now()))::date
    GROUP BY a.turma_id, a.disciplina_id
  ), atividades_horas AS (
    SELECT
      ae.turma_id,
      ae.disciplina_id,
      sum(ae.carga_horaria_compensacao) AS horas
    FROM public.atividades_extra_classe ae
    JOIN requested_turmas rt ON rt.id = ae.turma_id
    WHERE ae.status = 'PUBLICADA'
      AND (
        ae.prazo_entrega IS NULL
        OR ae.prazo_entrega <= (
          pg_catalog.timezone('America/Maceio', now())
        )::date
      )
    GROUP BY ae.turma_id, ae.disciplina_id
  ), grade_ordenada AS (
    SELECT
      rt.id AS turma_id,
      mo.id AS modulo_id,
      mo.nome AS modulo_nome,
      mo.ordem AS modulo_ordem,
      d.id AS disciplina_id,
      d.nome AS disciplina_nome,
      d.carga_horaria::numeric AS carga_horaria,
      td.professor_nome,
      coalesce(td.concluida, false) AS concluida,
      row_number() OVER (
        PARTITION BY rt.id
        ORDER BY
          mo.ordem NULLS LAST,
          mo.created_at,
          mo.id,
          d.ordem NULLS LAST,
          d.created_at,
          d.nome,
          d.id
      ) AS disciplina_ordem,
      count(*) OVER (PARTITION BY rt.id) AS total_disciplinas
    FROM requested_turmas rt
    JOIN public.modulos mo ON mo.curso_id = rt.curso_id
    JOIN public.disciplinas d ON d.modulo_id = mo.id
    LEFT JOIN public.turmas_disciplinas td
      ON td.turma_id = rt.id
     AND td.disciplina_id = d.id
  ), progresso AS (
    SELECT
      go.*,
      coalesce(ah.horas, 0) + coalesce(aeh.horas, 0) AS horas_realizadas
    FROM grade_ordenada go
    LEFT JOIN aulas_horas ah
      ON ah.turma_id = go.turma_id
     AND ah.disciplina_id = go.disciplina_id
    LEFT JOIN atividades_horas aeh
      ON aeh.turma_id = go.turma_id
     AND aeh.disciplina_id = go.disciplina_id
  ), resumo AS (
    SELECT
      p.turma_id,
      max(p.total_disciplinas)::bigint AS total_disciplinas,
      count(*) FILTER (WHERE p.concluida)::bigint AS disciplinas_concluidas
    FROM progresso p
    GROUP BY p.turma_id
  ), disciplina_atual AS (
    SELECT DISTINCT ON (p.turma_id)
      p.turma_id,
      p.modulo_id,
      p.modulo_nome,
      p.modulo_ordem,
      p.disciplina_id,
      p.disciplina_nome,
      p.disciplina_ordem,
      p.professor_nome,
      p.carga_horaria,
      p.horas_realizadas
    FROM progresso p
    WHERE NOT p.concluida
    ORDER BY p.turma_id, p.disciplina_ordem
  ), proxima_aula AS (
    SELECT DISTINCT ON (a.turma_id)
      a.turma_id,
      a.data_aula,
      a.titulo
    FROM public.aulas_turma a
    JOIN requested_turmas rt ON rt.id = a.turma_id
    WHERE a.data_aula >= (pg_catalog.timezone('America/Maceio', now()))::date
    ORDER BY a.turma_id, a.data_aula, a.created_at, a.id
  )
  SELECT
    rt.id,
    coalesce(r.total_disciplinas, 0)::bigint,
    coalesce(r.disciplinas_concluidas, 0)::bigint,
    coalesce(r.total_disciplinas, 0) > 0
      AND coalesce(r.disciplinas_concluidas, 0) = coalesce(r.total_disciplinas, 0),
    da.modulo_id,
    da.modulo_nome,
    da.modulo_ordem,
    da.disciplina_id,
    da.disciplina_nome,
    da.disciplina_ordem,
    coalesce(da.professor_nome, 'Não definido'),
    da.carga_horaria::numeric,
    da.horas_realizadas::numeric,
    pa.data_aula,
    pa.titulo
  FROM requested_turmas rt
  LEFT JOIN resumo r ON r.turma_id = rt.id
  LEFT JOIN disciplina_atual da ON da.turma_id = rt.id
  LEFT JOIN proxima_aula pa ON pa.turma_id = rt.id
  ORDER BY rt.request_order;
END;
$$;

REVOKE ALL ON FUNCTION public.get_gestao_turmas_academic_progress(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_gestao_turmas_academic_progress(uuid[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_gestao_turmas_academic_progress(uuid[]) IS
  'Fotografia batch autorizada dos cards: grade, conclusão explícita, item atual, horas e próxima aula.';
