BEGIN;

-- Read-only registration projection inside the existing authorized receipt scope.
-- No new recipient, table grant, financial calculation or registration mutation.
CREATE OR REPLACE FUNCTION public.get_nfse_receipt_students_secure(p_context_id uuid, p_polo_id uuid, p_payment_month date, p_course_type text DEFAULT 'TECNICO'::text, p_class_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_selected_ids text[] DEFAULT ARRAY[]::text[], p_include_groups boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  v_context record;
  v_start date;
  v_end date;
  v_course_type text := nullif(pg_catalog.upper(pg_catalog.btrim(p_course_type)), '');
  v_search text;
  v_selected_ids text[];
  v_uuid_pattern constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_result jsonb;
BEGIN
  -- Authorize before catalogue, payment, selection or identifying reads.
  IF NOT coalesce(public.get_nfse_access_secure(p_context_id), false) THEN
    RAISE EXCEPTION 'Acesso NFS-e não autorizado.' USING ERRCODE = '42501';
  END IF;
  SELECT context."allPolos", context."poloIds" INTO v_context
  FROM public.portal_listar_perfis() AS context
  WHERE context.role = 'GESTOR' AND context."contextId" = p_context_id;
  IF NOT FOUND OR p_polo_id IS NULL THEN
    RAISE EXCEPTION 'Contexto e polo NFS-e obrigatórios.' USING ERRCODE = '42501';
  END IF;
  IF NOT (coalesce(v_context."allPolos", false)
    OR p_polo_id = ANY(coalesce(v_context."poloIds", ARRAY[]::uuid[])))
    OR NOT EXISTS (SELECT 1 FROM public.polos polo
      WHERE polo.id = p_polo_id AND public.is_active_status(polo.status)) THEN
    RAISE EXCEPTION 'Polo fora do contexto NFS-e autorizado.' USING ERRCODE = '42501';
  END IF;
  IF p_payment_month IS NULL OR NOT pg_catalog.isfinite(p_payment_month)
    OR p_payment_month <> pg_catalog.date_trunc('month', p_payment_month)::date
    OR p_payment_month < DATE '1900-01-01' OR p_payment_month > DATE '9999-11-01'
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 25
    OR p_include_groups IS NULL
    OR (v_course_type IS NOT NULL AND v_course_type NOT IN ('TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'EAD'))
    OR pg_catalog.length(coalesce(p_search, '')) > 120
    OR pg_catalog.cardinality(coalesce(p_selected_ids, ARRAY[]::text[])) > 1000 THEN
    RAISE EXCEPTION 'Filtros de recebimentos NFS-e inválidos.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.unnest(p_selected_ids) AS selected(id)
    WHERE selected.id IS NULL OR selected.id !~* ('^' || v_uuid_pattern || ':' || v_uuid_pattern || '$')) THEN
    RAISE EXCEPTION 'Seleção de alunos NFS-e inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_class_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.turmas class WHERE class.id = p_class_id AND class.polo_id = p_polo_id
  ) THEN
    RAISE EXCEPTION 'Turma fora do polo autorizado.' USING ERRCODE = '42501';
  END IF;
  v_start := p_payment_month;
  v_end := (v_start + pg_catalog.make_interval(months => 1))::date;
  v_search := nullif(public.financeiro_normalize_search_text(pg_catalog.btrim(p_search)), '');
  v_selected_ids := ARRAY(SELECT DISTINCT pg_catalog.lower(selected.id)
    FROM pg_catalog.unnest(coalesce(p_selected_ids, ARRAY[]::text[])) AS selected(id) ORDER BY 1);

  WITH identities AS MATERIALIZED (
    -- Read the effective cash source once, including partial-payment components.
    SELECT receipt.* FROM internal_financial_payments.cash_receivables() receipt
    WHERE receipt.polo_id = p_polo_id AND receipt.status = 'PAGO'
      AND receipt.data_pagamento >= v_start AND receipt.data_pagamento < v_end
      AND NOT EXISTS (SELECT 1 FROM public.emprestimos_financeiros loan
        WHERE loan.conta_receber_id = receipt.id)
  ), canonical AS MATERIALIZED (
    SELECT receipt.id, private.nfse_receipt_amount(receipt::public.contas_receber) AS valor_recebido
    FROM identities receipt
  ), student_receipts AS MATERIALIZED (
    SELECT receipt.id, receipt.valor_recebido,
      student.id AS student_id, student.nome AS student_name,
      nullif(pg_catalog.btrim(student.cpf_cnpj), '') AS student_cpf,
      nullif(pg_catalog.btrim(student.cidade), '') AS student_city,
      nullif(pg_catalog.upper(pg_catalog.btrim(student.uf)), '') AS student_state,
      class.id AS class_id, pg_catalog.concat_ws(' · ', class.codigo, class.nome) AS class_label,
      pg_catalog.upper(pg_catalog.btrim(course.modalidade)) AS course_type
    FROM canonical receipt
    JOIN identities identity ON identity.id = receipt.id
    JOIN public.matriculas enrollment ON enrollment.id = identity.matricula_id
    JOIN public.parceiros student ON student.id = enrollment.aluno_id
    JOIN public.turmas class ON class.id = coalesce(identity.turma_id, enrollment.turma_id)
      AND class.polo_id = p_polo_id
    JOIN public.cursos course ON course.id = class.curso_id
    WHERE pg_catalog.upper(pg_catalog.btrim(student.tipo)) = 'ALUNO'
      AND receipt.valor_recebido > 0
      AND receipt.valor_recebido::text NOT IN ('NaN', 'Infinity', '-Infinity')
  ), students AS MATERIALIZED (
    SELECT class_id::text || ':' || student_id::text AS id,
      class_id, class_label, course_type, student_id, student_name, student_cpf, student_city, student_state,
      pg_catalog.sum(valor_recebido) AS received_amount, pg_catalog.count(*)::integer AS receipt_count
    FROM student_receipts GROUP BY class_id, class_label, course_type, student_id, student_name,
      student_cpf, student_city, student_state
  ), filtered AS MATERIALIZED (
    SELECT student.* FROM students student
    WHERE (v_course_type IS NULL OR student.course_type = v_course_type)
      AND (p_class_id IS NULL OR student.class_id = p_class_id)
      AND (v_search IS NULL OR pg_catalog.strpos(
        public.financeiro_normalize_search_text(student.student_name), v_search) > 0)
  ), selected AS MATERIALIZED (
    SELECT student.* FROM students student WHERE student.id = ANY(v_selected_ids)
  ), unavailable AS (
    SELECT id FROM pg_catalog.unnest(v_selected_ids) AS requested(id)
    WHERE NOT EXISTS (SELECT 1 FROM selected student WHERE student.id = requested.id)
  ), group_sets AS (
    SELECT false AS selection, filtered.* FROM filtered
    UNION ALL
    SELECT true, selected.* FROM selected
  ), groups AS MATERIALIZED (
    SELECT selection, class_id, class_label,
      pg_catalog.jsonb_build_object(
        'id', class_id, 'label', class_label,
        'studentCount', pg_catalog.count(*)::integer,
        'receivedAmount', pg_catalog.sum(received_amount)::numeric(30,2)::text,
        'students', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', id, 'studentId', student_id, 'studentName', student_name,
          'studentCpf', student_cpf, 'studentCity', student_city, 'studentState', student_state,
          'receivedAmount', received_amount::numeric(30,2)::text, 'receiptCount', receipt_count
        ) ORDER BY public.financeiro_normalize_search_text(student_name), student_id)
      ) AS value
    FROM group_sets GROUP BY selection, class_id, class_label
  ), page AS (
    SELECT class_id, class_label, value FROM groups WHERE NOT selection AND p_include_groups
    ORDER BY public.financeiro_normalize_search_text(class_label), class_id
    LIMIT p_page_size OFFSET (p_page::bigint - 1) * p_page_size
  )
  SELECT pg_catalog.jsonb_build_object(
    'version', 1,
    'scope', pg_catalog.jsonb_build_object('contextId', p_context_id, 'poloId', p_polo_id,
      'paymentMonth', pg_catalog.to_char(v_start, 'YYYY-MM'), 'basis', 'PAYMENT_DATE'),
    'courseTypes', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', 'TECNICO', 'label', 'Técnico'),
      pg_catalog.jsonb_build_object('id', 'LIVRE', 'label', 'Livre'),
      pg_catalog.jsonb_build_object('id', 'ESPECIALIZACAO', 'label', 'Especialização'),
      pg_catalog.jsonb_build_object('id', 'EAD', 'label', 'EAD')),
    'classes', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', options.class_id, 'label', options.class_label)
        ORDER BY public.financeiro_normalize_search_text(options.class_label), options.class_id)
      FROM (SELECT DISTINCT class_id, class_label FROM students
        WHERE v_course_type IS NULL OR course_type = v_course_type) options), '[]'::jsonb),
    'groups', coalesce((SELECT pg_catalog.jsonb_agg(value
      ORDER BY public.financeiro_normalize_search_text(class_label), class_id) FROM page), '[]'::jsonb),
    'page', p_page, 'pageSize', p_page_size,
    'totalGroups', (SELECT pg_catalog.count(*)::integer FROM groups WHERE NOT selection),
    'totalStudents', (SELECT pg_catalog.count(*)::integer FROM filtered),
    'excludedUnknownCount', (SELECT pg_catalog.count(*)::integer FROM canonical
      WHERE valor_recebido IS NULL OR valor_recebido::text IN ('NaN', 'Infinity', '-Infinity')),
    'selection', pg_catalog.jsonb_build_object(
      'ids', coalesce((SELECT pg_catalog.jsonb_agg(id ORDER BY id) FROM selected), '[]'::jsonb),
      'selectedCount', (SELECT pg_catalog.count(*)::integer FROM selected),
      'selectedAmount', CASE WHEN EXISTS (SELECT 1 FROM unavailable) THEN NULL
        ELSE (SELECT coalesce(pg_catalog.sum(received_amount), 0)::numeric(30,2)::text FROM selected) END,
      'valid', NOT EXISTS (SELECT 1 FROM unavailable),
      'unavailableIds', coalesce((SELECT pg_catalog.jsonb_agg(id ORDER BY id) FROM unavailable), '[]'::jsonb),
      'groups', coalesce((SELECT pg_catalog.jsonb_agg(value
        ORDER BY public.financeiro_normalize_search_text(class_label), class_id)
        FROM groups WHERE selection), '[]'::jsonb)
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;

