BEGIN;

-- Cash components have virtual IDs. Resolve the original receivable through
-- its payment event before looking up the immutable fiscal ledger.
CREATE FUNCTION internal_contas.caixa_source_receivable_id(p_cash_id uuid,p_payment_event_id uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT coalesce((SELECT e.source_id FROM public.financial_payment_events e
    WHERE e.id=p_payment_event_id AND e.source_kind='RECEIVABLE' AND e.reversed_at IS NULL),p_cash_id);
$function$;
CREATE FUNCTION internal_contas.caixa_nfse_service_context(p_cash_id uuid,p_payment_event_id uuid)
RETURNS TABLE(receivable_id uuid,fiscal_number text,fiscal_description text,installment_count integer)
LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT l.receivable_id,l.fiscal_number,l.fiscal_description,l.installment_count
  FROM private.nfse_service_receivables l
  WHERE l.receivable_id=internal_contas.caixa_source_receivable_id(p_cash_id,p_payment_event_id);
$function$;

CREATE FUNCTION internal_contas.caixa_classify_nfse_services(p_payload jsonb,p_polo_id uuid,p_competencia date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_amount numeric;v_count integer;v_categories jsonb;v_other jsonb;v_result jsonb;
  v_other_amount numeric;v_other_count integer;
BEGIN
  SELECT coalesce(sum(coalesce(c.valor_pago,c.valor,0)),0),count(*)::integer INTO v_amount,v_count
  FROM internal_financial_payments.cash_receivables() c
  JOIN LATERAL internal_contas.caixa_nfse_service_context(c.id,c.manual_settlement_id) fiscal ON true
  WHERE c.status='PAGO' AND c.data_pagamento>=date_trunc('month',p_competencia)::date
    AND c.data_pagamento<(date_trunc('month',p_competencia)+interval '1 month')::date
    AND (p_polo_id IS NULL OR c.polo_id=p_polo_id)
    AND NOT EXISTS(SELECT 1 FROM public.emprestimos_financeiros loan WHERE loan.conta_receber_id=fiscal.receivable_id);
  v_categories:=p_payload->'receitas_por_modalidade';
  IF jsonb_typeof(v_categories) IS DISTINCT FROM 'array'
    OR (SELECT count(*) FROM jsonb_array_elements(v_categories) item WHERE item->>'codigo'='OUTROS_CREDITOS')<>1
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_categories) item WHERE item->>'codigo'='SERVICOS_NFSE') THEN
    RAISE EXCEPTION 'Contrato de classificação das receitas do Caixa divergente.' USING ERRCODE='55000'; END IF;
  SELECT item INTO v_other FROM jsonb_array_elements(v_categories) item WHERE item->>'codigo'='OUTROS_CREDITOS';
  v_other_amount:=(v_other->>'valor')::numeric;v_other_count:=(v_other->>'quantidade')::integer;
  IF v_other_amount IS NULL OR v_other_count IS NULL OR v_other_amount<v_amount OR v_other_count<v_count THEN
    RAISE EXCEPTION 'Recebimentos de serviços não correspondem à base canônica do Caixa.' USING ERRCODE='55000'; END IF;
  WITH existing AS (
    SELECT item,ordinal::numeric ordinal FROM jsonb_array_elements(v_categories) WITH ORDINALITY rows(item,ordinal)
  ), classified AS (
    SELECT CASE WHEN item->>'codigo'='OUTROS_CREDITOS' THEN item||jsonb_build_object(
      'valor',v_other_amount-v_amount,'quantidade',v_other_count-v_count) ELSE item END item,ordinal FROM existing
    UNION ALL SELECT jsonb_build_object('codigo','SERVICOS_NFSE','rotulo','Serviços NFS-e',
      'valor',v_amount,'quantidade',v_count),ordinal-0.5 FROM existing WHERE item->>'codigo'='OUTROS_CREDITOS'
  ), total AS (SELECT sum((item->>'valor')::numeric) amount FROM classified)
  SELECT jsonb_agg(item||jsonb_build_object('percentual',CASE WHEN total.amount=0 THEN 0
      ELSE round((item->>'valor')::numeric/total.amount*100,2) END) ORDER BY ordinal)
    INTO v_result FROM classified CROSS JOIN total;
  RETURN jsonb_set(p_payload,'{receitas_por_modalidade}',v_result,false);
END;
$function$;

REVOKE ALL ON FUNCTION internal_contas.caixa_source_receivable_id(uuid,uuid),internal_contas.caixa_nfse_service_context(uuid,uuid),
  internal_contas.caixa_classify_nfse_services(jsonb,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
