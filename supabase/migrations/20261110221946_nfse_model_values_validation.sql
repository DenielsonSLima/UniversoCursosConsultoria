BEGIN;

CREATE FUNCTION private.nfse_preset_classification(p_cst text,p_code text,p_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_row jsonb;
BEGIN
  SELECT definition INTO v_row FROM private.nfse_fiscal_classifications WHERE code=p_code AND cst=p_cst;
  IF v_row IS NULL OR v_row#>'{classificationFlags,IndNfse}' IS DISTINCT FROM 'true'::jsonb
    OR (v_row->>'cstValidFrom' IS NOT NULL AND left(v_row->>'cstValidFrom',10)::date>p_date)
    OR (v_row->>'cstValidUntil' IS NOT NULL AND left(v_row->>'cstValidUntil',10)::date<p_date)
    OR (v_row->>'validFrom' IS NOT NULL AND left(v_row->>'validFrom',10)::date>p_date)
    OR (v_row->>'validUntil' IS NOT NULL AND left(v_row->>'validUntil',10)::date<p_date) THEN
    RAISE EXCEPTION 'CST/classificação sem vigência para NFS-e na competência.' USING ERRCODE='22023'; END IF;
  RETURN v_row;
END;
$function$;

CREATE FUNCTION private.nfse_preset_credit_eligible(p_code text,p_date date)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT coalesce((SELECT definition->'nfse'='true'::jsonb AND definition->'appropriationByDfe'='true'::jsonb
    AND ((definition->'ibs'='true'::jsonb AND definition->>'ibsValidFrom' IS NOT NULL
      AND left(definition->>'ibsValidFrom',10)::date<=p_date
      AND (definition->>'ibsValidUntil' IS NULL OR left(definition->>'ibsValidUntil',10)::date>=p_date))
    OR (definition->'cbs'='true'::jsonb AND definition->>'cbsValidFrom' IS NOT NULL
      AND left(definition->>'cbsValidFrom',10)::date<=p_date
      AND (definition->>'cbsValidUntil' IS NULL OR left(definition->>'cbsValidUntil',10)::date>=p_date)))
    FROM private.nfse_fiscal_credits WHERE code=p_code),false);
$function$;

CREATE FUNCTION private.validate_nfse_model_values_context(p_value jsonb,p_definition jsonb,p_context jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_rule jsonb; v_key text; v_service numeric; v_sum numeric:=0; v_iss jsonb:=p_value->'iss';
  v_federal jsonb:=p_value->'federal'; v_ibs jsonb:=p_value->'ibscbs'; v_transparency jsonb:=p_value->'transparency';
  v_sn text:=p_context->>'simpleNationalOption'; v_assessment text:=p_context->>'simpleNationalAssessment';
  v_people jsonb:=p_definition->'peopleOptions'; v_include jsonb:=p_definition#>'{serviceOptions,includeIbsCbs}';
  v_date date:=(p_context->>'competenceDate')::date; v_class jsonb;
BEGIN
  IF jsonb_typeof(v_people) IS DISTINCT FROM 'object' OR v_include NOT IN ('true'::jsonb,'false'::jsonb)
    OR v_include IS NULL OR v_sn IS NULL OR v_sn NOT IN ('1','2','3')
    OR (v_sn='3' AND (v_assessment IS NULL OR v_assessment NOT IN ('1','2','3'))) THEN
    RAISE EXCEPTION 'Confirme Pessoas, IBS/CBS e enquadramento da unidade antes de salvar Valores.' USING ERRCODE='22023'; END IF;
  IF p_value#>>'{serviceAmount,source}'='FIXED' THEN
    v_service:=(p_value#>>'{serviceAmount,fixedAmount}')::numeric;
    IF v_service<=0 THEN RAISE EXCEPTION 'Valor fixo do serviço deve ser positivo.' USING ERRCODE='22023'; END IF;
  END IF;
  IF v_people->>'issuerRole'='INTERMEDIARY' AND p_value#>>'{intermediaryAmount,source}'='NONE' THEN
    RAISE EXCEPTION 'Defina a origem do valor recebido pelo intermediário.' USING ERRCODE='22023'; END IF;
  FOR v_rule IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    p_value->'unconditionalDiscount',p_value->'conditionalDiscount',v_iss->'benefitReduction',
    v_federal->'withheldCp',v_federal->'withheldIrrf',v_federal->'withheldSocialContributions')) LOOP
    IF v_rule->>'source'<>'NONE' AND (v_rule->>'value')::numeric<=0 THEN
      RAISE EXCEPTION 'Use regra monetária positiva ou selecione nenhuma.' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['unconditionalDiscount','conditionalDiscount'] LOOP
    v_rule:=p_value->v_key;
    IF v_rule->>'source'='PERCENTAGE' AND (v_rule->>'value')::numeric>=100 THEN
      RAISE EXCEPTION 'Cada desconto deve ser inferior ao serviço.' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR v_rule IN SELECT value FROM jsonb_array_elements(jsonb_build_array(p_value->'unconditionalDiscount',
    p_value->'conditionalDiscount',v_federal->'withheldCp',v_federal->'withheldIrrf',v_federal->'withheldSocialContributions')) LOOP
    IF v_rule->>'source'='FIXED' THEN
      IF v_service IS NOT NULL AND (v_rule->>'value')::numeric>=v_service THEN
        RAISE EXCEPTION 'Desconto/retenção fixo deve ser inferior ao serviço.' USING ERRCODE='22023'; END IF;
      v_sum:=v_sum+(v_rule->>'value')::numeric;
    END IF;
  END LOOP;
  IF v_service IS NOT NULL AND v_sum>v_service THEN
    RAISE EXCEPTION 'Soma dos descontos e retenções supera o serviço.' USING ERRCODE='22023'; END IF;
  IF (v_iss->>'retention'='RECIPIENT' AND v_people->>'issuerRole'<>'RECIPIENT' AND v_people->>'recipientLocation'='NOT_INFORMED')
    OR (v_iss->>'retention'='INTERMEDIARY' AND v_people->>'issuerRole'<>'INTERMEDIARY' AND v_people->>'intermediaryLocation'='NOT_INFORMED') THEN
    RAISE EXCEPTION 'Retenção exige participante informado em Pessoas.' USING ERRCODE='22023'; END IF;
  IF v_iss->>'retention'<>'NONE' AND (p_definition->>'issTreatment'<>'TRIBUTAVEL'
    OR v_sn='2' OR v_iss->>'suspensionType'<>'NONE') THEN
    RAISE EXCEPTION 'Retenção ISS incompatível com tributação, suspensão ou regime.' USING ERRCODE='22023'; END IF;
  IF v_sn='3' AND v_assessment='1' AND v_iss->>'retention'='NONE' AND v_iss->>'rateSource'<>'FROM_RULES' THEN
    RAISE EXCEPTION 'ISS do Simples integral sem retenção é resolvido pelo sistema.' USING ERRCODE='22023'; END IF;
  IF v_iss->>'rateSource'='FIXED' AND (p_definition->>'issTreatment'<>'TRIBUTAVEL' OR v_sn='2') THEN
    RAISE EXCEPTION 'Alíquota ISS fixa exige operação tributável e regime diferente de MEI.' USING ERRCODE='22023'; END IF;
  IF v_iss->'ratePercent'<>'null'::jsonb AND (v_iss->>'ratePercent')::numeric NOT BETWEEN 0.01 AND 5 THEN
    RAISE EXCEPTION 'Revise alíquota ISS e enquadramento; não se apura alíquota real no pré-modelo.' USING ERRCODE='22023'; END IF;
  IF v_iss->'benefitId'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Benefício municipal exige catálogo oficial autorizado; código avulso não é permitido.' USING ERRCODE='22023'; END IF;
  IF (v_sn='2' OR (v_sn='3' AND v_assessment IN ('1','2'))) AND v_federal->>'mode'='EXPLICIT' THEN
    RAISE EXCEPTION 'Tributos federais no Simples devem vir da unidade confirmada.' USING ERRCODE='22023'; END IF;
  IF v_federal->>'mode'='EXPLICIT' THEN
    IF (v_federal->>'retentionType'='0' AND v_federal#>>'{withheldSocialContributions,source}'<>'NONE')
      OR (v_federal->>'retentionType' IS NOT NULL AND v_federal->>'retentionType' NOT IN ('0','2')
        AND v_federal#>>'{withheldSocialContributions,source}'='NONE')
      OR (v_federal->>'pisCofinsCst' IS NULL AND v_federal#>>'{withheldSocialContributions,source}'<>'NONE') THEN
      RAISE EXCEPTION 'Contribuições sociais retidas incompatíveis com a situação/tipo informado.' USING ERRCODE='22023'; END IF;
    IF (v_federal->'pisRatePercent'<>'null'::jsonb OR v_federal->'cofinsRatePercent'<>'null'::jsonb)
      AND v_federal#>>'{base,source}'='NONE' THEN
      RAISE EXCEPTION 'Alíquotas PIS/COFINS exigem base.' USING ERRCODE='22023'; END IF;
    FOREACH v_key IN ARRAY ARRAY['pisRatePercent','cofinsRatePercent'] LOOP
      IF (v_federal->>v_key)::numeric>=100 THEN
        RAISE EXCEPTION 'Percentual PIS/COFINS fora do formato vigente.' USING ERRCODE='22023'; END IF;
    END LOOP;
  END IF;
  IF (v_transparency->>'mode'='NOT_INFORMED' AND v_sn<>'2')
    OR (v_transparency->>'mode'='SIMPLE_NATIONAL_PERCENTAGE' AND v_sn<>'3') THEN
    RAISE EXCEPTION 'Transparência tributária incompatível com o regime.' USING ERRCODE='22023'; END IF;
  FOREACH v_key IN ARRAY ARRAY['federalPercent','statePercent','municipalPercent','simpleNationalPercent'] LOOP
    IF (v_transparency->>v_key)::numeric>=100 THEN
      RAISE EXCEPTION 'Percentual de transparência fora do formato vigente.' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_value#>>'{deduction,value}' IS NOT NULL AND (p_value#>>'{deduction,value}')::numeric<=0 THEN
    RAISE EXCEPTION 'Dedução deve ser positiva ou inativa.' USING ERRCODE='22023'; END IF;
  IF v_include='true'::jsonb THEN
    IF v_ibs='null'::jsonb THEN RAISE EXCEPTION 'Complete IBS/CBS.' USING ERRCODE='22023'; END IF;
    v_class:=private.nfse_preset_classification(v_ibs->>'cst',v_ibs->>'classificationCode',v_date);
    IF coalesce(v_class#>'{flags,IndDiferimento}'='true'::jsonb,false)<>(v_ibs->'deferral'<>'null'::jsonb)
      OR coalesce(v_class#>'{classificationFlags,IndTribRegular}'='true'::jsonb,false)<>(v_ibs->'regularTaxation'<>'null'::jsonb) THEN
      RAISE EXCEPTION 'Diferimento/tributação regular incompatíveis com flags oficiais.' USING ERRCODE='22023'; END IF;
    IF v_ibs->'regularTaxation'<>'null'::jsonb THEN
      PERFORM private.nfse_preset_classification(v_ibs#>>'{regularTaxation,cst}',v_ibs#>>'{regularTaxation,classificationCode}',v_date);
    END IF;
    IF v_ibs->>'presumedCreditCode' IS NOT NULL AND
      (v_class#>'{classificationFlags,IndPermiteCredPres}' IS DISTINCT FROM 'true'::jsonb
        OR NOT private.nfse_preset_credit_eligible(v_ibs->>'presumedCreditCode',v_date)) THEN
      RAISE EXCEPTION 'Crédito presumido sem permissão/vigência para apropriação na NFS-e.' USING ERRCODE='22023'; END IF;
  ELSIF v_ibs<>'null'::jsonb THEN
    RAISE EXCEPTION 'IBS/CBS desativado exige grupo vazio.' USING ERRCODE='22023'; END IF;
END;
$function$;

CREATE FUNCTION private.normalize_nfse_model_values_options(p_options jsonb,p_definition jsonb,p_polo_id uuid,p_environment text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_rule jsonb; v_deduction jsonb; v_mode text; v_value numeric; v_documents jsonb; v_result jsonb;
BEGIN
  IF p_options IS NULL OR p_options='null'::jsonb THEN RETURN 'null'::jsonb; END IF;
  PERFORM private.nfse_preset_object(p_options,ARRAY['version','serviceAmount','intermediaryAmount',
    'unconditionalDiscount','conditionalDiscount','iss','deduction','federal','ibscbs','transparency','rental']);
  IF p_options->'version'<>'1'::jsonb OR p_options->'rental'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Versão inválida ou ramo de locação exclusivo da API não suportado neste formulário Web.' USING ERRCODE='22023'; END IF;
  v_rule:=p_options->'serviceAmount';
  PERFORM private.nfse_preset_object(v_rule,ARRAY['source','fixedAmount']);
  v_mode:=private.nfse_preset_choice(v_rule->'source',ARRAY['RECEIPTS','FIXED']);
  IF v_mode='FIXED' THEN PERFORM private.nfse_preset_decimal(v_rule->'fixedAmount');
  ELSIF v_rule->'fixedAmount'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Origem financeira não armazena valor fixo.' USING ERRCODE='22023'; END IF;
  PERFORM private.normalize_nfse_preset_amount(p_options->'intermediaryAmount',ARRAY['SERVICE']);
  PERFORM private.normalize_nfse_preset_amount(p_options->'unconditionalDiscount',ARRAY['SERVICE']);
  PERFORM private.normalize_nfse_preset_amount(p_options->'conditionalDiscount',ARRAY['SERVICE']);
  PERFORM private.normalize_nfse_preset_iss(p_options->'iss');
  PERFORM private.normalize_nfse_preset_federal(p_options->'federal');
  PERFORM private.normalize_nfse_preset_transparency(p_options->'transparency');
  v_deduction:=p_options->'deduction';
  PERFORM private.nfse_preset_object(v_deduction,ARRAY['mode','value','documents']);
  v_mode:=private.nfse_preset_choice(v_deduction->'mode',ARRAY['NONE','FIXED','PERCENTAGE','DOCUMENTS']);
  v_value:=private.nfse_preset_decimal(v_deduction->'value',v_mode='PERCENTAGE',true);
  v_documents:=private.normalize_nfse_preset_documents(v_deduction->'documents',p_environment,'DEDUCTION',p_polo_id);
  IF (v_mode IN ('FIXED','PERCENTAGE'))<>(v_value IS NOT NULL)
    OR (v_mode='DOCUMENTS')<>(jsonb_array_length(v_documents)>0) THEN
    RAISE EXCEPTION 'Regra de dedução incompatível.' USING ERRCODE='22023'; END IF;
  v_result:=p_options||jsonb_build_object('deduction',v_deduction||jsonb_build_object('documents',v_documents),
    'ibscbs',private.normalize_nfse_preset_ibs(p_options->'ibscbs',p_environment,p_polo_id));
  PERFORM private.validate_nfse_model_values_context(v_result,p_definition,private.nfse_preset_context(p_definition,p_polo_id,p_environment));
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION private.nfse_preset_classification(text,text,date),private.nfse_preset_credit_eligible(text,date),
  private.validate_nfse_model_values_context(jsonb,jsonb,jsonb),
  private.normalize_nfse_model_values_options(jsonb,jsonb,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
