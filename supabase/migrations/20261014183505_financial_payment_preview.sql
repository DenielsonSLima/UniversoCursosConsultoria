BEGIN;
CREATE FUNCTION internal_financial_payments.authorize_source(p_actor uuid,p_source_kind text,p_source_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; tab_name text;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_source_kind='EXPENSE' THEN
    SELECT to_jsonb(s) INTO r FROM public.despesas_lancamentos s WHERE id=p_source_id FOR UPDATE;
    tab_name:=CASE WHEN r->>'tipo'='OUTRO_DEBITO' THEN 'outros-debitos' ELSE 'despesas' END;
  ELSIF p_source_kind='PAYABLE' THEN
    SELECT to_jsonb(s) INTO r FROM public.contas_pagar s WHERE id=p_source_id FOR UPDATE;
    tab_name:='despesas';
  ELSIF p_source_kind='RECEIVABLE' THEN
    SELECT to_jsonb(s) INTO r FROM public.contas_receber s WHERE id=p_source_id FOR UPDATE;
    tab_name:=CASE WHEN r->>'categoria'='OUTROS_CREDITOS' THEN 'outros-creditos' ELSE 'receber' END;
  ELSE RAISE EXCEPTION 'PAYMENT_INVALID_SOURCE'; END IF;
  IF r IS NULL OR internal_financial_payments.actor_allowed(p_actor,(r->>'polo_id')::uuid,tab_name) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  RETURN r;
END $$;
CREATE FUNCTION internal_financial_payments.normalized_input(p_source_id uuid,p_polo_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb; components jsonb:='[]'; account uuid; amount bigint; method text; payment_date date;
BEGIN
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR (p_input->>'sourceId')::uuid IS DISTINCT FROM p_source_id
    OR (p_input->>'requestId')::uuid IS NULL OR coalesce(p_input->>'paymentDate','') !~ '^\d{4}-\d{2}-\d{2}$'
    OR jsonb_typeof(p_input->'components') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PAYMENT_INVALID_INPUT'; END IF;
  payment_date:=(p_input->>'paymentDate')::date;
  IF payment_date>current_date OR payment_date<'1900-01-01'::date
    OR jsonb_array_length(p_input->'components') NOT BETWEEN 1 AND 20
    OR length(coalesce(p_input->>'notes',''))>2000 THEN RAISE EXCEPTION 'PAYMENT_INVALID_INPUT'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_input->'components') LOOP
    account:=(c->>'accountId')::uuid;
    method:=upper(btrim(c->>'method'));
    amount:=internal_financial_payments.cents(c->'amount');
    IF amount<=0 OR method IS NULL OR method NOT IN ('DINHEIRO','PIX','CARTAO','BOLETO','TED','TRANSFERENCIA','DEBITO','CREDITO') THEN
      RAISE EXCEPTION 'PAYMENT_INVALID_COMPONENT';
    END IF;
    PERFORM 1 FROM public.contas_bancarias WHERE id=account FOR SHARE;
    PERFORM 1 FROM public.contas_bancarias_polos WHERE conta_bancaria_id=account AND polo_id=p_polo_id FOR SHARE;
    PERFORM 1 FROM public.polos WHERE id=p_polo_id FOR SHARE;
    IF public.conta_bancaria_disponivel_no_polo(account,p_polo_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'PAYMENT_ACCOUNT_UNAVAILABLE' USING ERRCODE='42501';
    END IF;
    components:=components||jsonb_build_array(jsonb_build_object('accountId',account,'method',method,
      'amount',internal_financial_payments.money(amount)));
  END LOOP;
  RETURN jsonb_build_object('requestId',(p_input->>'requestId')::uuid,'sourceId',p_source_id,
    'paymentDate',payment_date,'components',components,
    'interest',internal_financial_payments.money(internal_financial_payments.cents(p_input->'interest')),
    'penalty',internal_financial_payments.money(internal_financial_payments.cents(p_input->'penalty')),
    'addition',internal_financial_payments.money(internal_financial_payments.cents(p_input->'addition')),
    'discount',internal_financial_payments.money(internal_financial_payments.cents(p_input->'discount')),
    'notes',btrim(coalesce(p_input->>'notes','')));
END $$;
CREATE FUNCTION internal_financial_payments.summary(p_source_kind text,p_source_id uuid,p_source jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
WITH sums AS (
  SELECT count(*) AS events,coalesce(sum(payment_cents) FILTER(WHERE reversed_at IS NULL),0)::bigint AS paid,
    coalesce(sum(principal_cents+discount_cents) FILTER(WHERE reversed_at IS NULL),0)::bigint AS reduced
  FROM public.financial_payment_events WHERE source_kind=p_source_kind AND source_id=p_source_id
), amounts AS (
 SELECT events,round((p_source->>'valor')::numeric*100)::bigint AS original,
   CASE WHEN events>0 THEN paid ELSE round(coalesce((p_source->>'valor_pago')::numeric,
     CASE WHEN p_source->>'status'='PAGO' THEN (p_source->>'valor')::numeric ELSE 0 END)*100)::bigint END AS paid,
   CASE WHEN events>0 THEN reduced WHEN p_source->>'status'='PAGO' THEN round((p_source->>'valor')::numeric*100)::bigint ELSE 0 END AS reduced
 FROM sums
)
SELECT jsonb_build_object('originalAmount',internal_financial_payments.money(original),
 'previouslyPaid',internal_financial_payments.money(paid),
 'remainingBefore',internal_financial_payments.money(greatest(original-reduced,0)),
 'status',p_source->>'status','hasEvents',events>0) FROM amounts;
$$;
CREATE FUNCTION internal_financial_payments.preview_for_actor(p_actor uuid,p_source_kind text,p_source_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; normalized jsonb; summary jsonb; amount bigint; interest bigint; penalty bigint; addition bigint;
 discount bigint; principal bigint; remaining bigint; result jsonb; events jsonb;
BEGIN
  r:=internal_financial_payments.authorize_source(p_actor,p_source_kind,p_source_id);
  normalized:=internal_financial_payments.normalized_input(p_source_id,(r->>'polo_id')::uuid,p_input);
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
    'status',CASE WHEN remaining=principal+discount THEN 'PAGO' ELSE 'PENDENTE' END,
    'components',normalized->'components','requiresRemoteCancellation',
      p_source_kind='RECEIVABLE' AND coalesce(r->>'gateway_provider','') NOT IN ('','local')
        AND coalesce(r->>'gateway_status','') NOT IN ('CANCELED','CANCELLED'));
  RETURN result||jsonb_build_object('fingerprint',md5(jsonb_build_object('actor',p_actor,'source',p_source_id,
    'kind',p_source_kind,'polo',r->'polo_id','nominal',summary->'originalAmount','events',events,
    'status',r->'status','input',normalized-'requestId')::text));
END $$;
CREATE FUNCTION public.preview_financial_payment_secure(p_source_kind text,p_source_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT internal_financial_payments.preview_for_actor(auth.uid(),p_source_kind,p_source_id,p_input);
$$;
CREATE FUNCTION public.get_financial_payment_history_secure(p_source_kind text,p_source_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; events jsonb;
BEGIN
  r:=internal_financial_payments.authorize_source(auth.uid(),p_source_kind,p_source_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'paymentDate',e.payment_date,
    'paymentAmount',internal_financial_payments.money(e.payment_cents),
    'principalPaid',internal_financial_payments.money(e.principal_cents),
    'interest',internal_financial_payments.money(e.interest_cents),'penalty',internal_financial_payments.money(e.penalty_cents),
    'addition',internal_financial_payments.money(e.addition_cents),'discount',internal_financial_payments.money(e.discount_cents),
    'remainingAfter',e.preview->'remainingAfter','createdAt',e.created_at,'reversedAt',e.reversed_at,
    'notes',e.input->'notes','components',e.preview->'components') ORDER BY e.created_at,e.id),'[]') INTO events
    FROM public.financial_payment_events e WHERE source_kind=p_source_kind AND source_id=p_source_id;
  RETURN jsonb_build_object('summary',internal_financial_payments.summary(p_source_kind,p_source_id,r),'events',events);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_financial_payments FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preview_financial_payment_secure(text,uuid,jsonb),
 public.get_financial_payment_history_secure(text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.preview_financial_payment_secure(text,uuid,jsonb),
 public.get_financial_payment_history_secure(text,uuid) TO authenticated;
COMMIT;
