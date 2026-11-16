BEGIN;
CREATE FUNCTION public.resolve_estimated_expense_without_charge_secure(
  p_despesa_id uuid, p_versao integer, p_request_id uuid, p_motivo text DEFAULT NULL
)
RETURNS public.despesas_lancamentos LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_source jsonb;
  v_prior private.despesas_estimativas_operacoes%ROWTYPE;
  v_result public.despesas_lancamentos%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_motivo,'')),'');
  v_hash text := md5(jsonb_build_object('id',p_despesa_id,'version',p_versao,
    'reason',nullif(btrim(coalesce(p_motivo,'')),''))::text);
  v_previous_context text := current_setting('app.despesa_estimativa_context',true);
BEGIN
  v_source := internal_financial_payments.authorize_source(v_actor,'EXPENSE',p_despesa_id);
  IF p_request_id IS NULL OR length(coalesce(v_reason,''))>1000 THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_INVALID_INPUT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO v_prior FROM private.despesas_estimativas_operacoes o WHERE o.request_id=p_request_id;
  IF FOUND THEN
    IF v_prior.actor_id IS DISTINCT FROM v_actor OR v_prior.despesa_id IS DISTINCT FROM p_despesa_id
      OR v_prior.operacao<>'SEM_COBRANCA' OR v_prior.payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'PAYMENT_REQUEST_REUSED';
    END IF;
    RETURN jsonb_populate_record(NULL::public.despesas_lancamentos,v_source);
  END IF;
  IF EXISTS (SELECT 1 FROM public.despesas_operacoes_requisicoes o WHERE o.request_id=p_request_id)
    OR EXISTS (SELECT 1 FROM public.financial_payment_events e WHERE e.request_id=p_request_id) THEN
    RAISE EXCEPTION 'PAYMENT_REQUEST_REUSED';
  END IF;
  -- Validate the same state/version/no-history fence as a real-value confirmation.
  -- The positive existing estimate is retained; no zero principal is invented.
  PERFORM private.project_confirmed_expense(v_source,(v_source->>'valor_base')::numeric,p_versao);
  v_result := public.cancelar_ou_estornar_despesa_secure(p_despesa_id,p_request_id,
    'Não houve cobrança nesta competência.' || CASE WHEN v_reason IS NULL THEN '' ELSE ' '||v_reason END,false);
  PERFORM set_config('app.despesa_estimativa_context','SEM_COBRANCA',true);
  UPDATE public.despesas_lancamentos SET valor_sem_cobranca_em=clock_timestamp(),
    valor_sem_cobranca_por=v_actor,updated_at=now()
    WHERE id=p_despesa_id RETURNING * INTO STRICT v_result;
  PERFORM set_config('app.despesa_estimativa_context',coalesce(v_previous_context,''),true);
  INSERT INTO private.despesas_estimativas_operacoes(request_id,actor_id,despesa_id,operacao,payload_hash,resultado)
    VALUES (p_request_id,v_actor,p_despesa_id,'SEM_COBRANCA',v_hash,
      jsonb_build_object('antes',v_source,'depois',to_jsonb(v_result)));
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.resolve_estimated_expense_without_charge_secure(uuid,integer,uuid,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_estimated_expense_without_charge_secure(uuid,integer,uuid,text)
  TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
