BEGIN;

ALTER FUNCTION public.listar_outros_creditos_secure(uuid)
  RENAME TO listar_outros_creditos_sem_convenios_core;
ALTER FUNCTION public.get_outros_creditos_summary(uuid, text, date, date, uuid)
  RENAME TO get_outros_creditos_summary_sem_convenios_core;

REVOKE ALL ON FUNCTION public.listar_outros_creditos_sem_convenios_core(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_outros_creditos_summary_sem_convenios_core(
  uuid, text, date, date, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.listar_outros_creditos_secure(p_polo_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_creditos jsonb;
BEGIN
  v_creditos := public.listar_outros_creditos_sem_convenios_core(p_polo_id);
  RETURN coalesce((
    SELECT jsonb_agg(item ORDER BY item ->> 'data_vencimento', item ->> 'created_at', item ->> 'id')
    FROM jsonb_array_elements(v_creditos) item
    WHERE NOT EXISTS (
      SELECT 1 FROM public.convenios_financeiros_creditos convenio_credito
      WHERE convenio_credito.conta_receber_id = (item ->> 'id')::uuid
    )
  ), '[]'::jsonb);
END;
$function$;

CREATE FUNCTION public.get_outros_creditos_summary(
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL
)
RETURNS TABLE(
  pending_count bigint,
  received_count bigint,
  canceled_count bigint,
  overdue_count bigint,
  all_count bigint,
  pending_value numeric,
  received_value numeric,
  canceled_value numeric,
  overdue_value numeric,
  all_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_search text := nullif(
    public.financeiro_normalize_search_text(btrim(coalesce(p_search, ''))), ''
  );
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT item.*
    FROM jsonb_to_recordset(public.listar_outros_creditos_secure(p_polo_id)) AS item(
      id uuid,
      polo_nome text,
      polo_cnpj text,
      polo_cidade text,
      polo_uf text,
      descricao text,
      valor numeric,
      valor_pago numeric,
      data_vencimento date,
      status text,
      categoria_financeira_id uuid,
      categoria_financeira_nome text,
      cliente_nome text,
      cliente_cpf_cnpj text,
      forma_pagamento text,
      asaas_status text
    )
    WHERE (p_due_start IS NULL OR item.data_vencimento >= p_due_start)
      AND (p_due_end IS NULL OR item.data_vencimento <= p_due_end)
      AND (p_categoria_id IS NULL OR item.categoria_financeira_id = p_categoria_id)
      AND (
        v_search IS NULL
        OR public.financeiro_normalize_search_text(item.descricao) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.categoria_financeira_nome) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.cliente_nome) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.cliente_cpf_cnpj) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.polo_nome) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.polo_cnpj) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.polo_cidade) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.polo_uf) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.forma_pagamento) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.asaas_status) LIKE '%' || v_search || '%'
      )
  )
  SELECT
    count(*) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO'))::bigint,
    count(*) FILTER (WHERE status = 'PAGO')::bigint,
    count(*) FILTER (WHERE status IN ('CANCELADO', 'ESTORNADO'))::bigint,
    count(*) FILTER (
      WHERE status = 'VENCIDO' OR (status = 'PENDENTE' AND data_vencimento < current_date)
    )::bigint,
    count(*)::bigint,
    coalesce(sum(valor) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')), 0),
    coalesce(sum(coalesce(valor_pago, valor)) FILTER (WHERE status = 'PAGO'), 0),
    coalesce(sum(valor) FILTER (WHERE status IN ('CANCELADO', 'ESTORNADO')), 0),
    coalesce(sum(valor) FILTER (
      WHERE status = 'VENCIDO' OR (status = 'PENDENTE' AND data_vencimento < current_date)
    ), 0),
    coalesce(sum(valor), 0)
  FROM filtered;
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_outros_creditos_secure(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_outros_creditos_summary(uuid, text, date, date, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_outros_creditos_secure(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_outros_creditos_summary(uuid, text, date, date, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_outros_creditos_secure(uuid) IS
  'Lista créditos avulsos e exclui empréstimos, cobranças acadêmicas e créditos vinculados a convênios financeiros.';

COMMIT;
