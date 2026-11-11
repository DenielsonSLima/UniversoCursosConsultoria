BEGIN;

-- Supplier strategies do not select a participant. Fiscal validation uses the
-- declared operation sources; actual party eligibility is checked at issuance.
CREATE OR REPLACE FUNCTION private.normalize_nfse_preset_documents(p_rules jsonb,p_environment text,p_purpose text,p_polo_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_rule jsonb; v_result jsonb:='[]'; v_category text; v_categories text[];
  v_type text; v_allocation text; v_supplier text; v_partner uuid; v_legacy boolean;
BEGIN
  IF jsonb_typeof(p_rules) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rules)>1000 THEN
    RAISE EXCEPTION 'O pré-modelo aceita até 1000 regras por lista documental.' USING ERRCODE='22023'; END IF;
  IF p_purpose NOT IN ('DEDUCTION','REIMBURSEMENT') THEN
    RAISE EXCEPTION 'Finalidade documental inválida.' USING ERRCODE='22023'; END IF;
  v_legacy:=p_environment='PRODUCAO' AND p_purpose='DEDUCTION';
  v_categories:=CASE WHEN p_environment='HOMOLOGACAO' THEN CASE WHEN p_purpose='DEDUCTION'
      THEN ARRAY['2','5','6','7','8','9','99'] ELSE ARRAY['101','102','103','104','105','199'] END
    ELSE CASE WHEN p_purpose='DEDUCTION' THEN ARRAY['01','02','03','04','05','06','07','08','99']
      ELSE ARRAY['01','02','03','04','99'] END END;
  FOR v_rule IN SELECT value FROM jsonb_array_elements(p_rules) LOOP
    PERFORM private.nfse_preset_object(v_rule,ARRAY['source','documentType','categoryCode','categoryDescription',
      'documentDescription','allocationMode','allocationValue','supplierSource','supplierPartnerId']);
    PERFORM private.nfse_preset_choice(v_rule->'source',ARRAY['LINKED_OPERATION_DOCUMENTS']);
    v_type:=private.nfse_preset_choice(v_rule->'documentType',ARRAY['NATIONAL_NFSE','NFE','CTE','OTHER_NATIONAL_DFE',
      'MUNICIPAL_NFSE','NF_NFS','OTHER_FISCAL','NON_FISCAL']);
    v_category:=private.nfse_preset_choice(v_rule->'categoryCode',v_categories);
    PERFORM private.nfse_preset_text(v_rule->'categoryDescription',150,v_category NOT IN ('99','199'));
    PERFORM private.nfse_preset_text(v_rule->'documentDescription',255,
      v_type NOT IN ('OTHER_NATIONAL_DFE','OTHER_FISCAL','NON_FISCAL'));
    IF (v_legacy AND v_type IN ('CTE','OTHER_NATIONAL_DFE'))
      OR (NOT v_legacy AND v_type IN ('MUNICIPAL_NFSE','NF_NFS')) THEN
      RAISE EXCEPTION 'Tipo documental incompatível com ambiente e finalidade.' USING ERRCODE='22023'; END IF;
    v_allocation:=private.nfse_preset_choice(v_rule->'allocationMode',ARRAY['ELIGIBLE_AMOUNT','FIXED','PERCENTAGE']);
    IF v_allocation='ELIGIBLE_AMOUNT' THEN
      IF v_rule->'allocationValue'<>'null'::jsonb THEN
        RAISE EXCEPTION 'Alocação elegível é resolvida nos documentos da operação.' USING ERRCODE='22023'; END IF;
    ELSIF private.nfse_preset_decimal(v_rule->'allocationValue',v_allocation='PERCENTAGE')<=0 THEN
      RAISE EXCEPTION 'A parcela documental deve ser maior que zero.' USING ERRCODE='22023'; END IF;
    v_supplier:=private.nfse_preset_choice(v_rule->'supplierSource',ARRAY['DOCUMENT','OMIT']);
    v_partner:=NULL;
    IF v_rule->'supplierPartnerId'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Fornecedor concreto deve vir do documento da operação.' USING ERRCODE='22023'; END IF;
    v_result:=v_result||jsonb_build_array(v_rule||jsonb_build_object('supplierPartnerId',v_partner));
  END LOOP;
  -- These are selection/allocation rules, not concrete document keys or dates.
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION private.validate_nfse_model_values_context(p_value jsonb,p_definition jsonb,p_context jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_rule jsonb; v_key text; v_service numeric; v_sum numeric:=0; v_iss jsonb:=p_value->'iss';
  v_federal jsonb:=p_value->'federal'; v_ibs jsonb:=p_value->'ibscbs'; v_transparency jsonb:=p_value->'transparency';
  v_sn text:=p_context->>'simpleNationalOption'; v_assessment text:=p_context->>'simpleNationalAssessment';
  v_people jsonb:=p_definition->'peopleOptions'; v_include jsonb:=p_definition#>'{serviceOptions,includeIbsCbs}';
  v_date date:=(p_context->>'competenceDate')::date; v_class jsonb;
BEGIN
  IF jsonb_typeof(v_people) IS DISTINCT FROM 'object' OR v_people->'version'<>'2'::jsonb OR v_include NOT IN ('true'::jsonb,'false'::jsonb)
    OR v_include IS NULL OR v_sn IS NULL OR v_sn NOT IN ('1','2','3')
    OR (v_sn='3' AND (v_assessment IS NULL OR v_assessment NOT IN ('1','2','3'))) THEN
    RAISE EXCEPTION 'Confirme as estratégias gerais, IBS/CBS e enquadramento da unidade antes de salvar Valores.' USING ERRCODE='22023'; END IF;
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
  IF (v_iss->>'retention'='RECIPIENT' AND v_people->>'issuerRole'<>'RECIPIENT' AND v_people->>'recipientSource' IS DISTINCT FROM 'AT_ISSUANCE')
    OR (v_iss->>'retention'='INTERMEDIARY' AND v_people->>'issuerRole'<>'INTERMEDIARY' AND v_people->>'intermediarySource' IS DISTINCT FROM 'AT_ISSUANCE') THEN
    RAISE EXCEPTION 'Retenção exige estratégia de participante disponível na emissão.' USING ERRCODE='22023'; END IF;
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

REVOKE ALL ON FUNCTION private.normalize_nfse_preset_documents(jsonb,text,text,uuid),
  private.validate_nfse_model_values_context(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
