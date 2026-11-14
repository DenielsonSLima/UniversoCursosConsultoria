-- Perfil do professor no Gestor: leitura exata, paginada e autorizada.
-- Não altera lançamentos, RLS existentes nem o portal autenticado do professor.
CREATE OR REPLACE FUNCTION public.parceiro_professor_financeiro_visualizacao(
  p_professor_id uuid,
  p_polo_id uuid,
  p_source text DEFAULT 'despesas',
  p_status text DEFAULT 'todos',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '8s'
AS $function$
DECLARE
  v_permission text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR NOT coalesce(public.gestor_has_module('parceiros'), false)
    OR NOT coalesce(public.is_financeiro_for_polo(p_polo_id), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao financeiro deste professor.' USING ERRCODE = '42501';
  END IF;

  IF p_professor_id IS NULL OR p_polo_id IS NULL
    OR p_source IS NULL OR p_source NOT IN ('despesas', 'outros-debitos', 'historico', 'mensalidades', 'servicos', 'outros-creditos')
    OR p_status IS NULL OR p_status NOT IN ('todos', 'abertos', 'pagos', 'cancelados')
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Filtros financeiros inválidos.' USING ERRCODE = '22023';
  END IF;

  v_permission := CASE p_source
    WHEN 'despesas' THEN 'despesas' WHEN 'historico' THEN 'despesas'
    WHEN 'outros-debitos' THEN 'outros-debitos'
    WHEN 'mensalidades' THEN 'receber' WHEN 'servicos' THEN 'receber'
    WHEN 'outros-creditos' THEN 'outros-creditos' END;
  IF NOT coalesce(public.gestor_has_effective_financeiro_tab(v_permission), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado a esta origem financeira.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.parceiros professor
    WHERE professor.id = p_professor_id AND professor.tipo = 'Professor'
      AND public.is_partner_in_gestor_scope(professor.polo_id, professor.polo_ids)
  ) THEN
    RAISE EXCEPTION 'Perfil do professor não autorizado.' USING ERRCODE = '42501';
  END IF;

  WITH base AS MATERIALIZED (
    SELECT d.id, d.fornecedor_id AS partner_id, d.polo_id, d.descricao,
      d.valor, d.valor_pago, d.status, d.data_vencimento, d.data_pagamento,
      d.forma_pagamento, d.tipo AS categoria, d.valor_base, d.juros_valor,
      d.multa_valor, d.desconto_valor, d.observacao, d.parcela_numero, d.total_parcelas
    FROM public.despesas_lancamentos d
    WHERE p_source IN ('despesas', 'outros-debitos')
      AND d.fornecedor_id = p_professor_id AND d.polo_id = p_polo_id AND d.excluido_em IS NULL
      AND ((p_source = 'despesas' AND d.tipo IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL'))
        OR (p_source = 'outros-debitos' AND d.tipo = 'OUTRO_DEBITO'))

    UNION ALL

    SELECT c.id, c.fornecedor_id, c.polo_id, c.descricao,
      c.valor, c.valor_pago, c.status, c.data_vencimento, c.data_pagamento,
      c.forma_pagamento, c.categoria, NULL::numeric, NULL::numeric,
      NULL::numeric, NULL::numeric, NULL::text, NULL::integer, NULL::integer
    FROM public.contas_pagar c
    WHERE p_source = 'historico' AND c.fornecedor_id = p_professor_id AND c.polo_id = p_polo_id
      -- Uma despesa já mostrada na fonte atual não reaparece como conta anterior.
      AND c.despesa_lancamento_id IS NULL

    UNION ALL

    SELECT c.id, c.cliente_id, c.polo_id, c.descricao,
      c.valor, c.valor_pago, c.status, c.data_vencimento, c.data_pagamento,
      c.forma_pagamento, c.categoria, NULL::numeric, NULL::numeric,
      NULL::numeric, NULL::numeric, NULL::text, c.parcela_numero, NULL::integer
    FROM public.contas_receber c
    WHERE c.cliente_id = p_professor_id AND c.polo_id = p_polo_id
      AND (
        (p_source = 'mensalidades'
          AND NOT EXISTS (SELECT 1 FROM private.nfse_service_receivables l WHERE l.receivable_id = c.id)
          AND (
          c.categoria = 'MENSALIDADE'
          OR (c.categoria = 'OUTROS_CREDITOS' AND (
            c.matricula_id IS NOT NULL OR c.turma_id IS NOT NULL OR c.origem_cronograma_id IS NOT NULL
            OR coalesce(c.tipo_lancamento, '') IN ('MATRICULA', 'PARCELA', 'REMATRICULA', 'DEPENDENCIA')
            OR EXISTS (SELECT 1 FROM public.inscricoes_online i WHERE i.receivable_id = c.id)
            OR EXISTS (SELECT 1 FROM public.matricula_dependencia_cobrancas m WHERE m.conta_receber_id = c.id)
            OR EXISTS (SELECT 1 FROM internal_proesc.obligation_links l WHERE l.receivable_id = c.id)
          ))
        ))
        OR (p_source = 'servicos' AND EXISTS (
          SELECT 1 FROM private.nfse_service_receivables l
          JOIN private.nfse_individual_operations o ON o.id = l.operation_id
          WHERE l.receivable_id = c.id
        ))
        OR (p_source = 'outros-creditos' AND c.categoria = 'OUTROS_CREDITOS'
          -- Mesmas fronteiras das fontes canônicas de Outros Créditos.
          AND c.matricula_id IS NULL AND c.turma_id IS NULL AND c.origem_cronograma_id IS NULL
          AND coalesce(c.tipo_lancamento, '') NOT IN ('MATRICULA', 'PARCELA', 'REMATRICULA', 'DEPENDENCIA')
          AND NOT EXISTS (SELECT 1 FROM public.inscricoes_online i WHERE i.receivable_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM public.matricula_dependencia_cobrancas m WHERE m.conta_receber_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM internal_proesc.obligation_links l WHERE l.receivable_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM public.emprestimos_financeiros e WHERE e.conta_receber_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM public.convenios_financeiros_creditos f WHERE f.conta_receber_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM private.nfse_service_receivables l WHERE l.receivable_id = c.id)
        )
      )
  ), filtered AS MATERIALIZED (
    SELECT * FROM base
    WHERE p_status = 'todos'
      OR (p_status = 'abertos' AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO'))
      OR (p_status = 'pagos' AND status = 'PAGO')
      OR (p_status = 'cancelados' AND status IN ('CANCELADO', 'ESTORNADO', 'DEVOLVIDO'))
  ), page AS (
    SELECT * FROM filtered ORDER BY data_vencimento ASC NULLS LAST, id
    LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
  )
  SELECT jsonb_build_object(
    'professorId', p_professor_id, 'poloId', p_polo_id, 'source', p_source,
    'items', coalesce((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.data_vencimento ASC NULLS LAST, item.id) FROM page item), '[]'::jsonb),
    'totalItems', (SELECT count(*) FROM filtered), 'page', p_page, 'pageSize', p_page_size
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.parceiro_professor_financeiro_visualizacao(uuid, uuid, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.parceiro_professor_financeiro_visualizacao(uuid, uuid, text, text, integer, integer)
  TO authenticated;
COMMENT ON FUNCTION public.parceiro_professor_financeiro_visualizacao(uuid, uuid, text, text, integer, integer)
  IS 'Leitura financeira paginada do professor pelo Gestor, com permissão efetiva, parceiro e unidade exatos.';
NOTIFY pgrst, 'reload schema';
