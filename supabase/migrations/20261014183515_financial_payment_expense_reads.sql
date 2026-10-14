BEGIN;
CREATE FUNCTION internal_financial_payments.expense_summary(p_source_id uuid,p_polo_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.despesas_lancamentos%ROWTYPE; base jsonb; target record; paid bigint; reduced bigint;
BEGIN
  SELECT * INTO r FROM public.despesas_lancamentos WHERE id=p_source_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  base:=internal_financial_payments.summary('EXPENSE',p_source_id,to_jsonb(r));
  IF p_polo_id IS NULL OR p_polo_id=r.polo_id THEN RETURN base; END IF;
  SELECT * INTO target FROM (
    SELECT polo_id,round(valor_total*100)::bigint AS nominal,
      coalesce(sum(round(valor_total*100)::bigint) OVER(ORDER BY polo_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_weight,
      sum(round(valor_total*100)::bigint) OVER() AS total_weight
    FROM public.despesas_lancamentos_rateios WHERE despesa_lancamento_id=p_source_id
  ) weights WHERE polo_id=p_polo_id;
  IF NOT FOUND OR target.total_weight<=0 THEN RETURN NULL; END IF;
  IF (base->>'hasEvents')::boolean THEN
    -- Use the same per-component economic cash allocation as the Caixa projection.
    SELECT coalesce(sum(floor(c.amount_cents::numeric*(target.before_weight+target.nominal)/target.total_weight)
      -floor(c.amount_cents::numeric*target.before_weight/target.total_weight)),0)::bigint INTO paid
    FROM public.financial_payment_components c JOIN public.financial_payment_events e ON e.id=c.event_id
    WHERE e.source_kind='EXPENSE' AND e.source_id=p_source_id AND e.reversed_at IS NULL;
  ELSE
    paid:=internal_financial_payments.cents(base->'previouslyPaid');
    paid:=floor(paid::numeric*(target.before_weight+target.nominal)/target.total_weight)
      -floor(paid::numeric*target.before_weight/target.total_weight);
  END IF;
  reduced:=internal_financial_payments.cents(base->'remainingBefore');
  reduced:=floor(reduced::numeric*(target.before_weight+target.nominal)/target.total_weight)
    -floor(reduced::numeric*target.before_weight/target.total_weight);
  RETURN base||jsonb_build_object('originalAmount',internal_financial_payments.money(target.nominal),
    'previouslyPaid',internal_financial_payments.money(paid),
    'remainingBefore',internal_financial_payments.money(reduced));
END $$;
ALTER FUNCTION public.listar_despesas_economicas_detalhadas_secure(text,uuid,uuid,text,date,date,text,uuid)
 RENAME TO listar_despesas_economicas_before_payment_ledger;
REVOKE ALL ON FUNCTION public.listar_despesas_economicas_before_payment_ledger(text,uuid,uuid,text,date,date,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.listar_despesas_economicas_detalhadas_secure(
 p_tipo text,p_polo_id uuid,p_categoria_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
 p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'todos',p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  despesa_lancamento_id uuid,
  polo_id uuid,
  polo_nome text,
  tipo text,
  descricao text,
  valor_base numeric,
  juros_valor numeric,
  multa_valor numeric,
  desconto_valor numeric,
  valor numeric,
  data_lancamento date,
  data_vencimento date,
  data_pagamento date,
  valor_pago numeric,
  status text,
  categoria_financeira_id uuid,
  categoria_nome text,
  fornecedor_id uuid,
  fornecedor_nome text,
  forma_pagamento text,
  conta_bancaria_id uuid,
  conta_bancaria_nome text,
  parcela_numero integer,
  total_parcelas integer,
  grupo_parcelas_id uuid,
  observacao text,
  turma_id uuid,
  turma_nome text,
  anexo_bucket text,
  anexo_path text,
  anexo_nome text,
  anexo_mime text,
  anexo_tamanho bigint,
  cancelamento_motivo text,
  cancelado_em timestamptz,
  estornado_em timestamptz,
  created_at timestamptz,
  is_rateio_derivado boolean,
  rateio_modo text,
  rateio_polos_quantidade integer,
  polo_matriz_id uuid,
  polo_matriz_nome text,
  convenio_mes_id uuid,
  convenio_id uuid,
  convenio_nome text,
  convenio_competencia date,
  payment_summary jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT
    item.id,
    item.despesa_lancamento_id,
    item.polo_id,
    item.polo_nome,
    item.tipo,
    item.descricao,
    item.valor_base,
    item.juros_valor,
    item.multa_valor,
    item.desconto_valor,
    item.valor,
    item.data_lancamento,
    item.data_vencimento,
    item.data_pagamento,
    CASE WHEN (s.value->>'hasEvents')::boolean THEN (s.value->>'previouslyPaid')::numeric ELSE item.valor_pago END,
    item.status,
    item.categoria_financeira_id,
    item.categoria_nome,
    item.fornecedor_id,
    item.fornecedor_nome,
    item.forma_pagamento,
    item.conta_bancaria_id,
    item.conta_bancaria_nome,
    item.parcela_numero,
    item.total_parcelas,
    item.grupo_parcelas_id,
    item.observacao,
    item.turma_id,
    item.turma_nome,
    item.anexo_bucket,
    item.anexo_path,
    item.anexo_nome,
    item.anexo_mime,
    item.anexo_tamanho,
    item.cancelamento_motivo,
    item.cancelado_em,
    item.estornado_em,
    item.created_at,
    item.is_rateio_derivado,
    item.rateio_modo,
    item.rateio_polos_quantidade,
    item.polo_matriz_id,
    item.polo_matriz_nome,
    item.convenio_mes_id,
    item.convenio_id,
    item.convenio_nome,
    item.convenio_competencia,
    s.value
 FROM public.listar_despesas_economicas_before_payment_ledger(
   p_tipo,p_polo_id,p_categoria_id,p_search,p_due_start,p_due_end,p_status_scope,p_turma_id) item
 CROSS JOIN LATERAL (SELECT internal_financial_payments.expense_summary(item.despesa_lancamento_id,
   CASE WHEN item.is_rateio_derivado THEN item.polo_id ELSE NULL END) AS value) s;
$$;
CREATE OR REPLACE FUNCTION public.get_despesas_economicas_summary_secure(
 p_tipo text,p_polo_id uuid,p_categoria_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
 p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'todos',p_turma_id uuid DEFAULT NULL
) RETURNS TABLE(total_value numeric,paid_value numeric,pending_value numeric,vencidos_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(item.valor) FILTER(WHERE item.status<>'CANCELADO'),0)::numeric(15,2),
   coalesce(sum((s.value->>'previouslyPaid')::numeric) FILTER(WHERE item.status<>'CANCELADO'),0)::numeric(15,2),
   coalesce(sum((s.value->>'remainingBefore')::numeric) FILTER(WHERE item.status IN ('PENDENTE','VENCIDO')),0)::numeric(15,2),
   count(*) FILTER(WHERE item.status='VENCIDO' OR (item.status='PENDENTE' AND item.data_vencimento<current_date))
 FROM public.listar_despesas_economicas_secure(
   p_tipo,p_polo_id,p_categoria_id,p_search,p_due_start,p_due_end,p_status_scope,p_turma_id) item
 CROSS JOIN LATERAL (SELECT internal_financial_payments.expense_summary(item.despesa_lancamento_id,
   CASE WHEN item.is_rateio_derivado THEN item.polo_id ELSE NULL END) AS value) s;
$$;
CREATE OR REPLACE FUNCTION public.get_despesas_economicas_group_summary_secure(
 p_tipo text,p_polo_id uuid,p_categoria_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
 p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'todos',p_turma_id uuid DEFAULT NULL
) RETURNS TABLE(categoria_id uuid,categoria_nome text,total_value numeric,paid_value numeric,item_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT item.categoria_financeira_id,coalesce(item.categoria_nome,'Sem categoria')::text,
   coalesce(sum(item.valor) FILTER(WHERE item.status<>'CANCELADO'),0)::numeric(15,2),
   coalesce(sum((s.value->>'previouslyPaid')::numeric) FILTER(WHERE item.status<>'CANCELADO'),0)::numeric(15,2),count(*)
 FROM public.listar_despesas_economicas_secure(
   p_tipo,p_polo_id,p_categoria_id,p_search,p_due_start,p_due_end,p_status_scope,p_turma_id) item
 CROSS JOIN LATERAL (SELECT internal_financial_payments.expense_summary(item.despesa_lancamento_id,
   CASE WHEN item.is_rateio_derivado THEN item.polo_id ELSE NULL END) AS value) s
 GROUP BY item.categoria_financeira_id,item.categoria_nome
 ORDER BY coalesce(item.categoria_nome,'Sem categoria'),item.categoria_financeira_id;
$$;
REVOKE ALL ON FUNCTION internal_financial_payments.expense_summary(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.listar_despesas_economicas_detalhadas_secure(text,uuid,uuid,text,date,date,text,uuid)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.listar_despesas_economicas_detalhadas_secure(text,uuid,uuid,text,date,date,text,uuid) TO authenticated;
COMMIT;
