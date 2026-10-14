BEGIN;
-- Completed results remain replayable after account deactivation. Authorization and
-- the complete immutable payload still have to match; new payments validate accounts.
DO $guard$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('internal_financial_payments.normalized_input(uuid,uuid,jsonb)','416387f9ca35c6ac1f92fb57f88026e2'),
  ('internal_financial_payments.append_payment(uuid,text,uuid,jsonb,boolean)','38accbf70ab78139ac83a727bcd52f40'),
  ('public.begin_receivable_payment_secure(uuid,jsonb)','a9c01f87b8f3caa4341676dcb8d4e083')
 ) AS targets(signature,definition_hash) LOOP
  IF md5(pg_get_functiondef(item.signature::regprocedure))<>item.definition_hash THEN
   RAISE EXCEPTION 'PAYMENT_COMPLETED_REPLAY_DEFINITION_DRIFT: %',item.signature;
  END IF;
 END LOOP;
END $guard$;
CREATE FUNCTION internal_financial_payments.normalized_replay_input(p_source_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
    IF account IS NULL THEN RAISE EXCEPTION 'PAYMENT_INVALID_COMPONENT'; END IF;
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
CREATE OR REPLACE FUNCTION internal_financial_payments.append_payment(
  p_actor uuid,p_source_kind text,p_source_id uuid,p_input jsonb,p_allow_remote_canceled boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; normalized jsonb; preview jsonb; prior public.financial_payment_events%ROWTYPE;
  payment_id uuid; payload_hash text; v_request_id uuid; c jsonb; position integer:=0;
BEGIN
  r:=internal_financial_payments.authorize_source(p_actor,p_source_kind,p_source_id);
  v_request_id:=(p_input->>'requestId')::uuid;
  IF v_request_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_INVALID_INPUT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_request_id::text,0));
  SELECT * INTO prior FROM public.financial_payment_events e WHERE e.request_id=v_request_id;
  IF FOUND THEN
    normalized:=internal_financial_payments.normalized_replay_input(p_source_id,p_input);
    payload_hash:=md5(jsonb_build_object('kind',p_source_kind,'input',normalized,'fingerprint',p_input->'fingerprint')::text);
    IF prior.actor_id IS DISTINCT FROM p_actor OR prior.source_kind IS DISTINCT FROM p_source_kind
      OR prior.source_id IS DISTINCT FROM p_source_id OR prior.payload_hash IS DISTINCT FROM payload_hash THEN
      RAISE EXCEPTION 'PAYMENT_REQUEST_REUSED';
    END IF;
    RETURN jsonb_build_object('success',true,'paymentId',prior.id,'replayed',true,'preview',prior.preview);
  END IF;
  normalized:=internal_financial_payments.normalized_input(p_source_id,(r->>'polo_id')::uuid,p_input);
  payload_hash:=md5(jsonb_build_object('kind',p_source_kind,'input',normalized,'fingerprint',p_input->'fingerprint')::text);
  IF p_source_kind='RECEIVABLE' AND coalesce(r->>'gateway_provider','') NOT IN ('','local')
    AND p_allow_remote_canceled IS NOT TRUE THEN RAISE EXCEPTION 'PAYMENT_BANK_CONFIRMATION_REQUIRED'; END IF;
  IF p_source_kind='EXPENSE' AND (EXISTS(SELECT 1 FROM public.convenios_financeiros_despesas
    WHERE despesa_lancamento_id=p_source_id AND status='ATIVO') OR r->>'emprestimo_parcela_id' IS NOT NULL) THEN
    RAISE EXCEPTION 'PAYMENT_SPECIALIZED_FLOW_REQUIRED';
  END IF;
  IF p_source_kind='PAYABLE' AND (r->>'emprestimo_parcela_id' IS NOT NULL OR r->>'emprestimo_id' IS NOT NULL
    OR r->>'despesa_lancamento_id' IS NOT NULL OR upper(coalesce(r->>'origem','')) LIKE '%EMPRESTIMO%') THEN
    RAISE EXCEPTION 'PAYMENT_SPECIALIZED_FLOW_REQUIRED';
  END IF;
  preview:=internal_financial_payments.preview_for_actor(p_actor,p_source_kind,p_source_id,p_input);
  IF p_input->>'fingerprint' IS DISTINCT FROM preview->>'fingerprint' THEN RAISE EXCEPTION 'PAYMENT_PREVIEW_STALE'; END IF;
  INSERT INTO public.financial_payment_events(request_id,actor_id,source_kind,source_id,polo_id,payment_date,
    original_cents,principal_cents,interest_cents,penalty_cents,addition_cents,discount_cents,payment_cents,
    input,payload_hash,preview)
  VALUES(v_request_id,p_actor,p_source_kind,p_source_id,(r->>'polo_id')::uuid,(normalized->>'paymentDate')::date,
    internal_financial_payments.cents(preview->'originalAmount'),internal_financial_payments.cents(preview->'principalPaid'),
    internal_financial_payments.cents(preview->'interest'),internal_financial_payments.cents(preview->'penalty'),
    internal_financial_payments.cents(preview->'addition'),internal_financial_payments.cents(preview->'discount'),
    internal_financial_payments.cents(preview->'paymentAmount'),normalized,payload_hash,preview) RETURNING id INTO payment_id;
  FOR c IN SELECT value FROM jsonb_array_elements(normalized->'components') LOOP
    position:=position+1;
    INSERT INTO public.financial_payment_components(event_id,sequence,account_id,method,amount_cents)
    VALUES(payment_id,position,(c->>'accountId')::uuid,c->>'method',internal_financial_payments.cents(c->'amount'));
  END LOOP;
  PERFORM internal_financial_payments.refresh_source(p_source_kind,p_source_id);
  RETURN jsonb_build_object('success',true,'paymentId',payment_id,'replayed',false,'preview',preview);
END $$;
CREATE OR REPLACE FUNCTION public.begin_receivable_payment_secure(p_source_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a internal_receivable_payments.attempts%ROWTYPE; r jsonb; normalized jsonb; preview jsonb; request_id uuid;
BEGIN
 r:=internal_financial_payments.authorize_source(auth.uid(),'RECEIVABLE',p_source_id);
 request_id:=(p_input->>'requestId')::uuid;
 IF request_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_INVALID_INPUT'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,322));
 SELECT * INTO a FROM internal_receivable_payments.attempts WHERE id=request_id FOR UPDATE;
 IF FOUND AND a.state IN ('COMPLETE','FAILED_SAFE') THEN
   normalized:=internal_financial_payments.normalized_replay_input(p_source_id,p_input);
 ELSE
   normalized:=internal_financial_payments.normalized_input(p_source_id,(r->>'polo_id')::uuid,p_input);
 END IF;
 normalized:=normalized||jsonb_build_object('fingerprint',p_input->>'fingerprint');
 IF a.id IS NOT NULL THEN
   IF a.actor_id IS DISTINCT FROM auth.uid() OR a.receivable_id IS DISTINCT FROM p_source_id
     OR a.input IS DISTINCT FROM normalized THEN RAISE EXCEPTION 'PAYMENT_REQUEST_CONFLICT'; END IF;
   RETURN jsonb_build_object('attemptId',a.id,'sourceId',a.receivable_id);
 END IF;
 PERFORM internal_receivable_payments.inspect(p_source_id,normalized);
 preview:=internal_financial_payments.preview_for_actor(auth.uid(),'RECEIVABLE',p_source_id,normalized);
 IF preview->>'fingerprint' IS DISTINCT FROM normalized->>'fingerprint' THEN
   RAISE EXCEPTION 'PAYMENT_PREVIEW_CHANGED';
 END IF;
 INSERT INTO internal_receivable_payments.attempts(id,actor_id,receivable_id,input,snapshot)
 VALUES(request_id,auth.uid(),p_source_id,normalized,internal_other_credit_cancellation.snapshot(p_source_id));
 RETURN jsonb_build_object('attemptId',request_id,'sourceId',p_source_id);
END $$;
REVOKE ALL ON FUNCTION internal_financial_payments.normalized_replay_input(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
