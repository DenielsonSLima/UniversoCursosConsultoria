BEGIN;
CREATE FUNCTION private.project_confirmed_expense(p_source jsonb, p_valor_real numeric, p_versao integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_valor_real IS NULL OR p_valor_real <= 0 OR p_valor_real > 99999999999.99
    OR p_valor_real <> round(p_valor_real,2) THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_INVALID_VALUE';
  END IF;
  IF NOT coalesce((p_source->>'valor_estimado')::boolean,false)
    OR p_source->>'valor_confirmado_em' IS NOT NULL
    OR p_source->>'status' NOT IN ('PENDENTE','VENCIDO')
    OR p_source->>'excluido_em' IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_NOT_PENDING';
  END IF;
  IF p_versao IS NULL OR p_versao IS DISTINCT FROM (p_source->>'valor_estimado_versao')::integer THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_VERSION_CHANGED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_payment_events e
    WHERE e.source_kind = 'EXPENSE' AND e.source_id = (p_source->>'id')::uuid)
    OR coalesce((p_source->>'valor_pago')::numeric,0) <> 0
    OR p_source->>'data_pagamento' IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_HISTORY_LOCKED';
  END IF;
  RETURN p_source || jsonb_build_object('valor_base',p_valor_real,'valor',p_valor_real);
END $$;

CREATE FUNCTION public.preview_estimated_expense_payment_secure(
  p_despesa_id uuid, p_valor_real numeric, p_versao integer, p_input jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  source jsonb;
  projected jsonb;
  adjusted jsonb := p_input - 'automaticAmount';
  result jsonb;
  amount bigint;
BEGIN
  source := internal_financial_payments.authorize_source(actor,'EXPENSE',p_despesa_id);
  projected := private.project_confirmed_expense(source,p_valor_real,p_versao);
  IF p_input->'automaticAmount' = 'true'::jsonb THEN
    IF jsonb_typeof(p_input->'components') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_input->'components') <> 1 THEN
      RAISE EXCEPTION 'PAYMENT_INVALID_INPUT';
    END IF;
    amount := round(p_valor_real * 100)::bigint
      + internal_financial_payments.cents(p_input->'interest')
      + internal_financial_payments.cents(p_input->'penalty')
      + internal_financial_payments.cents(p_input->'addition')
      - internal_financial_payments.cents(p_input->'discount');
    IF amount <= 0 THEN RAISE EXCEPTION 'PAYMENT_INVALID_AMOUNT'; END IF;
    adjusted := jsonb_set(adjusted,'{components,0,amount}',
      to_jsonb(internal_financial_payments.money(amount)),false);
  END IF;
  result := private.preview_estimated_expense_source(actor,'EXPENSE',p_despesa_id,adjusted,projected);
  RETURN result || jsonb_build_object('fingerprint',md5(jsonb_build_object(
    'canonical',result->'fingerprint','version',p_versao,'realBase',p_valor_real,
    'originalEstimate',source->'valor_estimado_original')::text),
    'estimatedExpense',jsonb_build_object(
      'originalEstimate',internal_financial_payments.money(round((source->>'valor_estimado_original')::numeric*100)::bigint),
      'realBase',internal_financial_payments.money(round(p_valor_real*100)::bigint),'version',p_versao));
END $$;

CREATE FUNCTION private.apply_confirmed_expense_value(p_source jsonb, p_valor_real numeric)
RETURNS public.despesas_lancamentos LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result public.despesas_lancamentos%ROWTYPE;
  previous_context text := current_setting('app.despesa_estimativa_context',true);
BEGIN
  PERFORM set_config('app.despesa_estimativa_context','CONFIRMAR',true);
  UPDATE public.despesas_lancamentos SET valor_base = p_valor_real,
    valor_confirmado_em = clock_timestamp(), valor_confirmado_por = auth.uid(), updated_at = now()
    WHERE id = (p_source->>'id')::uuid RETURNING * INTO STRICT result;
  PERFORM set_config('app.despesa_estimativa_context',coalesce(previous_context,''),true);
  RETURN result;
END $$;

CREATE FUNCTION public.confirm_estimated_expense_value_secure(
  p_despesa_id uuid, p_valor_real numeric, p_versao integer, p_request_id uuid
)
RETURNS public.despesas_lancamentos LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  source jsonb;
  prior private.despesas_estimativas_operacoes%ROWTYPE;
  result public.despesas_lancamentos%ROWTYPE;
  v_payload_hash text := md5(jsonb_build_object('id',p_despesa_id,'real',p_valor_real,'version',p_versao)::text);
BEGIN
  source := internal_financial_payments.authorize_source(actor,'EXPENSE',p_despesa_id);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_INVALID_INPUT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO prior FROM private.despesas_estimativas_operacoes o WHERE o.request_id = p_request_id;
  IF FOUND THEN
    IF prior.actor_id IS DISTINCT FROM actor OR prior.despesa_id IS DISTINCT FROM p_despesa_id
      OR prior.operacao <> 'CONFIRMAR_VALOR' OR prior.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'PAYMENT_REQUEST_REUSED';
    END IF;
    RETURN jsonb_populate_record(NULL::public.despesas_lancamentos,source);
  END IF;
  PERFORM private.project_confirmed_expense(source,p_valor_real,p_versao);
  result := private.apply_confirmed_expense_value(source,p_valor_real);
  INSERT INTO private.despesas_estimativas_operacoes(request_id,actor_id,despesa_id,operacao,payload_hash,resultado)
    VALUES (p_request_id,actor,p_despesa_id,'CONFIRMAR_VALOR',v_payload_hash,
      jsonb_build_object('antes',source,'depois',to_jsonb(result)));
  RETURN result;
END $$;

CREATE FUNCTION public.confirm_estimated_expense_payment_secure(
  p_despesa_id uuid, p_valor_real numeric, p_versao integer, p_input jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  source jsonb;
  v_request_id uuid := (p_input->>'requestId')::uuid;
  v_payload_hash text := md5(jsonb_build_object('id',p_despesa_id,'real',p_valor_real,
    'version',p_versao,'input',p_input)::text);
  prior private.despesas_estimativas_operacoes%ROWTYPE;
  preview jsonb;
  canonical jsonb;
  result jsonb;
BEGIN
  source := internal_financial_payments.authorize_source(actor,'EXPENSE',p_despesa_id);
  IF v_request_id IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PAYMENT_INVALID_INPUT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_request_id::text,0));
  SELECT * INTO prior FROM private.despesas_estimativas_operacoes o WHERE o.request_id = v_request_id;
  -- Authorization and replay precede all state checks. Lost replies remain recoverable.
  IF FOUND THEN
    IF prior.actor_id IS DISTINCT FROM actor OR prior.despesa_id IS DISTINCT FROM p_despesa_id
      OR prior.operacao <> 'CONFIRMAR_PAGAMENTO' OR prior.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'PAYMENT_REQUEST_REUSED';
    END IF;
    RETURN prior.resultado || jsonb_build_object('replayed',true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_payment_events e WHERE e.request_id = v_request_id) THEN
    RAISE EXCEPTION 'PAYMENT_REQUEST_REUSED';
  END IF;
  preview := public.preview_estimated_expense_payment_secure(p_despesa_id,p_valor_real,p_versao,p_input);
  IF p_input->>'fingerprint' IS DISTINCT FROM preview->>'fingerprint' THEN
    RAISE EXCEPTION 'PAYMENT_PREVIEW_STALE';
  END IF;
  PERFORM private.apply_confirmed_expense_value(source,p_valor_real);
  canonical := public.preview_financial_payment_secure('EXPENSE',p_despesa_id,p_input);
  result := internal_financial_payments.append_payment(actor,'EXPENSE',p_despesa_id,
    p_input || jsonb_build_object('fingerprint',canonical->>'fingerprint'),false);
  result := jsonb_set(result,'{preview,estimatedExpense}',preview->'estimatedExpense');
  INSERT INTO private.despesas_estimativas_operacoes(request_id,actor_id,despesa_id,operacao,payload_hash,resultado)
    VALUES (v_request_id,actor,p_despesa_id,'CONFIRMAR_PAGAMENTO',v_payload_hash,result);
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION private.project_confirmed_expense(jsonb,numeric,integer),
  private.apply_confirmed_expense_value(jsonb,numeric)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preview_estimated_expense_payment_secure(uuid,numeric,integer,jsonb),
  public.confirm_estimated_expense_value_secure(uuid,numeric,integer,uuid),
  public.confirm_estimated_expense_payment_secure(uuid,numeric,integer,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.preview_estimated_expense_payment_secure(uuid,numeric,integer,jsonb),
  public.confirm_estimated_expense_value_secure(uuid,numeric,integer,uuid),
  public.confirm_estimated_expense_payment_secure(uuid,numeric,integer,jsonb) TO authenticated;
COMMIT;
