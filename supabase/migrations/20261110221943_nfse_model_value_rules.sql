BEGIN;

CREATE FUNCTION private.normalize_nfse_preset_amount(p_rule jsonb,p_bases text[])
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_source text;
BEGIN
  PERFORM private.nfse_preset_object(p_rule,ARRAY['source','value','base']);
  v_source:=private.nfse_preset_choice(p_rule->'source',ARRAY['NONE','FIXED','PERCENTAGE']);
  IF v_source='NONE' THEN
    IF p_rule->'value'<>'null'::jsonb OR p_rule->'base'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Regra inativa não armazena valor ou base.' USING ERRCODE='22023'; END IF;
  ELSE
    PERFORM private.nfse_preset_decimal(p_rule->'value',v_source='PERCENTAGE');
    IF v_source='FIXED' AND p_rule->'base'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Valor fixo não utiliza base percentual.' USING ERRCODE='22023'; END IF;
    IF v_source='PERCENTAGE' THEN PERFORM private.nfse_preset_choice(p_rule->'base',p_bases); END IF;
  END IF;
  RETURN p_rule;
END;
$function$;

CREATE FUNCTION private.normalize_nfse_preset_documents(p_rules jsonb,p_environment text,p_purpose text,p_polo_id uuid)
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
    v_supplier:=private.nfse_preset_choice(v_rule->'supplierSource',ARRAY['DOCUMENT','FIXED_PARTNER','OMIT']);
    v_partner:=NULL;
    IF v_supplier='FIXED_PARTNER' THEN v_partner:=private.nfse_preset_partner(v_rule->'supplierPartnerId',p_polo_id);
    ELSIF v_rule->'supplierPartnerId'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Fornecedor não fixo não armazena referência de parceiro.' USING ERRCODE='22023'; END IF;
    v_result:=v_result||jsonb_build_array(v_rule||jsonb_build_object('supplierPartnerId',v_partner));
  END LOOP;
  -- These are selection/allocation rules, not concrete document keys or dates.
  RETURN v_result;
END;
$function$;

CREATE FUNCTION private.normalize_nfse_preset_iss(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_suspension text; v_rate text; v_process text; v_percent numeric; v_benefit text;
BEGIN
  PERFORM private.nfse_preset_object(p_value,ARRAY['specialTaxRegime','suspensionType','suspensionProcessNumber',
    'retention','rateSource','ratePercent','benefitId','benefitReduction']);
  PERFORM private.nfse_preset_choice(p_value->'specialTaxRegime',ARRAY['FROM_ESTABLISHMENT','0','1','2','3','4','5','6','9']);
  v_suspension:=private.nfse_preset_choice(p_value->'suspensionType',ARRAY['NONE','JUDICIAL','ADMINISTRATIVE']);
  v_process:=private.nfse_preset_text(p_value->'suspensionProcessNumber',30);
  PERFORM private.nfse_preset_choice(p_value->'retention',ARRAY['NONE','RECIPIENT','INTERMEDIARY']);
  v_rate:=private.nfse_preset_choice(p_value->'rateSource',ARRAY['FROM_RULES','FIXED']);
  v_percent:=private.nfse_preset_decimal(p_value->'ratePercent',true,true);
  v_benefit:=private.nfse_preset_code(p_value->'benefitId','^[0-9]{14}$',true);
  PERFORM private.normalize_nfse_preset_amount(p_value->'benefitReduction',ARRAY['SERVICE_AFTER_UNCONDITIONAL_AND_DEDUCTION']);
  IF (v_suspension='NONE')<>(v_process IS NULL) OR (v_rate='FROM_RULES')<>(v_percent IS NULL)
    OR (v_benefit IS NULL AND p_value#>>'{benefitReduction,source}'<>'NONE') THEN
    RAISE EXCEPTION 'Grupos municipais inativos devem permanecer vazios.' USING ERRCODE='22023'; END IF;
  RETURN p_value;
END;
$function$;

CREATE FUNCTION private.normalize_nfse_preset_federal(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_mode text; v_cst text; v_retention text; v_key text; v_rules_none boolean:=true;
BEGIN
  PERFORM private.nfse_preset_object(p_value,ARRAY['mode','pisCofinsCst','base','pisRatePercent','cofinsRatePercent',
    'retentionType','withheldCp','withheldIrrf','withheldSocialContributions']);
  v_mode:=private.nfse_preset_choice(p_value->'mode',ARRAY['FROM_ESTABLISHMENT','EXPLICIT']);
  v_cst:=private.nfse_preset_choice(p_value->'pisCofinsCst',ARRAY['00','01','02','03','04','05','06','07','08','09','49',
    '50','51','52','53','54','55','56','60','61','62','63','64','65','66','67','70','71','72','73','74','75','98','99'],true);
  v_retention:=private.nfse_preset_choice(p_value->'retentionType',ARRAY['0','1','2','3','4','5','6','7','8','9'],true);
  PERFORM private.nfse_preset_decimal(p_value->'pisRatePercent',true,true);
  PERFORM private.nfse_preset_decimal(p_value->'cofinsRatePercent',true,true);
  FOREACH v_key IN ARRAY ARRAY['base','withheldCp','withheldIrrf','withheldSocialContributions'] LOOP
    PERFORM private.normalize_nfse_preset_amount(p_value->v_key,ARRAY['SERVICE']);
    v_rules_none:=v_rules_none AND p_value#>>ARRAY[v_key,'source']='NONE';
  END LOOP;
  IF v_mode='FROM_ESTABLISHMENT' AND (v_cst IS NOT NULL OR v_retention IS NOT NULL OR NOT v_rules_none
    OR p_value->'pisRatePercent'<>'null'::jsonb OR p_value->'cofinsRatePercent'<>'null'::jsonb) THEN
    RAISE EXCEPTION 'Tributos herdados não armazenam valores explícitos.' USING ERRCODE='22023'; END IF;
  IF v_mode='EXPLICIT' AND ((v_cst IS NOT NULL AND v_retention IS NULL)
    OR (v_cst IS NULL AND (v_retention IS NOT NULL OR p_value#>>'{base,source}'<>'NONE'
      OR p_value->'pisRatePercent'<>'null'::jsonb OR p_value->'cofinsRatePercent'<>'null'::jsonb))) THEN
    RAISE EXCEPTION 'PIS/COFINS exige situação e campos compatíveis.' USING ERRCODE='22023'; END IF;
  RETURN p_value;
END;
$function$;

CREATE FUNCTION private.normalize_nfse_preset_transparency(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_mode text; v_key text; v_none boolean:=true; v_any_none boolean:=false;
  v_percent_count integer:=0; v_sn numeric;
BEGIN
  PERFORM private.nfse_preset_object(p_value,ARRAY['mode','federal','state','municipal','federalPercent',
    'statePercent','municipalPercent','simpleNationalPercent']);
  v_mode:=private.nfse_preset_choice(p_value->'mode',ARRAY['AMOUNTS','PERCENTAGES','SIMPLE_NATIONAL_PERCENTAGE','NOT_INFORMED']);
  FOREACH v_key IN ARRAY ARRAY['federal','state','municipal'] LOOP
    PERFORM private.normalize_nfse_preset_amount(p_value->v_key,ARRAY['SERVICE']);
    v_none:=v_none AND p_value#>>ARRAY[v_key,'source']='NONE';
    v_any_none:=v_any_none OR p_value#>>ARRAY[v_key,'source']='NONE';
    IF private.nfse_preset_decimal(p_value->(v_key||'Percent'),true,true) IS NOT NULL THEN
      v_percent_count:=v_percent_count+1; END IF;
  END LOOP;
  v_sn:=private.nfse_preset_decimal(p_value->'simpleNationalPercent',true,true);
  IF (v_mode='AMOUNTS' AND (v_any_none OR v_percent_count<>0 OR v_sn IS NOT NULL))
    OR (v_mode<>'AMOUNTS' AND NOT v_none)
    OR (v_mode='PERCENTAGES' AND (v_percent_count<>3 OR v_sn IS NOT NULL))
    OR (v_mode<>'PERCENTAGES' AND v_percent_count<>0)
    OR (v_mode='SIMPLE_NATIONAL_PERCENTAGE')<>(v_sn IS NOT NULL) THEN
    RAISE EXCEPTION 'Estratégia de transparência tributária incompatível.' USING ERRCODE='22023'; END IF;
  RETURN p_value;
END;
$function$;

CREATE FUNCTION private.normalize_nfse_preset_ibs(p_value jsonb,p_environment text,p_polo_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_regular jsonb; v_deferral jsonb; v_key text; v_documents jsonb;
BEGIN
  IF p_value='null'::jsonb THEN RETURN p_value; END IF;
  PERFORM private.nfse_preset_object(p_value,ARRAY['cst','classificationCode','presumedCreditCode',
    'regularTaxation','deferral','reimbursementDocuments']);
  PERFORM private.nfse_preset_code(p_value->'cst','^[0-9]{3}$');
  PERFORM private.nfse_preset_code(p_value->'classificationCode','^[0-9]{6}$');
  PERFORM private.nfse_preset_code(p_value->'presumedCreditCode','^[0-9]{2}$',true);
  IF left(p_value->>'classificationCode',3)<>p_value->>'cst' THEN
    RAISE EXCEPTION 'CST e classificação incompatíveis.' USING ERRCODE='22023'; END IF;
  v_regular:=p_value->'regularTaxation';
  IF v_regular<>'null'::jsonb THEN
    PERFORM private.nfse_preset_object(v_regular,ARRAY['cst','classificationCode']);
    PERFORM private.nfse_preset_code(v_regular->'cst','^[0-9]{3}$');
    PERFORM private.nfse_preset_code(v_regular->'classificationCode','^[0-9]{6}$');
    IF left(v_regular->>'classificationCode',3)<>v_regular->>'cst' THEN
      RAISE EXCEPTION 'Tributação regular incompatível.' USING ERRCODE='22023'; END IF;
  END IF;
  v_deferral:=p_value->'deferral';
  IF v_deferral<>'null'::jsonb THEN
    PERFORM private.nfse_preset_object(v_deferral,ARRAY['statePercent','municipalPercent','cbsPercent']);
    FOREACH v_key IN ARRAY ARRAY['statePercent','municipalPercent','cbsPercent'] LOOP
      PERFORM private.nfse_preset_decimal(v_deferral->v_key,true); END LOOP;
  END IF;
  v_documents:=private.normalize_nfse_preset_documents(p_value->'reimbursementDocuments',p_environment,'REIMBURSEMENT',p_polo_id);
  RETURN p_value||jsonb_build_object('reimbursementDocuments',v_documents);
END;
$function$;

REVOKE ALL ON FUNCTION private.normalize_nfse_preset_amount(jsonb,text[]),
  private.normalize_nfse_preset_documents(jsonb,text,text,uuid),private.normalize_nfse_preset_iss(jsonb),
  private.normalize_nfse_preset_federal(jsonb),private.normalize_nfse_preset_transparency(jsonb),
  private.normalize_nfse_preset_ibs(jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
