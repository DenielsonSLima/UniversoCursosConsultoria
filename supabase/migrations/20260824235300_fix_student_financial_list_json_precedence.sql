BEGIN;

-- Hotfix incremental: evita que || seja resolvido como concatenação JSONB
-- antes de ->> durante o planejamento, inclusive quando rows está vazio.
-- Portal financeiro canônico do Aluno. A função aplicada anteriormente
-- continua responsável por materializar regras históricas de cada título;
-- este adapter corrige valor efetivo/data civil e entrega filtros e página.
CREATE OR REPLACE FUNCTION public.portal_aluno_financeiro_listar(
  p_aluno_id uuid,
  p_busca text DEFAULT NULL,
  p_data_inicial date DEFAULT NULL,
  p_data_final date DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_status text DEFAULT 'ABERTO',
  p_pagina integer DEFAULT 1,
  p_tamanho_pagina integer DEFAULT 8,
  p_lancamento_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_base jsonb;
  v_search text := nullif(lower(btrim(coalesce(p_busca, ''))), '');
  v_modality text := upper(btrim(coalesce(p_modalidade, 'TODOS')));
  v_status text := upper(btrim(coalesce(p_status, 'ABERTO')));
  v_page integer := greatest(coalesce(p_pagina, 1), 1);
  v_page_size integer := least(50, greatest(coalesce(p_tamanho_pagina, 8), 1));
  v_today date := (statement_timestamp() AT TIME ZONE 'America/Maceio')::date;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR p_aluno_id IS NULL
     OR public.current_aluno_id() IS NULL
     OR p_aluno_id IS DISTINCT FROM public.current_aluno_id() THEN
    RAISE EXCEPTION 'Financeiro do aluno não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('ABERTO', 'ATRASADO', 'PAGO', 'TODOS') THEN
    RAISE EXCEPTION 'Filtro de status inválido.' USING ERRCODE = '22023';
  END IF;
  IF v_modality NOT IN (
    'TODOS', 'DISCIPLINA', 'EAD', 'TECNICO', 'LIVRE',
    'ESPECIALIZACAO', 'OUTROS'
  ) THEN
    RAISE EXCEPTION 'Filtro de modalidade inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_data_inicial IS NOT NULL
     AND p_data_final IS NOT NULL
     AND p_data_inicial > p_data_final THEN
    RAISE EXCEPTION 'A data inicial não pode ser posterior à data final.'
      USING ERRCODE = '22023';
  END IF;

  v_base := public.get_aluno_financeiro_portal_secure(p_aluno_id);

  WITH raw_rows AS (
    SELECT
      element.row_data,
      (element.row_data->>'id')::uuid AS item_id,
      upper(btrim(coalesce(element.row_data->>'status', ''))) AS raw_status,
      (element.row_data->>'data_vencimento')::date AS due_date,
      greatest(
        coalesce(nullif(element.row_data->>'valor_pago', '')::numeric, 0),
        0
      ) AS effective_paid,
      greatest(coalesce(
        nullif(element.row_data #>> '{financial_summary,baseValue}', '')::numeric,
        nullif(element.row_data->>'valor', '')::numeric,
        0
      ), 0) AS base_value,
      greatest(coalesce(
        nullif(element.row_data #>> '{financial_summary,punctualDiscount}', '')::numeric,
        0
      ), 0) AS punctual_discount,
      greatest(coalesce(
        nullif(element.row_data #>> '{financial_summary,totalUntilDue}', '')::numeric,
        nullif(element.row_data->>'valor', '')::numeric,
        0
      ), 0) AS total_until_due,
      greatest(coalesce(
        nullif(element.row_data #>> '{financial_summary,interestPercent}', '')::numeric,
        0
      ), 0) AS interest_percent,
      greatest(coalesce(
        nullif(element.row_data #>> '{financial_summary,lateFeeValue}', '')::numeric,
        0
      ), 0) AS inherited_late_fee,
      coalesce(
        nullif(element.row_data #>> '{financial_summary,canLateCharge}', '')::boolean,
        false
      ) AS can_late_charge,
      (
        lower(coalesce(element.row_data->>'gateway_provider', '')) = 'banese_card'
        AND upper(coalesce(element.row_data->>'gateway_payment_method', '')) = 'BOLETO'
        AND length(regexp_replace(
          coalesce(element.row_data->>'gateway_boleto_linha_digitavel', ''),
          '\D', '', 'g'
        )) = 47
        AND length(regexp_replace(
          coalesce(element.row_data->>'gateway_boleto_codigo_barras', ''),
          '\D', '', 'g'
        )) = 44
      ) AS has_registered_banese_boleto,
      CASE
        WHEN coalesce(
          nullif(element.row_data->>'cobranca_disciplina_avulsa', '')::boolean,
          false
        ) OR upper(coalesce(element.row_data->>'tipo_lancamento', ''))
          IN ('DISCIPLINA', 'DEPENDENCIA') THEN 'DISCIPLINA'
        WHEN coalesce(
          nullif(upper(element.row_data->>'modalidade'), ''),
          nullif(upper(element.row_data->>'courseModality'), ''),
          nullif(upper(element.row_data #>> '{turmas,cursos,modalidade}'), '')
        ) IN ('DISCIPLINA', 'EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO')
          THEN coalesce(
            nullif(upper(element.row_data->>'modalidade'), ''),
            nullif(upper(element.row_data->>'courseModality'), ''),
            nullif(upper(element.row_data #>> '{turmas,cursos,modalidade}'), '')
          )
        ELSE 'OUTROS'
      END AS modality
    FROM jsonb_array_elements(coalesce(v_base->'rows', '[]'::jsonb))
      AS element(row_data)
    WHERE upper(btrim(coalesce(element.row_data->>'status', '')))
      NOT IN ('CANCELADO', 'ESTORNADO')
  ),
  classified AS (
    SELECT
      raw_rows.*,
      CASE
        WHEN raw_status = 'PAGO' THEN 'PAGO'
        WHEN raw_status = 'VENCIDO' THEN 'ATRASADO'
        WHEN raw_status = 'PENDENTE' AND due_date < v_today THEN 'ATRASADO'
        WHEN raw_status = 'PENDENTE' THEN 'ABERTO'
        ELSE raw_status
      END AS status_code,
      coalesce(
        raw_status = 'VENCIDO'
          OR (raw_status = 'PENDENTE' AND due_date < v_today),
        false
      ) AS is_overdue
    FROM raw_rows
  ),
  charges AS (
    SELECT
      classified.*,
      CASE
        WHEN has_registered_banese_boleto OR NOT is_overdue OR NOT can_late_charge
          THEN 0::numeric
        ELSE round(
          base_value * interest_percent / 30.0 / 100.0
            * greatest(v_today - due_date, 0),
          2
        )
      END AS interest_value,
      CASE
        WHEN has_registered_banese_boleto OR NOT is_overdue OR NOT can_late_charge
          THEN 0::numeric
        ELSE inherited_late_fee
      END AS late_fee_value
    FROM classified
  ),
  due_values AS (
    SELECT
      charges.*,
      CASE
        WHEN status_code = 'PAGO' THEN effective_paid
        WHEN has_registered_banese_boleto THEN base_value
        WHEN is_overdue THEN round(base_value + interest_value + late_fee_value, 2)
        ELSE total_until_due
      END AS amount_due
    FROM charges
  ),
  canonical_rows AS (
    SELECT
      due_values.*,
      CASE
        WHEN status_code IN ('ABERTO', 'ATRASADO')
          THEN greatest(round(amount_due - effective_paid, 2), 0)
        ELSE 0::numeric
      END AS outstanding_value
    FROM due_values
  ),
  items_base AS (
    SELECT
      canonical_rows.*,
      row_data || jsonb_build_object(
        'descricao', coalesce(
          nullif(btrim(row_data->>'descricao'), ''),
          'Cobrança acadêmica'
        ),
        'categoria', coalesce(
          nullif(btrim(row_data->>'categoria'), ''),
          'Mensalidade'
        ),
        'valor', base_value,
        'valor_pago', effective_paid,
        'status', CASE status_code
          WHEN 'ABERTO' THEN 'PENDENTE'
          WHEN 'ATRASADO' THEN 'VENCIDO'
          ELSE status_code
        END,
        'statusCode', status_code,
        'statusLabel', CASE status_code
          WHEN 'ABERTO' THEN 'Em aberto'
          WHEN 'ATRASADO' THEN 'Atrasado'
          WHEN 'PAGO' THEN 'Pago'
          ELSE 'Não informado'
        END,
        'isOverdue', is_overdue,
        'receiptEligible', status_code = 'PAGO',
        'modalidade', modality,
        'cursoId', row_data #>> '{turmas,cursos,id}',
        'cursoNome', coalesce(
          nullif(row_data->>'cursoNome', ''),
          nullif(row_data #>> '{turmas,cursos,nome}', ''),
          CASE WHEN modality = 'DISCIPLINA' THEN '' ELSE 'Sem curso vinculado' END
        ),
        'turmaNome', CASE
          WHEN modality = 'DISCIPLINA' THEN ''
          ELSE coalesce(nullif(row_data #>> '{turmas,nome}', ''), 'N/A')
        END,
        'chargeKind', CASE
          WHEN modality = 'DISCIPLINA' THEN 'Disciplina'
          WHEN modality = 'EAD'
            AND lower(coalesce(row_data->>'descricao', '')) LIKE '%inscri%'
            THEN 'Inscrição EAD'
          WHEN upper(coalesce(row_data->>'tipo_lancamento', '')) = 'REMATRICULA'
            OR lower(coalesce(row_data->>'descricao', '')) LIKE '%rematricula%'
            OR lower(coalesce(row_data->>'descricao', '')) LIKE '%rematrícula%'
            THEN 'Rematrícula'
          WHEN upper(coalesce(row_data->>'tipo_lancamento', '')) = 'MATRICULA'
            OR lower(coalesce(row_data->>'descricao', '')) LIKE '%matricula%'
            OR lower(coalesce(row_data->>'descricao', '')) LIKE '%matrícula%'
            THEN 'Matrícula'
          WHEN upper(coalesce(row_data->>'tipo_lancamento', '')) = 'PARCELA'
            OR lower(coalesce(row_data->>'descricao', '')) LIKE '%mensalidade%'
            THEN concat(
              'Mensalidade',
              CASE WHEN nullif(row_data->>'parcela_numero', '') IS NULL THEN ''
                ELSE concat(' ', row_data->>'parcela_numero') END
            )
          WHEN modality = 'EAD' THEN 'Cobrança EAD'
          ELSE 'Cobrança'
        END,
        'isIsolatedDependency', modality = 'DISCIPLINA',
        'valueOutstanding', outstanding_value,
        'financial_summary', jsonb_build_object(
          'baseValue', base_value,
          'paidValue', effective_paid,
          'punctualDiscount', punctual_discount,
          'totalUntilDue', total_until_due,
          'interestPercent', CASE
            WHEN has_registered_banese_boleto OR NOT can_late_charge THEN 0
            ELSE interest_percent
          END,
          'interestValue', interest_value,
          'lateFeeValue', late_fee_value,
          'totalWithLate', CASE
            WHEN has_registered_banese_boleto THEN base_value
            ELSE round(base_value + interest_value + late_fee_value, 2)
          END,
          'highlightValue', CASE
            WHEN status_code = 'PAGO' THEN effective_paid
            ELSE outstanding_value
          END,
          'highlightLabel', CASE
            WHEN status_code = 'PAGO' THEN 'Valor pago'
            WHEN is_overdue THEN 'Saldo em atraso'
            ELSE 'Saldo até o vencimento'
          END,
          'hasDiscount', punctual_discount > 0,
          'hasLateCharge', interest_value > 0 OR late_fee_value > 0,
          'canLateCharge', can_late_charge AND NOT has_registered_banese_boleto
        )
      ) AS item
    FROM canonical_rows
  ),
  summary AS (
    SELECT
      coalesce(sum(effective_paid), 0)::numeric AS total_paid,
      coalesce(sum(outstanding_value), 0)::numeric AS total_pending,
      count(*)::bigint AS record_count
    FROM items_base
  ),
  open_by_modality AS (
    SELECT
      modality,
      count(*)::bigint AS item_count,
      coalesce(sum(outstanding_value), 0)::numeric AS total_value
    FROM items_base
    WHERE status_code IN ('ABERTO', 'ATRASADO')
    GROUP BY modality
  ),
  context_filtered AS (
    SELECT *
    FROM items_base
    WHERE (
      p_lancamento_id IS NOT NULL AND item_id = p_lancamento_id
    ) OR (
      p_lancamento_id IS NULL
      AND (
        v_search IS NULL
        OR lower(concat_ws(' ',
          row_data->>'descricao',
          row_data->>'categoria',
          row_data->>'forma_pagamento',
          row_data #>> '{turmas,nome}',
          row_data #>> '{turmas,cursos,nome}',
          status_code,
          modality
        )) LIKE '%' || v_search || '%'
      )
      AND (p_data_inicial IS NULL OR due_date IS NULL OR due_date >= p_data_inicial)
      AND (p_data_final IS NULL OR due_date IS NULL OR due_date <= p_data_final)
      AND (v_modality = 'TODOS' OR modality = v_modality)
    )
  ),
  counts AS (
    SELECT
      count(*) FILTER (WHERE status_code = 'ABERTO')::bigint AS aberto,
      count(*) FILTER (WHERE status_code = 'ATRASADO')::bigint AS atrasado,
      count(*) FILTER (WHERE status_code = 'PAGO')::bigint AS pago,
      count(*)::bigint AS todos
    FROM context_filtered
  ),
  status_filtered AS (
    SELECT *
    FROM context_filtered
    WHERE p_lancamento_id IS NOT NULL
      OR v_status = 'TODOS'
      OR status_code = v_status
  ),
  page_metrics AS (
    SELECT
      count(*)::bigint AS total_items,
      greatest(1, ceil(count(*)::numeric / v_page_size)::integer) AS total_pages
    FROM status_filtered
  ),
  page_context AS (
    SELECT
      total_items,
      total_pages,
      CASE WHEN p_lancamento_id IS NOT NULL THEN 1
        ELSE least(v_page, total_pages) END AS current_page
    FROM page_metrics
  ),
  ordered AS (
    SELECT
      status_filtered.*,
      row_number() OVER (
        ORDER BY
          CASE modality
            WHEN 'DISCIPLINA' THEN 1 WHEN 'EAD' THEN 2
            WHEN 'TECNICO' THEN 3 WHEN 'LIVRE' THEN 4
            WHEN 'ESPECIALIZACAO' THEN 5 ELSE 6
          END,
          due_date ASC NULLS LAST,
          lower(coalesce(row_data->>'descricao', '')),
          item_id
      ) AS ordinal
    FROM status_filtered
  ),
  paged AS (
    SELECT ordered.item, ordered.ordinal
    FROM ordered
    CROSS JOIN page_context
    WHERE ordered.ordinal > (page_context.current_page - 1) * v_page_size
      AND ordered.ordinal <= page_context.current_page * v_page_size
  ),
  items AS (
    SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb) AS data
    FROM paged
  )
  SELECT jsonb_build_object(
    'items', items.data,
    'summary', jsonb_build_object(
      'totalPaid', summary.total_paid,
      'totalPending', summary.total_pending,
      'recordCount', summary.record_count,
      'openByModality', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'modality', modality,
          'count', item_count,
          'total', total_value
        ) ORDER BY modality)
        FROM open_by_modality
      ), '[]'::jsonb)
    ),
    'filters', jsonb_build_object(
      'counts', jsonb_build_object(
        'ABERTO', counts.aberto,
        'ATRASADO', counts.atrasado,
        'PAGO', counts.pago,
        'TODOS', counts.todos
      )
    ),
    'pagination', jsonb_build_object(
      'currentPage', page_context.current_page,
      'pageSize', v_page_size,
      'totalItems', page_context.total_items,
      'totalPages', page_context.total_pages
    )
  )
  INTO v_result
  FROM items
  CROSS JOIN summary
  CROSS JOIN counts
  CROSS JOIN page_context;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_aluno_financeiro_listar(
  uuid, text, date, date, text, text, integer, integer, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_aluno_financeiro_listar(
  uuid, text, date, date, text, text, integer, integer, uuid
) TO authenticated;

COMMENT ON FUNCTION public.portal_aluno_financeiro_listar(
  uuid, text, date, date, text, text, integer, integer, uuid
) IS 'Lista o Financeiro do Aluno com valor efetivo, encargos, status civil, filtros, contagens e paginação canônicos.';

NOTIFY pgrst, 'reload schema';

COMMIT;

