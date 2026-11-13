BEGIN;

CREATE OR REPLACE FUNCTION internal_financial_payments.preview_for_actor(p_actor uuid, p_source_kind text, p_source_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r jsonb; normalized jsonb; summary jsonb; amount bigint; interest bigint; penalty bigint; addition bigint;
 discount bigint; principal bigint; remaining bigint; result jsonb; events jsonb;
BEGIN
  r:=internal_financial_payments.authorize_source(p_actor,p_source_kind,p_source_id);
  -- Lock the fiscal link before preview/prepare/confirmation can create a payment intent.
  -- History readers keep their existing authorization and remain available.
  IF p_source_kind='RECEIVABLE' THEN
    PERFORM 1 FROM private.nfse_service_receivables WHERE receivable_id=p_source_id FOR SHARE;
    IF FOUND AND (EXISTS(SELECT 1 FROM private.nfse_service_receivables
        WHERE receivable_id=p_source_id AND fiscal_cancelled_at IS NOT NULL)
      OR EXISTS(SELECT 1 FROM private.nfse_service_cancellation_jobs
        WHERE receivable_id=p_source_id AND state IN ('READY','LEASED','REVIEW'))) THEN
      RAISE EXCEPTION 'PAYMENT_NFSE_FISCAL_CANCELLED' USING ERRCODE='55000';
    END IF;
  END IF;
  normalized:=internal_financial_payments.normalized_input(p_source_id,(r->>'polo_id')::uuid,p_input);
  IF p_source_kind='EXPENSE' AND (EXISTS(SELECT 1 FROM public.convenios_financeiros_despesas
    WHERE despesa_lancamento_id=p_source_id AND status='ATIVO') OR r->>'emprestimo_parcela_id' IS NOT NULL) THEN
    RAISE EXCEPTION 'PAYMENT_SPECIALIZED_FLOW_REQUIRED';
  END IF;
  IF p_source_kind='PAYABLE' AND (r->>'emprestimo_parcela_id' IS NOT NULL OR r->>'emprestimo_id' IS NOT NULL
    OR r->>'despesa_lancamento_id' IS NOT NULL OR upper(coalesce(r->>'origem','')) LIKE '%EMPRESTIMO%') THEN
    RAISE EXCEPTION 'PAYMENT_SPECIALIZED_FLOW_REQUIRED';
  END IF;
  summary:=internal_financial_payments.summary(p_source_kind,p_source_id,r);
  IF (r->>'valor')::numeric<=0 OR (r->>'valor')::numeric*100<>trunc((r->>'valor')::numeric*100) THEN
    RAISE EXCEPTION 'PAYMENT_INVALID_NOMINAL';
  END IF;
  IF coalesce(r->>'status','') NOT IN ('PENDENTE','VENCIDO') OR r->>'excluido_em' IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_TITLE_NOT_OPEN';
  END IF;
  IF NOT (summary->>'hasEvents')::boolean AND
    (coalesce((r->>'valor_pago')::numeric,0)<>0 OR r->>'data_pagamento' IS NOT NULL) THEN
    RAISE EXCEPTION 'PAYMENT_LEGACY_EVIDENCE_REQUIRES_REVIEW';
  END IF;
  SELECT sum(internal_financial_payments.cents(c->'amount')) INTO amount
    FROM jsonb_array_elements(normalized->'components') c;
  interest:=internal_financial_payments.cents(normalized->'interest');
  penalty:=internal_financial_payments.cents(normalized->'penalty');
  addition:=internal_financial_payments.cents(normalized->'addition');
  discount:=internal_financial_payments.cents(normalized->'discount');
  principal:=amount-interest-penalty-addition;
  remaining:=internal_financial_payments.cents(summary->'remainingBefore');
  IF principal<0 OR principal+discount<=0 THEN RAISE EXCEPTION 'PAYMENT_CHARGES_EXCEED_PAYMENT'; END IF;
  IF principal+discount>remaining THEN RAISE EXCEPTION 'PAYMENT_EXCEEDS_REMAINING'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_array(id,reversed_at) ORDER BY created_at,id),'[]') INTO events
    FROM public.financial_payment_events WHERE source_kind=p_source_kind AND source_id=p_source_id;
  result:=summary||jsonb_build_object('sourceKind',p_source_kind,'sourceId',p_source_id,
    'paymentAmount',internal_financial_payments.money(amount),'principalPaid',internal_financial_payments.money(principal),
    'interest',normalized->'interest','penalty',normalized->'penalty','addition',normalized->'addition',
    'discount',normalized->'discount','remainingAfter',internal_financial_payments.money(remaining-principal-discount),
    'status',internal_financial_payments.balance_status(remaining-principal-discount,(r->>'data_vencimento')::date),
    'components',normalized->'components','requiresRemoteCancellation',
      p_source_kind='RECEIVABLE' AND coalesce(r->>'gateway_provider','') NOT IN ('','local')
        AND coalesce(r->>'gateway_status','') NOT IN ('CANCELED','CANCELLED'));
  RETURN result||jsonb_build_object('fingerprint',md5(jsonb_build_object('actor',p_actor,'source',p_source_id,
    'kind',p_source_kind,'polo',r->'polo_id','nominal',summary->'originalAmount','events',events,
    'status',r->'status','input',normalized-'requestId')::text));
END $function$;

COMMIT;
