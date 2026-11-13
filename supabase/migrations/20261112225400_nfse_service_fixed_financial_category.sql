BEGIN;

CREATE FUNCTION private.nfse_service_required_category() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_category uuid;
BEGIN
  SELECT c.id INTO v_category FROM private.nfse_service_financial_policy policy
    JOIN public.categorias_financeiras c ON c.id=policy.default_category_id
    WHERE policy.singleton AND upper(btrim(c.nome))='SERVIÇOS NFS-E'
      AND upper(c.tipo)='OUTRO_CREDITO' AND public.is_active_status(c.status);
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'A categoria Serviços NFS-e está indisponível. Revise a configuração financeira.' USING ERRCODE='22023'; END IF;
  RETURN v_category;
END$$;
REVOKE ALL ON FUNCTION private.nfse_service_required_category() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.preview_nfse_service_financial_plan_secure(p_context_key uuid,p_polo_id uuid,
  p_environment text,p_month text,p_partner_id uuid,p_amount text,p_service_description text,p_financial_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF jsonb_typeof(p_financial_plan)='object' THEN
    p_financial_plan:=jsonb_set(p_financial_plan,'{categoryId}',
      to_jsonb(private.nfse_service_required_category()::text));
  END IF;
  IF p_amount IS NULL OR p_amount !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' OR NOT EXISTS(
    SELECT 1 FROM public.parceiros p WHERE p.id=p_partner_id AND public.is_active_status(p.status)
      AND upper(btrim(p.tipo)) IN ('PF','PJ','ALUNO')
      AND (p.polo_id=p_polo_id OR p_polo_id=ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))
        OR (p.polo_id IS NULL AND cardinality(coalesce(p.polo_ids,ARRAY[]::uuid[]))=0 AND upper(btrim(p.tipo))<>'ALUNO')))
    THEN RAISE EXCEPTION 'Pagador ou valor do serviço inválido.' USING ERRCODE='22023'; END IF;
  v_result:=private.nfse_service_financial_preview(p_partner_id,p_service_description,p_amount::numeric,p_financial_plan);
  PERFORM 1 FROM public.categorias_financeiras WHERE id=(v_result#>>'{financialPlan,categoryId}')::uuid
    AND upper(tipo)='OUTRO_CREDITO' AND public.is_active_status(status);
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria financeira indisponível.' USING ERRCODE='22023'; END IF;
  IF (v_result#>>'{financialPlan,issueBolePix}')::boolean
    AND NOT coalesce(internal_financial_payments.actor_allowed(auth.uid(),p_polo_id,'receber'),false) THEN
    RAISE EXCEPTION 'Gerar BolePix exige permissão financeira de Contas a Receber neste polo.' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_nfse_partner_service_secure(p_context_key uuid, p_polo_id uuid, p_environment text, p_month text, p_request_id uuid, p_definition jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '15s'
 SET lock_timeout TO '5s'
AS $function$
DECLARE
  v_input jsonb; v_payload jsonb; v_previous private.nfse_partner_service_requests%ROWTYPE;
  v_partner public.parceiros%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_receivable public.contas_receber%ROWTYPE; v_receivable_id uuid; v_action text := 'NONE';
  v_id uuid := gen_random_uuid(); v_response jsonb; v_generate boolean; v_financial jsonb; v_category uuid;
BEGIN
  -- Current pilot/context/polo and financial permissions precede every replay lookup.
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Informe a tentativa e a data dentro do mês de referência.' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-partner-request:' || auth.uid()::text || ':' || p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_partner_service_requests
    WHERE actor_id=auth.uid() AND request_id=p_request_id;
  -- Category is server-derived. Replays normalize it to their own frozen value,
  -- never to current configuration; linked financial history is not rewritten.
  IF jsonb_typeof(p_definition)='object' AND nullif(p_definition->>'existingReceivableId','') IS NULL
    AND (v_previous.request_id IS NULL OR v_previous.payload#>>'{definition,existingReceivableId}' IS NULL) THEN
    IF v_previous.request_id IS NULL THEN v_category:=private.nfse_service_required_category();
    ELSE v_category:=(v_previous.payload#>>'{definition,categoryId}')::uuid; END IF;
    p_definition:=jsonb_set(p_definition,'{categoryId}',to_jsonb(v_category::text));
    IF jsonb_typeof(p_definition->'financialPlan')='object' THEN
      p_definition:=jsonb_set(p_definition,'{financialPlan,categoryId}',to_jsonb(v_category::text));
    END IF;
  END IF;
  v_input := private.normalize_nfse_partner_service(p_definition-'financialPlan');
  v_generate := (v_input->>'generateReceivable')::boolean;
  IF NOT v_generate THEN
    RAISE EXCEPTION 'Todo serviço exige uma conta a receber após a autorização da NFS-e.' USING ERRCODE='22023'; END IF;
  IF v_input->>'existingReceivableId' IS NOT NULL THEN
    PERFORM internal_finance.authorize_other_credit_plan(p_polo_id,true);
    IF p_definition ? 'financialPlan' THEN
      RAISE EXCEPTION 'O vínculo preserva as condições financeiras da conta existente.' USING ERRCODE='22023'; END IF;
  ELSE
    v_financial:=private.nfse_service_financial_preview((v_input->>'partnerId')::uuid,
      private.render_nfse_service_period(v_input->>'serviceDescription',v_input->>'servicePeriodStart',
        v_input->>'servicePeriodEnd',position('{{periodo}}' IN v_input->>'serviceDescription')>0),
      (v_input->>'amount')::numeric,
      coalesce(p_definition->'financialPlan',jsonb_build_object('installments',1,
        'firstDueDate',v_input->>'dueDate','categoryId',v_input->>'categoryId','issueBolePix',false)));
    IF v_financial#>>'{financialPlan,categoryId}' IS DISTINCT FROM v_input->>'categoryId'
      OR v_financial#>>'{financialPlan,firstDueDate}' IS DISTINCT FROM v_input->>'dueDate' THEN
      RAISE EXCEPTION 'As condições financeiras divergem do serviço.' USING ERRCODE='22023'; END IF;
    IF (v_financial#>>'{financialPlan,issueBolePix}')::boolean
      AND NOT coalesce(internal_financial_payments.actor_allowed(auth.uid(),p_polo_id,'receber'),false) THEN
      RAISE EXCEPTION 'Gerar BolePix exige permissão financeira de Contas a Receber neste polo.' USING ERRCODE='42501'; END IF;
    v_input:=v_input||jsonb_build_object('financialPlan',v_financial->'financialPlan');
  END IF;
  IF p_request_id IS NULL OR left(v_input->>'serviceDate',7) IS DISTINCT FROM p_month THEN
    RAISE EXCEPTION 'Informe a tentativa e a data dentro do mês de referência.' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month,'definition',v_input);
  IF v_previous.request_id IS NOT NULL THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Esta tentativa pertence a outro serviço. Reabra o cadastro para alterar os dados.' USING ERRCODE = '22023';
    END IF;
    RETURN v_previous.response;
  END IF;
  -- Serialize title checks/creation for this payer, including across fiscal environments.
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-partner-payer:' || p_polo_id::text || ':' || (v_input->>'partnerId'),0));
  SELECT * INTO v_partner FROM public.parceiros p WHERE p.id = (v_input->>'partnerId')::uuid
    AND upper(btrim(p.tipo)) IN ('PF','PJ','ALUNO') AND public.is_active_status(p.status)
    AND ((p.polo_id IS NULL AND cardinality(coalesce(p.polo_ids,ARRAY[]::uuid[])) = 0 AND upper(btrim(p.tipo))<>'ALUNO')
      OR p.polo_id = p_polo_id OR p_polo_id = ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))) FOR SHARE;
  IF NOT FOUND OR NOT private.nfse_review_valid_document(v_partner.cpf_cnpj) THEN
    RAISE EXCEPTION 'Parceiro ativo com documento válido indisponível neste polo.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_model FROM private.nfse_models m WHERE m.id = (v_input->>'modelId')::uuid
    AND private.nfse_model_visible_to_polo(m.polo_id,p_polo_id,m.definition) AND m.environment = p_environment
    AND m.version = (v_input->>'modelVersion')::integer AND (m.definition->>'active')::boolean FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O modelo foi alterado ou está indisponível. Atualize os modelos.' USING ERRCODE = '40001';
  END IF;
  IF coalesce(v_model.definition->>'modelType','') NOT IN ('SERVICO','AMBOS') THEN
    RAISE EXCEPTION 'Selecione um modelo do tipo Serviços ou Ambos para este lançamento.' USING ERRCODE='22023'; END IF;
  -- Keep the immutable request payload (template plus dates), then render server-side.
  v_input:=jsonb_set(v_input,'{serviceDescription}',to_jsonb(private.render_nfse_service_period(
    v_input->>'serviceDescription',v_input->>'servicePeriodStart',v_input->>'servicePeriodEnd',
    position('{{periodo}}' IN v_model.definition->>'serviceDescription')>0)));
  IF v_input->>'existingReceivableId' IS NOT NULL THEN
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
  ELSE
    -- NFSe scope authorizes required terms without exposing financial titles.
    PERFORM 1 FROM public.categorias_financeiras WHERE id=(v_input->>'categoryId')::uuid
      AND upper(tipo)='OUTRO_CREDITO' AND public.is_active_status(status) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria financeira de serviço indisponível.' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM public.contas_receber c WHERE c.polo_id=p_polo_id
      AND c.cliente_id=v_partner.id AND c.categoria='OUTROS_CREDITOS'
      AND c.status IN ('PENDENTE','VENCIDO','PAGO') AND c.valor=(v_input->>'amount')::numeric
      AND c.data_vencimento=(v_input->>'dueDate')::date AND btrim(c.descricao)=v_input->>'serviceDescription') THEN
      RAISE EXCEPTION 'Já existe uma conta com estes dados. Vincule a conta existente com o Financeiro.' USING ERRCODE='23505'; END IF;
    v_action:='PENDING';
  END IF;
  INSERT INTO private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,
    service_description,amount,partner_snapshot,model_snapshot,receivable_id,receivable_action,created_by,service_period_start,service_period_end)
  VALUES(v_id,p_polo_id,p_environment,v_partner.id,v_model.id,(v_input->>'serviceDate')::date,
    v_input->>'serviceDescription',(v_input->>'amount')::numeric,
    jsonb_build_object('name',v_partner.nome,'tradeName',v_partner.nome_fantasia,
      'document',v_partner.cpf_cnpj,'type',v_partner.tipo),
    v_model.definition || jsonb_build_object('id',v_model.id,'version',v_model.version),
    v_receivable_id,v_action,auth.uid(),(v_input->>'servicePeriodStart')::date,(v_input->>'servicePeriodEnd')::date);
  INSERT INTO private.nfse_service_financial_plans(service_id,due_date,category_id,existing_receivable_id,rule,
    financial_input,financial_preview,issue_bolepix,requested_by,context_key)
  VALUES(v_id,coalesce(v_receivable.data_vencimento,(v_input->>'dueDate')::date),
    coalesce(v_receivable.categoria_financeira_id,(v_input->>'categoryId')::uuid,
      (SELECT default_category_id FROM private.nfse_service_financial_policy)),
    v_receivable_id,CASE WHEN v_receivable_id IS NULL THEN 'EXPLICIT' ELSE 'EXISTING_TITLE' END,
    v_financial->'financialPlan',v_financial->'preview',coalesce((v_financial#>>'{financialPlan,issueBolePix}')::boolean,false),
    auth.uid(),p_context_key);
  v_response := jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'id',v_id,'receivableId',v_receivable_id,'receivableAction',v_action,'message',CASE v_action
      WHEN 'CREATED' THEN 'Serviço salvo e conta a receber criada.'
      WHEN 'LINKED' THEN 'Serviço salvo com a conta existente vinculada.' ELSE 'Serviço salvo. A conta a receber será criada após a autorização da NFS-e.' END));
  INSERT INTO private.nfse_partner_service_requests(actor_id,request_id,payload,response)
    VALUES(auth.uid(),p_request_id,v_payload,v_response);
  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_nfse_partner_service_options_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
SET statement_timeout = '8s' AS $function$
DECLARE
  v_partners jsonb; v_categories jsonb := '[]'; v_receivables jsonb := '[]';
  v_finance boolean := true;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  BEGIN
    PERFORM internal_finance.authorize_other_credit_plan(p_polo_id,true);
  EXCEPTION WHEN insufficient_privilege THEN v_finance := false;
  END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.nome,
    'tradeName',p.nome_fantasia,'document',p.cpf_cnpj,'type',p.tipo) ORDER BY p.nome,p.id),'[]')
  INTO v_partners FROM (
    SELECT id,nome,nome_fantasia,cpf_cnpj,tipo FROM public.parceiros p
    WHERE p.tipo IN ('PF','PJ') AND public.is_active_status(p.status)
      AND ((p.polo_id IS NULL AND cardinality(coalesce(p.polo_ids,ARRAY[]::uuid[])) = 0)
        OR p.polo_id = p_polo_id OR p_polo_id = ANY(coalesce(p.polo_ids,ARRAY[]::uuid[])))
    ORDER BY p.nome,p.id LIMIT 501
  ) p;
  IF jsonb_array_length(v_partners) > 500 THEN
    RAISE EXCEPTION 'Catálogo de parceiros excede o limite desta consulta.' USING ERRCODE = '54000';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.nome) ORDER BY c.nome,c.id),'[]')
      INTO v_categories FROM public.categorias_financeiras c
      WHERE c.id=private.nfse_service_required_category();
  IF v_finance THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'partnerId',c.cliente_id,
      'description',c.descricao,'amount',c.valor::numeric(14,2)::text,
      'dueDate',c.data_vencimento,'categoryId',c.categoria_financeira_id,'status',c.status)
      ORDER BY c.data_vencimento,c.id),'[]') INTO v_receivables
    FROM (
      SELECT c.* FROM private.nfse_partner_linkable_receivables c
      WHERE c.polo_id = p_polo_id AND c.cliente_id IN (
        SELECT (value->>'id')::uuid FROM jsonb_array_elements(v_partners))
      ORDER BY c.data_vencimento,c.id LIMIT 501
    ) c;
    IF jsonb_array_length(v_receivables) > 500 THEN
      RAISE EXCEPTION 'Catálogo de contas a receber excede o limite desta consulta.' USING ERRCODE = '54000';
    END IF;
  END IF;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'partners',v_partners,'categories',v_categories,'existingReceivables',v_receivables,
    'capabilities',jsonb_build_object('canGenerateReceivable',true,'canLinkExistingReceivable',v_finance,
      'canIssueBolePix',coalesce(internal_financial_payments.actor_allowed(auth.uid(),p_polo_id,'receber'),false))));
END;
$function$;

REVOKE ALL ON FUNCTION public.save_nfse_partner_service_secure(uuid,uuid,text,text,uuid,jsonb),
  public.get_nfse_partner_service_options_secure(uuid,uuid,text,text),
  public.preview_nfse_service_financial_plan_secure(uuid,uuid,text,text,uuid,text,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_nfse_partner_service_secure(uuid,uuid,text,text,uuid,jsonb),
  public.get_nfse_partner_service_options_secure(uuid,uuid,text,text),
  public.preview_nfse_service_financial_plan_secure(uuid,uuid,text,text,uuid,text,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
