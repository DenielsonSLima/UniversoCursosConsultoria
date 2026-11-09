BEGIN;

CREATE FUNCTION public.save_nfse_partner_service_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_request_id uuid,p_definition jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '15s' SET lock_timeout = '5s' AS $function$
DECLARE
  v_input jsonb; v_payload jsonb; v_previous private.nfse_partner_service_requests%ROWTYPE;
  v_partner public.parceiros%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_receivable public.contas_receber%ROWTYPE; v_receivable_id uuid; v_action text := 'NONE';
  v_id uuid := gen_random_uuid(); v_response jsonb; v_generate boolean;
BEGIN
  -- Current pilot/context/polo and financial permissions precede every replay lookup.
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  v_input := private.normalize_nfse_partner_service(p_definition);
  v_generate := (v_input->>'generateReceivable')::boolean;
  IF v_generate THEN PERFORM internal_finance.authorize_other_credit_plan(p_polo_id,true); END IF;
  IF p_request_id IS NULL OR left(v_input->>'serviceDate',7) IS DISTINCT FROM p_month THEN
    RAISE EXCEPTION 'Informe a tentativa e a data dentro do mês de referência.' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month,'definition',v_input);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-partner-request:' || auth.uid()::text || ':' || p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_partner_service_requests
    WHERE actor_id = auth.uid() AND request_id = p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Esta tentativa pertence a outro serviço. Reabra o cadastro para alterar os dados.' USING ERRCODE = '22023';
    END IF;
    RETURN v_previous.response;
  END IF;
  -- Serialize title checks/creation for this payer, including across fiscal environments.
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-partner-payer:' || p_polo_id::text || ':' || (v_input->>'partnerId'),0));
  SELECT * INTO v_partner FROM public.parceiros p WHERE p.id = (v_input->>'partnerId')::uuid
    AND p.tipo IN ('PF','PJ') AND public.is_active_status(p.status)
    AND ((p.polo_id IS NULL AND cardinality(coalesce(p.polo_ids,ARRAY[]::uuid[])) = 0)
      OR p.polo_id = p_polo_id OR p_polo_id = ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))) FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parceiro indisponível neste polo.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_model FROM private.nfse_models m WHERE m.id = (v_input->>'modelId')::uuid
    AND m.polo_id = p_polo_id AND m.environment = p_environment
    AND m.version = (v_input->>'modelVersion')::integer AND (m.definition->>'active')::boolean FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O modelo foi alterado ou está indisponível. Atualize os modelos.' USING ERRCODE = '40001';
  END IF;
  IF v_generate AND v_input->>'existingReceivableId' IS NOT NULL THEN
    SELECT * INTO v_receivable FROM public.contas_receber c
      WHERE c.id = (v_input->>'existingReceivableId')::uuid AND c.polo_id = p_polo_id
        AND c.cliente_id = v_partner.id FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM private.nfse_partner_linkable_receivables c WHERE c.id = v_receivable.id
    ) OR v_receivable.valor IS DISTINCT FROM (v_input->>'amount')::numeric THEN
      RAISE EXCEPTION 'Conta indisponível, já vinculada ou com valor diferente. Atualize a seleção.' USING ERRCODE = '22023';
    END IF;
    v_receivable_id := v_receivable.id;
    v_action := 'LINKED';
  ELSIF v_generate THEN
    PERFORM internal_finance.validate_other_credit_plan_references(p_polo_id,jsonb_build_object(
      'clienteId',v_partner.id,'categoriaFinanceiraId',v_input->>'categoryId'));
    -- Never silently recreate a matching canonical title. The user must choose the existing one.
    IF EXISTS (SELECT 1 FROM public.contas_receber c WHERE c.polo_id = p_polo_id
      AND c.cliente_id = v_partner.id AND c.categoria = 'OUTROS_CREDITOS'
      AND c.status IN ('PENDENTE','VENCIDO','PAGO') AND c.valor = (v_input->>'amount')::numeric
      AND c.data_vencimento = (v_input->>'dueDate')::date
      AND btrim(c.descricao) = v_input->>'serviceDescription') THEN
      RAISE EXCEPTION 'Já existe uma conta com estes dados. Vincule a conta existente.' USING ERRCODE = '23505';
    END IF;
    v_receivable_id := gen_random_uuid();
    INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,
      status,categoria,categoria_financeira_id,tipo_lancamento,origem_pagamento)
    VALUES(v_receivable_id,p_polo_id,v_partner.id,v_input->>'serviceDescription',
      (v_input->>'amount')::numeric,(v_input->>'dueDate')::date,'PENDENTE','OUTROS_CREDITOS',
      (v_input->>'categoryId')::uuid,'OUTRO_CREDITO','LOCAL');
    v_action := 'CREATED';
    -- Existing canonical audit/Realtime triggers run. No payment/gateway fields are supplied.
  END IF;
  INSERT INTO private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,
    service_description,amount,partner_snapshot,model_snapshot,receivable_id,receivable_action,created_by)
  VALUES(v_id,p_polo_id,p_environment,v_partner.id,v_model.id,(v_input->>'serviceDate')::date,
    v_input->>'serviceDescription',(v_input->>'amount')::numeric,
    jsonb_build_object('name',v_partner.nome,'tradeName',v_partner.nome_fantasia,
      'document',v_partner.cpf_cnpj,'type',v_partner.tipo),
    v_model.definition || jsonb_build_object('id',v_model.id,'version',v_model.version),
    v_receivable_id,v_action,auth.uid());
  v_response := jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'id',v_id,'receivableId',v_receivable_id,'receivableAction',v_action,'message',CASE v_action
      WHEN 'CREATED' THEN 'Serviço salvo e conta a receber criada.'
      WHEN 'LINKED' THEN 'Serviço salvo com a conta existente vinculada.' ELSE 'Serviço salvo.' END));
  INSERT INTO private.nfse_partner_service_requests(actor_id,request_id,payload,response)
    VALUES(auth.uid(),p_request_id,v_payload,v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_nfse_partner_service_secure(uuid,uuid,text,text,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_nfse_partner_service_secure(uuid,uuid,text,text,uuid,jsonb) TO authenticated;
COMMENT ON FUNCTION public.save_nfse_partner_service_secure(uuid,uuid,text,text,uuid,jsonb) IS
  'Pilot-only partner service preparation. Explicit opt-in creates one local pending title or links one existing canonical title atomically; never emits a fiscal document or payment instrument.';

NOTIFY pgrst,'reload schema';
COMMIT;
