CREATE OR REPLACE FUNCTION public.search_secretaria_finance_students_secure(
  p_polo_id uuid,
  p_search text,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_search text := lower(trim(COALESCE(p_search, '')));
  v_rows jsonb;
BEGIN
  IF length(v_search) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       (
         (p_polo_id IS NULL AND public.is_gestor_global())
         OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
       )
       AND (
         public.gestor_has_tab('secretaria', 'recebimentos')
         OR public.gestor_has_financeiro_tab('receber')
       )
     )
  THEN
    RAISE EXCEPTION 'Busca financeira de alunos nao autorizada.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(result_row) ORDER BY result_row.nome, result_row.id),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      student.id,
      student.nome,
      student.cpf_cnpj,
      student.email,
      student.telefone,
      enrollment.id AS matricula_id,
      enrollment.data_matricula,
      enrollment.status AS matricula_status,
      enrollment.turma_polo_id,
      enrollment.turma_nome,
      enrollment.turma_codigo,
      enrollment.curso_nome
    FROM public.parceiros AS student
    LEFT JOIN LATERAL (
      SELECT
        registration.id,
        registration.data_matricula,
        registration.status,
        class.polo_id AS turma_polo_id,
        class.nome AS turma_nome,
        class.codigo AS turma_codigo,
        course.nome AS curso_nome
      FROM public.matriculas AS registration
      JOIN public.turmas AS class ON class.id = registration.turma_id
      LEFT JOIN public.cursos AS course ON course.id = class.curso_id
      WHERE registration.aluno_id = student.id
        AND (
          p_polo_id IS NULL
          OR class.polo_id = p_polo_id
          OR class.polo_id IS NULL
        )
      ORDER BY
        CASE upper(COALESCE(registration.status, ''))
          WHEN 'ATIVO' THEN 0
          WHEN 'EM_ANDAMENTO' THEN 1
          WHEN 'CONCLUIDO' THEN 2
          ELSE 3
        END,
        registration.data_matricula DESC NULLS LAST,
        registration.id
      LIMIT 1
    ) AS enrollment ON true
    WHERE student.tipo = 'Aluno'
      AND (
        p_polo_id IS NULL
        OR student.polo_id = p_polo_id
        OR p_polo_id = ANY(COALESCE(student.polo_ids, ARRAY[]::uuid[]))
        OR student.polo_id IS NULL
      )
      AND (
        lower(student.nome) LIKE '%' || v_search || '%'
        OR lower(COALESCE(student.cpf_cnpj, '')) LIKE '%' || v_search || '%'
      )
    ORDER BY student.nome, student.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  ) AS result_row;

  RETURN v_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_secretaria_finance_students_secure(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_secretaria_finance_students_secure(uuid, text, integer)
  TO authenticated, service_role;
