CREATE INDEX IF NOT EXISTS idx_aulas_turma_data_turma_disciplina
  ON public.aulas_turma (data_aula, turma_id, disciplina_id)
  WHERE data_aula IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_professor_dashboard(p_polo_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_professor_id uuid;
  v_result jsonb;
BEGIN
  v_professor_id := public.current_professor_id();

  IF v_professor_id IS NULL THEN
    RETURN jsonb_build_object(
      'disciplinasCount', 0,
      'turmasCount', 0,
      'chatsCount', 0,
      'meusCursosCount', 0,
      'proximasAulas', '[]'::jsonb,
      'turmas', '[]'::jsonb
    );
  END IF;

  WITH assigned AS (
    SELECT
      td.turma_id,
      td.disciplina_id,
      td.concluida,
      t.codigo AS turma_codigo,
      t.nome AS turma_nome,
      t.status AS turma_status,
      t.data_inicio AS turma_data_inicio,
      t.polo_id,
      c.nome AS curso_nome,
      d.nome AS disciplina_nome,
      p.nome AS polo_nome,
      p.cidade AS polo_cidade,
      p.estado AS polo_uf
    FROM public.turmas_disciplinas td
    JOIN public.turmas t ON t.id = td.turma_id
    LEFT JOIN public.cursos c ON c.id = t.curso_id
    LEFT JOIN public.disciplinas d ON d.id = td.disciplina_id
    LEFT JOIN public.polos p ON p.id = t.polo_id
    WHERE td.professor_id = v_professor_id
      AND (p_polo_id IS NULL OR t.polo_id = p_polo_id)
  ),
  kpis AS (
    SELECT
      COUNT(DISTINCT (turma_id, disciplina_id))::int AS disciplinas_count,
      COUNT(DISTINCT turma_id)::int AS turmas_count
    FROM assigned
    WHERE COALESCE(UPPER(turma_status), '') <> 'FINALIZADA'
  ),
  chats AS (
    SELECT COUNT(*)::int AS chats_count
    FROM public.comunicacao_chats cc
    WHERE cc.remetente_id = v_professor_id
      AND cc.status = 'pendente'
  ),
  cursos_aluno AS (
    SELECT COUNT(*)::int AS meus_cursos_count
    FROM public.matriculas m
    WHERE m.aluno_id = v_professor_id
      AND UPPER(m.status) IN ('ATIVO', 'CONCLUIDO', 'CONCLUÍDO')
  ),
  proximas_aulas AS (
    SELECT COALESCE(jsonb_agg(row_to_json(lesson)::jsonb), '[]'::jsonb) AS items
    FROM (
      SELECT
        a.id,
        a.titulo,
        a.data_aula AS "dataAula",
        a.carga_horaria AS "cargaHoraria",
        ass.turma_id AS "turmaId",
        ass.turma_nome AS "turmaNome",
        ass.turma_codigo AS "turmaCodigo",
        ass.disciplina_id AS "disciplinaId",
        ass.disciplina_nome AS "disciplinaNome",
        ass.curso_nome AS "cursoNome",
        ass.polo_nome AS "poloNome",
        ass.polo_cidade AS "poloCidade",
        ass.polo_uf AS "poloUf"
      FROM assigned ass
      JOIN public.aulas_turma a
        ON a.turma_id = ass.turma_id
       AND a.disciplina_id = ass.disciplina_id
      WHERE a.data_aula IS NOT NULL
        AND a.data_aula >= CURRENT_DATE
      ORDER BY a.data_aula ASC, a.created_at ASC
      LIMIT 5
    ) lesson
  ),
  turmas_resumo AS (
    SELECT COALESCE(jsonb_agg(row_to_json(turma_row)::jsonb), '[]'::jsonb) AS items
    FROM (
      SELECT
        ass.turma_id AS id,
        MIN(ass.turma_codigo) AS codigo,
        MIN(ass.turma_nome) AS nome,
        MIN(ass.turma_status) AS status,
        MIN(ass.turma_data_inicio) AS "dataInicio",
        MIN(ass.curso_nome) AS "cursoNome",
        MIN(ass.polo_nome) AS "poloNome",
        MIN(ass.polo_cidade) AS "poloCidade",
        MIN(ass.polo_uf) AS "poloUf",
        COUNT(DISTINCT ass.disciplina_id)::int AS "disciplinasCount",
        MIN(a.data_aula) FILTER (WHERE a.data_aula >= CURRENT_DATE) AS "proximaAula"
      FROM assigned ass
      LEFT JOIN public.aulas_turma a
        ON a.turma_id = ass.turma_id
       AND a.disciplina_id = ass.disciplina_id
      WHERE COALESCE(UPPER(ass.turma_status), '') <> 'FINALIZADA'
      GROUP BY ass.turma_id
      ORDER BY "proximaAula" ASC NULLS LAST, MIN(ass.turma_data_inicio) ASC NULLS LAST
      LIMIT 6
    ) turma_row
  )
  SELECT jsonb_build_object(
    'disciplinasCount', COALESCE(k.disciplinas_count, 0),
    'turmasCount', COALESCE(k.turmas_count, 0),
    'chatsCount', COALESCE(ch.chats_count, 0),
    'meusCursosCount', COALESCE(ca.meus_cursos_count, 0),
    'proximasAulas', pa.items,
    'turmas', tr.items
  )
  INTO v_result
  FROM kpis k
  CROSS JOIN chats ch
  CROSS JOIN cursos_aluno ca
  CROSS JOIN proximas_aulas pa
  CROSS JOIN turmas_resumo tr;

  RETURN COALESCE(v_result, jsonb_build_object(
    'disciplinasCount', 0,
    'turmasCount', 0,
    'chatsCount', 0,
    'meusCursosCount', 0,
    'proximasAulas', '[]'::jsonb,
    'turmas', '[]'::jsonb
  ));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_professor_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_professor_dashboard(uuid) TO authenticated, service_role;
