-- Migration: 20260827012000_create_secretaria_banese_document_groups_secure.sql
-- Function to retrieve grouped Banese receivables directly and securely for Secretaria Carnes dos Alunos

CREATE OR REPLACE FUNCTION public.get_secretaria_banese_document_groups_secure(
  p_polo_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_course_id uuid DEFAULT NULL::uuid,
  p_class_id uuid DEFAULT NULL::uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_search text := lower(extensions.unaccent(btrim(coalesce(p_search, ''))));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset integer := (v_page - 1) * v_page_size;
  v_total integer := 0;
  v_groups jsonb;
  v_courses jsonb;
  v_classes jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (
         (p_polo_id IS NULL AND (public.is_gestor_global() OR EXISTS (
           SELECT 1 FROM public.usuarios_sistema u
           WHERE u.email = auth.jwt()->>'email'
             AND u.status = 'ativo'
         )))
         OR (p_polo_id IS NOT NULL AND (public.is_gestor_for_polo(p_polo_id) OR public.is_gestor_global()))
       )
       AND (
         public.gestor_has_tab('secretaria', 'recebimentos')
         OR public.gestor_has_tab('secretaria', 'carnes-alunos')
         OR public.gestor_has_tab('secretaria', 'consulta-financeira')
         OR public.gestor_has_financeiro_tab('receber')
         OR public.is_gestor_global()
       )
     ) THEN
    RAISE EXCEPTION 'Acesso aos carnês da secretaria nao autorizado.'
      USING ERRCODE = '42501';
  END IF;

  WITH filtered_receivables AS (
    SELECT
      cr.id,
      cr.cliente_id,
      cr.matricula_id,
      cr.turma_id,
      cr.polo_id,
      cr.valor,
      cr.data_vencimento,
      cr.parcela_numero,
      p.nome AS student_name,
      p.cpf_cnpj AS student_cpf,
      m.data_matricula,
      t.nome AS turma_nome,
      t.codigo AS turma_codigo,
      t.curso_id,
      c.nome AS curso_nome
    FROM public.contas_receber cr
    JOIN public.parceiros p ON p.id = cr.cliente_id
    JOIN public.matriculas m ON m.id = cr.matricula_id
    JOIN public.turmas t ON t.id = cr.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE cr.gateway_provider = 'banese_card'
      AND cr.tipo_lancamento = 'PARCELA'
      AND cr.status IN ('PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO')
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id OR t.polo_id = p_polo_id)
      AND (
        v_search IS NULL OR v_search = ''
        OR lower(extensions.unaccent(coalesce(p.nome, ''))) LIKE '%' || v_search || '%'
        OR regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g') LIKE '%' || v_search || '%'
        OR lower(extensions.unaccent(coalesce(t.nome, ''))) LIKE '%' || v_search || '%'
        OR lower(extensions.unaccent(coalesce(t.codigo, ''))) LIKE '%' || v_search || '%'
        OR lower(extensions.unaccent(coalesce(c.nome, ''))) LIKE '%' || v_search || '%'
      )
  ),
  all_groups AS (
    SELECT
      r.matricula_id AS enrollment_id,
      r.student_name,
      r.student_cpf,
      r.turma_id AS class_id,
      r.turma_nome AS class_name,
      r.turma_codigo AS class_code,
      r.curso_id AS course_id,
      r.curso_nome AS course_name,
      r.polo_id,
      r.data_matricula,
      count(*)::int AS installment_count,
      round(sum(r.valor::numeric), 2) AS total_amount,
      to_char(min(r.data_vencimento), 'YYYY-MM-DD') AS first_due_date,
      to_char(max(r.data_vencimento), 'YYYY-MM-DD') AS last_due_date,
      (array_agg(r.id ORDER BY coalesce(r.parcela_numero, 0), r.data_vencimento, r.id))[1] AS representative_id,
      array_agg(r.id ORDER BY coalesce(r.parcela_numero, 0), r.data_vencimento, r.id) AS receivable_ids
    FROM filtered_receivables r
    GROUP BY
      r.matricula_id,
      r.student_name,
      r.student_cpf,
      r.turma_id,
      r.turma_nome,
      r.turma_codigo,
      r.curso_id,
      r.curso_nome,
      r.polo_id,
      r.data_matricula
  ),
  filter_facets AS (
    SELECT
      coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', course_id, 'name', course_name) ORDER BY course_name, course_id)
        FROM (SELECT DISTINCT course_id, course_name FROM all_groups) c
      ), '[]'::jsonb) AS courses,
      coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', class_id, 'name', coalesce(class_name, class_code, 'Turma'), 'courseId', course_id) ORDER BY class_name, class_id)
        FROM (SELECT DISTINCT class_id, class_name, class_code, course_id FROM all_groups) cl
      ), '[]'::jsonb) AS classes
  ),
  scoped_groups AS (
    SELECT *
    FROM all_groups g
    WHERE (p_course_id IS NULL OR g.course_id = p_course_id)
      AND (p_class_id IS NULL OR g.class_id = p_class_id)
  ),
  formatted_groups AS (
    SELECT
      'banese:' || g.representative_id AS id,
      g.representative_id AS "representativeReceivableId",
      g.receivable_ids AS "receivableIds",
      g.student_name AS "studentName",
      CASE
        WHEN length(regexp_replace(coalesce(g.student_cpf, ''), '\D', '', 'g')) = 11
        THEN '***.***.***-' || right(regexp_replace(coalesce(g.student_cpf, ''), '\D', '', 'g'), 2)
        ELSE '***.***.***-**'
      END AS "maskedCpf",
      g.enrollment_id AS "enrollmentId",
      'UNIV-' || coalesce(to_char(g.data_matricula, 'YY'), to_char(now(), 'YY')) ||
        CASE WHEN g.polo_id = '55555555-5555-5555-5555-555555555555' THEN '02' ELSE '01' END ||
        lpad(((('x' || right(replace(g.enrollment_id::text, '-', ''), 4))::bit(16)::int) % 10000)::text, 4, '0') AS "enrollmentCode",
      g.course_id AS "courseId",
      g.course_name AS "courseName",
      g.class_id AS "classId",
      coalesce(g.class_name, g.class_code, 'Turma') AS "className",
      g.installment_count AS "installmentCount",
      g.total_amount AS "totalAmount",
      g.first_due_date AS "firstDueDate",
      g.last_due_date AS "lastDueDate",
      CASE WHEN g.installment_count >= 3 THEN 'carnet' ELSE 'boletos' END AS "documentType"
    FROM scoped_groups g
    ORDER BY g.student_name, g.first_due_date, g.enrollment_id
  )
  SELECT
    (SELECT count(*)::int FROM scoped_groups),
    coalesce((SELECT jsonb_agg(to_jsonb(f)) FROM (SELECT * FROM formatted_groups LIMIT v_page_size OFFSET v_offset) f), '[]'::jsonb),
    (SELECT courses FROM filter_facets),
    (SELECT classes FROM filter_facets)
  INTO v_total, v_groups, v_courses, v_classes;

  RETURN jsonb_build_object(
    'groups', v_groups,
    'total', v_total,
    'page', v_page,
    'pageSize', v_page_size,
    'filters', jsonb_build_object(
      'courses', v_courses,
      'classes', v_classes
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_secretaria_banese_document_groups_secure(uuid, text, uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_secretaria_banese_document_groups_secure(uuid, text, uuid, uuid, integer, integer) TO service_role;
