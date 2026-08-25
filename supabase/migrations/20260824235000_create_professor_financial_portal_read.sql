-- Leitura canônica do Financeiro Docente. O navegador envia somente filtros
-- e apresenta o payload: estado temporal, saldos, totais e paginação são
-- resolvidos no banco usando a data civil do polo (America/Maceio).

CREATE INDEX IF NOT EXISTS contas_pagar_professor_portal_idx
  ON public.contas_pagar (fornecedor_id, polo_id, data_vencimento, id)
  WHERE upper(btrim(coalesce(status, ''))) NOT IN ('CANCELADO', 'ESTORNADO');

CREATE OR REPLACE FUNCTION public.portal_professor_financeiro_listar(
  p_professor_id uuid,
  p_polo_id uuid,
  p_busca text DEFAULT NULL,
  p_data_inicial date DEFAULT NULL,
  p_data_final date DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_status text DEFAULT 'ABERTO',
  p_pagina integer DEFAULT 1,
  p_tamanho_pagina integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_current_professor_id uuid;
  v_search text := nullif(lower(btrim(coalesce(p_busca, ''))), '');
  v_category text := nullif(lower(btrim(coalesce(p_categoria, ''))), '');
  v_status text := upper(btrim(coalesce(p_status, 'ABERTO')));
  v_requested_page integer := greatest(coalesce(p_pagina, 1), 1);
  v_page_size integer := least(50, greatest(coalesce(p_tamanho_pagina, 8), 1));
  v_today date := (statement_timestamp() AT TIME ZONE 'America/Maceio')::date;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para consultar o Financeiro Docente.'
      USING ERRCODE = '42501';
  END IF;

  v_current_professor_id := public.current_professor_id();
  IF v_current_professor_id IS NULL
     OR p_professor_id IS NULL
     OR v_current_professor_id <> p_professor_id THEN
    RAISE EXCEPTION 'O perfil informado não pertence ao professor autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_polo_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.parceiros AS professor
    WHERE professor.id = v_current_professor_id
      AND (
        professor.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(professor.polo_ids, ARRAY[]::uuid[]))
      )
  ) THEN
    RAISE EXCEPTION 'O polo informado não pertence ao escopo do professor autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('ABERTO', 'ATRASADO', 'PAGO', 'TODOS') THEN
    RAISE EXCEPTION 'Filtro de status inválido.' USING ERRCODE = '22023';
  END IF;

  IF p_data_inicial IS NOT NULL
     AND p_data_final IS NOT NULL
     AND p_data_inicial > p_data_final THEN
    RAISE EXCEPTION 'A data inicial não pode ser posterior à data final.'
      USING ERRCODE = '22023';
  END IF;

  WITH base AS (
    SELECT
      conta.id,
      coalesce(
        nullif(btrim(conta.descricao), ''),
        'Honorários docentes'
      ) AS descricao,
      coalesce(
        nullif(upper(btrim(conta.categoria)), ''),
        'NAO_INFORMADA'
      ) AS categoria_codigo,
      CASE upper(btrim(coalesce(conta.categoria, '')))
        WHEN 'DESPESA_VARIAVEL' THEN 'Despesa variável'
        WHEN 'DESPESA_ADMINISTRATIVA' THEN 'Despesa administrativa'
        WHEN 'OUTRAS_DESPESAS' THEN 'Outras despesas'
        WHEN 'ADIANTAMENTO_CEDIDO' THEN 'Adiantamento cedido'
        WHEN 'EMPRESTIMO' THEN 'Empréstimo'
        ELSE 'Honorários'
      END AS categoria,
      greatest(coalesce(conta.valor, 0), 0)::numeric AS valor_previsto,
      greatest(coalesce(conta.valor_pago, 0), 0)::numeric AS valor_pago,
      CASE
        WHEN upper(btrim(coalesce(conta.status, ''))) IN ('PENDENTE', 'VENCIDO')
          THEN greatest(
            greatest(coalesce(conta.valor, 0), 0)
              - greatest(coalesce(conta.valor_pago, 0), 0),
            0
          )::numeric
        ELSE 0::numeric
      END AS valor_em_aberto,
      conta.data_vencimento,
      conta.data_pagamento,
      conta.forma_pagamento,
      conta.created_at,
      upper(btrim(coalesce(conta.status, ''))) AS status_registrado,
      CASE
        WHEN upper(btrim(coalesce(conta.status, ''))) = 'PAGO' THEN 'PAGO'
        WHEN upper(btrim(coalesce(conta.status, ''))) = 'VENCIDO' THEN 'ATRASADO'
        WHEN upper(btrim(coalesce(conta.status, ''))) = 'PENDENTE'
             AND conta.data_vencimento < v_today THEN 'ATRASADO'
        WHEN upper(btrim(coalesce(conta.status, ''))) = 'PENDENTE' THEN 'ABERTO'
        ELSE upper(btrim(coalesce(conta.status, '')))
      END AS status_exibicao,
      polo.nome AS polo_nome,
      polo.cidade AS polo_cidade,
      polo.estado AS polo_estado
    FROM public.contas_pagar AS conta
    INNER JOIN public.polos AS polo
      ON polo.id = conta.polo_id
    WHERE conta.fornecedor_id = v_current_professor_id
      AND conta.polo_id = p_polo_id
      AND upper(btrim(coalesce(conta.status, '')))
        NOT IN ('CANCELADO', 'ESTORNADO')
  ),
  categorias AS (
    SELECT coalesce(
      jsonb_agg(categoria ORDER BY categoria),
      '[]'::jsonb
    ) AS items
    FROM (
      SELECT DISTINCT categoria
      FROM base
    ) AS categorias_unicas
  ),
  resumo AS (
    SELECT
      coalesce(sum(valor_pago), 0)::numeric AS total_recebido,
      coalesce(sum(valor_em_aberto), 0)::numeric AS total_a_receber,
      count(*)::bigint AS total_lancamentos
    FROM base
  ),
  contexto_filtrado AS (
    SELECT *
    FROM base
    WHERE (
      v_search IS NULL
      OR lower(coalesce(descricao, '')) LIKE '%' || v_search || '%'
      OR lower(categoria) LIKE '%' || v_search || '%'
      OR lower(coalesce(forma_pagamento, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(polo_nome, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(polo_cidade, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(polo_estado, '')) LIKE '%' || v_search || '%'
      OR lower(status_registrado) LIKE '%' || v_search || '%'
      OR lower(status_exibicao) LIKE '%' || v_search || '%'
    )
      AND (p_data_inicial IS NULL OR data_vencimento IS NULL OR data_vencimento >= p_data_inicial)
      AND (p_data_final IS NULL OR data_vencimento IS NULL OR data_vencimento <= p_data_final)
      AND (v_category IS NULL OR v_category = 'todos' OR lower(categoria) = v_category)
  ),
  contagens AS (
    SELECT
      count(*) FILTER (WHERE status_exibicao = 'ABERTO')::bigint AS aberto,
      count(*) FILTER (WHERE status_exibicao = 'ATRASADO')::bigint AS atrasado,
      count(*) FILTER (WHERE status_exibicao = 'PAGO')::bigint AS pago,
      count(*)::bigint AS todos
    FROM contexto_filtrado
  ),
  status_filtrado AS (
    SELECT *
    FROM contexto_filtrado
    WHERE v_status = 'TODOS' OR status_exibicao = v_status
  ),
  metricas_pagina AS (
    SELECT
      count(*)::bigint AS total_items,
      greatest(1, ceil(count(*)::numeric / v_page_size)::integer) AS total_pages
    FROM status_filtrado
  ),
  pagina AS (
    SELECT
      total_items,
      total_pages,
      least(v_requested_page, total_pages) AS current_page
    FROM metricas_pagina
  ),
  ordenados AS (
    SELECT
      item.*,
      row_number() OVER (
        ORDER BY item.data_vencimento ASC NULLS LAST, item.created_at ASC, item.id ASC
      ) AS ordinal
    FROM status_filtrado AS item
  ),
  paginados AS (
    SELECT
      jsonb_build_object(
        'id', item.id,
        'description', item.descricao,
        'categoryCode', item.categoria_codigo,
        'category', item.categoria,
        'valueExpected', item.valor_previsto,
        'valuePaid', item.valor_pago,
        'valueOutstanding', item.valor_em_aberto,
        'dueDate', item.data_vencimento,
        'paymentDate', item.data_pagamento,
        'paymentMethod', item.forma_pagamento,
        'statusCode', item.status_exibicao,
        'statusLabel', CASE item.status_exibicao
          WHEN 'ABERTO' THEN 'Em aberto'
          WHEN 'ATRASADO' THEN 'Atrasado'
          WHEN 'PAGO' THEN 'Pago'
          ELSE 'Não informado'
        END,
        'receiptEligible', item.status_exibicao = 'PAGO',
        'polo', jsonb_build_object(
          'id', p_polo_id,
          'name', item.polo_nome,
          'city', item.polo_cidade,
          'state', item.polo_estado
        )
      ) AS item,
      item.ordinal
    FROM ordenados AS item
    CROSS JOIN pagina
    WHERE item.ordinal > (pagina.current_page - 1) * v_page_size
      AND item.ordinal <= pagina.current_page * v_page_size
  ),
  items AS (
    SELECT coalesce(
      jsonb_agg(item ORDER BY ordinal),
      '[]'::jsonb
    ) AS data
    FROM paginados
  )
  SELECT jsonb_build_object(
    'items', items.data,
    'summary', jsonb_build_object(
      'totalReceived', resumo.total_recebido,
      'totalIncoming', resumo.total_a_receber,
      'recordCount', resumo.total_lancamentos
    ),
    'filters', jsonb_build_object(
      'categories', categorias.items,
      'counts', jsonb_build_object(
        'ABERTO', contagens.aberto,
        'ATRASADO', contagens.atrasado,
        'PAGO', contagens.pago,
        'TODOS', contagens.todos
      )
    ),
    'pagination', jsonb_build_object(
      'currentPage', pagina.current_page,
      'pageSize', v_page_size,
      'totalItems', pagina.total_items,
      'totalPages', pagina.total_pages
    )
  )
  INTO v_result
  FROM items
  CROSS JOIN resumo
  CROSS JOIN categorias
  CROSS JOIN contagens
  CROSS JOIN pagina;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_professor_financeiro_listar(
  uuid, uuid, text, date, date, text, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_professor_financeiro_listar(
  uuid, uuid, text, date, date, text, text, integer, integer
) TO authenticated;

COMMENT ON FUNCTION public.portal_professor_financeiro_listar(
  uuid, uuid, text, date, date, text, text, integer, integer
) IS 'Lista o Financeiro Docente com autorização, vencimento, saldos, filtros, totais e paginação calculados no backend.';

NOTIFY pgrst, 'reload schema';
