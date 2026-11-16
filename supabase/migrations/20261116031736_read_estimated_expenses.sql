BEGIN;
CREATE FUNCTION public.get_despesas_estimativas_secure(p_despesa_ids uuid[])
RETURNS TABLE (
  id uuid, despesa_lancamento_id uuid, valor_estimado boolean,
  valor_estimado_original numeric, valor_confirmado_em timestamptz,
  valor_confirmado_por uuid, valor_estimado_versao integer, is_estimativa_pendente boolean,
  pagamento_unico boolean, valor_sem_cobranca_em timestamptz, valor_sem_cobranca_por uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF coalesce(cardinality(p_despesa_ids),0) > 5000 THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_INVALID_INPUT';
  END IF;
  RETURN QUERY
  WITH requested AS (SELECT DISTINCT unnest(p_despesa_ids) AS requested_id), resolved AS (
    SELECT q.requested_id, coalesce(r.despesa_lancamento_id,q.requested_id) AS source_id,
      r.polo_id AS rateio_polo_id, r.id AS rateio_id
    FROM requested q LEFT JOIN public.despesas_lancamentos_rateios r ON r.id=q.requested_id
  )
  SELECT q.requested_id, d.id, d.valor_estimado,
    CASE WHEN q.rateio_id IS NOT NULL AND d.valor_estimado_original IS NOT NULL THEN
      public.financeiro_dividir_centavos(d.valor_estimado_original,
        (SELECT count(*)::integer FROM public.despesas_lancamentos_rateios r WHERE r.despesa_lancamento_id=d.id),
        (SELECT count(*)::integer FROM public.despesas_lancamentos_rateios r
          WHERE r.despesa_lancamento_id=d.id AND r.polo_id<=q.rateio_polo_id))
      ELSE d.valor_estimado_original END,
    d.valor_confirmado_em,d.valor_confirmado_por,d.valor_estimado_versao,
    d.valor_estimado AND d.valor_confirmado_em IS NULL AND d.status IN ('PENDENTE','VENCIDO'),
    q.rateio_id IS NULL AND d.status='PAGO'
      AND (SELECT count(*)=1 AND coalesce(bool_and(e.reversed_at IS NULL),false)
        FROM public.financial_payment_events e WHERE e.source_kind='EXPENSE' AND e.source_id=d.id)
      AND (SELECT count(*)=1 FROM public.financial_payment_components component
        JOIN public.financial_payment_events event ON event.id=component.event_id
        WHERE event.source_kind='EXPENSE' AND event.source_id=d.id),
    d.valor_sem_cobranca_em,d.valor_sem_cobranca_por
  FROM resolved q JOIN public.despesas_lancamentos d ON d.id=q.source_id
  WHERE d.excluido_em IS NULL AND (
    (q.rateio_id IS NULL AND internal_financial_payments.actor_allowed(auth.uid(),d.polo_id,
      CASE WHEN d.tipo='OUTRO_DEBITO' THEN 'outros-debitos' ELSE 'despesas' END))
    OR EXISTS (SELECT 1 FROM public.despesas_lancamentos_rateios r
      WHERE r.despesa_lancamento_id=d.id AND q.rateio_id IS NOT NULL AND r.id=q.rateio_id
        AND internal_financial_payments.actor_allowed(auth.uid(),r.polo_id,
          CASE WHEN d.tipo='OUTRO_DEBITO' THEN 'outros-debitos' ELSE 'despesas' END))
  );
END $$;

-- The same physical/economic choice as the existing readers. All-polo results
-- authorize every physical source; scoped results reuse the current economic RPC.
CREATE FUNCTION private.estimated_expense_summary_items(
  p_tipo text, p_polo_id uuid, p_categoria_id uuid, p_search text,
  p_due_start date, p_due_end date, p_status_scope text, p_turma_id uuid
)
RETURNS TABLE (categoria_id uuid, fornecedor_id uuid, data_vencimento date, status text,
  valor numeric, payment_summary jsonb, estimativa_pendente boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_start date := p_due_start;
  v_end date := p_due_end;
  v_search text := nullif(public.financeiro_normalize_search_text(btrim(coalesce(p_search,''))),'');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_tipo IS NOT NULL AND p_tipo NOT IN ('DESPESA_FIXA','DESPESA_VARIAVEL','OUTRO_DEBITO')
    OR p_status_scope NOT IN ('todos','em_aberto','mes_atual') THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_INVALID_INPUT';
  END IF;
  IF p_polo_id IS NOT NULL AND p_tipo IS NOT NULL THEN
    IF internal_financial_payments.actor_allowed(auth.uid(),p_polo_id,
      CASE WHEN p_tipo='OUTRO_DEBITO' THEN 'outros-debitos' ELSE 'despesas' END) IS NOT TRUE THEN
      RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT item.categoria_financeira_id,item.fornecedor_id,item.data_vencimento,
      item.status,item.valor,item.payment_summary,d.valor_estimado AND d.valor_confirmado_em IS NULL
    FROM public.listar_despesas_economicas_detalhadas_secure(
      p_tipo,p_polo_id,p_categoria_id,p_search,p_due_start,p_due_end,p_status_scope,p_turma_id
    ) item JOIN public.despesas_lancamentos d ON d.id=item.despesa_lancamento_id;
    RETURN;
  END IF;
  IF p_status_scope='mes_atual' THEN
    v_start := greatest(date_trunc('month',CURRENT_DATE)::date,
      coalesce(p_due_start,date_trunc('month',CURRENT_DATE)::date));
    v_end := least((date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date,
      coalesce(p_due_end,(date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date));
  END IF;
  RETURN QUERY SELECT d.categoria_financeira_id,d.fornecedor_id,d.data_vencimento,
    d.status,d.valor,d.payment_summary,d.valor_estimado AND d.valor_confirmado_em IS NULL
  FROM public.despesas_lancamentos d
  LEFT JOIN public.categorias_financeiras c ON c.id=d.categoria_financeira_id
  LEFT JOIN public.parceiros f ON f.id=d.fornecedor_id
  LEFT JOIN public.polos p ON p.id=d.polo_id
  WHERE d.excluido_em IS NULL AND (p_tipo IS NULL OR d.tipo=p_tipo)
    AND (p_polo_id IS NULL OR d.polo_id=p_polo_id)
    AND (p_categoria_id IS NULL OR d.categoria_financeira_id=p_categoria_id)
    AND (p_turma_id IS NULL OR d.turma_id=p_turma_id)
    AND (v_start IS NULL OR d.data_vencimento>=v_start)
    AND (v_end IS NULL OR d.data_vencimento<=v_end)
    AND (p_status_scope<>'em_aberto' OR d.status IN ('PENDENTE','VENCIDO'))
    AND internal_financial_payments.actor_allowed(auth.uid(),d.polo_id,
      CASE WHEN d.tipo='OUTRO_DEBITO' THEN 'outros-debitos' ELSE 'despesas' END)
    AND (v_search IS NULL
      OR strpos(public.financeiro_normalize_search_text(d.descricao),v_search)>0
      OR strpos(public.financeiro_normalize_search_text(c.nome),v_search)>0
      OR strpos(public.financeiro_normalize_search_text(f.nome),v_search)>0
      OR strpos(public.financeiro_normalize_search_text(p.nome),v_search)>0);
END $$;

CREATE FUNCTION public.get_despesas_estimativas_resumo_secure(
  p_tipo text DEFAULT NULL, p_polo_id uuid DEFAULT NULL, p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL, p_due_start date DEFAULT NULL, p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'todos', p_turma_id uuid DEFAULT NULL,
  p_agrupamento text DEFAULT 'categoria'
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_agrupamento IS NULL OR p_agrupamento NOT IN ('categoria','mes','fornecedor') THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_INVALID_INPUT';
  END IF;
  WITH items AS MATERIALIZED (
    SELECT item.*, CASE p_agrupamento
      WHEN 'mes' THEN coalesce(to_char(item.data_vencimento,'YYYY-MM'),'__sem_vencimento__')
      WHEN 'fornecedor' THEN coalesce(item.fornecedor_id::text,'__sem_fornecedor__')
      ELSE coalesce(item.categoria_id::text,'__sem_categoria__') END AS group_key
    FROM private.estimated_expense_summary_items(
      p_tipo,p_polo_id,p_categoria_id,p_search,p_due_start,p_due_end,p_status_scope,p_turma_id) item
  ), totals AS (
    SELECT coalesce(sum(valor) FILTER (WHERE estimativa_pendente AND status IN ('PENDENTE','VENCIDO')),0) AS estimated_value,
      count(*) FILTER (WHERE estimativa_pendente AND status IN ('PENDENTE','VENCIDO')) AS estimated_count,
      coalesce(sum(coalesce((payment_summary->>'remainingBefore')::numeric,valor))
        FILTER (WHERE NOT estimativa_pendente AND status IN ('PENDENTE','VENCIDO')),0) AS confirmed_pending_value,
      count(*) FILTER (WHERE NOT estimativa_pendente AND status IN ('PENDENTE','VENCIDO')
        AND data_vencimento<(now() AT TIME ZONE 'America/Maceio')::date) AS vencidos_count FROM items
  ), groups AS (
    SELECT group_key,
      CASE WHEN p_agrupamento='categoria' THEN (array_agg(categoria_id))[1] ELSE NULL::uuid END AS categoria_id,
      coalesce(sum(valor) FILTER (WHERE estimativa_pendente AND status IN ('PENDENTE','VENCIDO')),0) AS estimated_value,
      count(*) FILTER (WHERE estimativa_pendente AND status IN ('PENDENTE','VENCIDO')) AS estimated_count,
      coalesce(sum(coalesce((payment_summary->>'remainingBefore')::numeric,valor))
        FILTER (WHERE NOT estimativa_pendente AND status IN ('PENDENTE','VENCIDO')),0) AS confirmed_pending_value
    FROM items GROUP BY group_key
  )
  SELECT to_jsonb(totals) || jsonb_build_object('groups',coalesce((
    SELECT jsonb_agg(jsonb_build_object('grupo_chave',group_key,'categoria_id',categoria_id,
      'estimated_value',estimated_value,'estimated_count',estimated_count,
      'confirmed_pending_value',confirmed_pending_value) ORDER BY group_key) FROM groups),'[]'::jsonb))
    INTO result FROM totals;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.estimated_expense_summary_items(text,uuid,uuid,text,date,date,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_despesas_estimativas_secure(uuid[]),
  public.get_despesas_estimativas_resumo_secure(text,uuid,uuid,text,date,date,text,uuid,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_despesas_estimativas_secure(uuid[]),
  public.get_despesas_estimativas_resumo_secure(text,uuid,uuid,text,date,date,text,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
