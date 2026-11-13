BEGIN;

-- Reuse the canonical late-charge/discount/calendar engine. The principal is
-- split in integer cents; late interest is never financed into the NFS-e total.
CREATE FUNCTION private.nfse_service_financial_preview(p_partner uuid,p_description text,
  p_amount numeric,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_count integer; v_cents bigint; v_base bigint; v_remainder bigint;
  v_engine_input jsonb; v_preview jsonb; v_custom jsonb; v_normalized jsonb; v_token text;
BEGIN
  p_description:=btrim(p_description);
  IF p_partner IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount*100<>trunc(p_amount*100)
    OR p_amount>99999999.99 OR p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 1 AND 2000
    OR jsonb_typeof(p_input) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN (
      'installments','firstDueDate','categoryId','monthlyInterestPercent','penaltyPercent',
      'discountType','discountValue','discountDaysBeforeDue','periodicity','issueBolePix','previewToken'))
    OR jsonb_typeof(p_input->'installments') IS DISTINCT FROM 'number'
    OR coalesce(p_input->>'installments','') !~ '^[0-9]{1,2}$'
    OR jsonb_typeof(p_input->'issueBolePix') IS DISTINCT FROM 'boolean'
    OR coalesce(p_input->>'categoryId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Informe as condições financeiras do serviço.' USING ERRCODE='22023'; END IF;
  v_count:=(p_input->>'installments')::integer;
  v_cents:=(p_amount*100)::bigint;
  IF v_count NOT BETWEEN 1 AND 60 OR v_cents<v_count THEN
    RAISE EXCEPTION 'Selecione de 1 a 60 parcelas com pelo menos um centavo cada.' USING ERRCODE='22023'; END IF;
  v_base:=v_cents/v_count;v_remainder:=v_cents%v_count;
  v_engine_input:=jsonb_build_object('clienteId',p_partner,'descricao',left(btrim(p_description),500),
    'categoriaFinanceiraId',p_input->>'categoryId','quantidadeParcelas',v_count,'valorParcela',round(v_base::numeric/100,2),
    'primeiroVencimento',p_input->>'firstDueDate','periodicidade',coalesce(p_input->>'periodicity','MENSAL_CALENDARIO'),
    'jurosMensalPercentual',coalesce(p_input->'monthlyInterestPercent','0'::jsonb),
    'multaPercentual',coalesce(p_input->'penaltyPercent','0'::jsonb),
    'descontoTipo',coalesce(p_input->>'discountType','FIXO'),'descontoValor',coalesce(p_input->'discountValue','0'::jsonb),
    'descontoDiasAntecedencia',coalesce(p_input->'discountDaysBeforeDue','0'::jsonb),
    'matricula',NULL,'rematricula',NULL);
  v_preview:=internal_finance.other_credit_plan_preview(v_engine_input);
  SELECT jsonb_agg(jsonb_build_object('numero',(r->>'numero')::integer,
    'valor',round((v_base+CASE WHEN (r->>'numero')::integer=v_count THEN v_remainder ELSE 0 END)::numeric/100,2),
    'vencimento',r->>'dataVencimento') ORDER BY (r->>'numero')::integer)
  INTO v_custom FROM jsonb_array_elements(v_preview->'parcelas') r;
  v_preview:=internal_finance.other_credit_plan_preview(v_engine_input||jsonb_build_object('parcelasPersonalizadas',v_custom));
  IF (v_preview->>'totalNominal')::numeric IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'O total do plano difere do valor fiscal.' USING ERRCODE='22023'; END IF;
  v_normalized:=jsonb_build_object('installments',v_count,'firstDueDate',v_preview#>>'{input,primeiroVencimento}',
    'categoryId',(p_input->>'categoryId')::uuid,'monthlyInterestPercent',v_preview#>'{input,jurosMensalPercentual}',
    'penaltyPercent',v_preview#>'{input,multaPercentual}','discountType',v_preview#>>'{input,descontoTipo}',
    'discountValue',v_preview#>'{input,descontoValor}','discountDaysBeforeDue',v_preview#>'{input,descontoDiasAntecedencia}',
    'periodicity',coalesce(p_input->>'periodicity','MENSAL_CALENDARIO'),'issueBolePix',(p_input->>'issueBolePix')::boolean);
  v_token:=encode(sha256(convert_to(jsonb_build_object('partnerId',p_partner,'description',p_description,
    'amount',p_amount,'financialPlan',v_normalized,'preview',v_preview)::text,'UTF8')),'hex');
  IF p_input ? 'previewToken' AND p_input->>'previewToken' IS DISTINCT FROM v_token THEN
    RAISE EXCEPTION 'As condições financeiras mudaram. Confira a prévia novamente.' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('financialPlan',v_normalized||jsonb_build_object('previewToken',v_token),
    'preview',v_preview,'token',v_token);
END;
$function$;

CREATE FUNCTION public.preview_nfse_service_financial_plan_secure(p_context_key uuid,p_polo_id uuid,
  p_environment text,p_month text,p_partner_id uuid,p_amount text,p_service_description text,p_financial_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
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
REVOKE ALL ON FUNCTION private.nfse_service_financial_preview(uuid,text,numeric,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preview_nfse_service_financial_plan_secure(uuid,uuid,text,text,uuid,text,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_nfse_service_financial_plan_secure(uuid,uuid,text,text,uuid,text,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
