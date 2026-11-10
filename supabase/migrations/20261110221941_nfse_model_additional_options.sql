BEGIN;

CREATE FUNCTION private.normalize_nfse_model_additional_options(p_options jsonb,p_definition jsonb,p_polo_id uuid,p_environment text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_people jsonb; v_service jsonb; v_existing_people jsonb:=p_definition->'peopleOptions';
  v_existing_service jsonb:=p_definition->'serviceOptions'; v_rule jsonb; v_fixed jsonb; v_key text;
  v_nif jsonb; v_policy text; v_reason text; v_role text; v_provider_location text; v_destination_location text;
  v_partner uuid; v_property jsonb; v_unit jsonb; v_item jsonb; v_context jsonb;
  v_ibs boolean; v_destination boolean; v_brazil boolean; v_construction boolean; v_event boolean; v_is_property boolean;
  v_comex boolean; v_references boolean; v_code text:=p_definition->>'nationalServiceCode'; v_identifier text;
BEGIN
  IF p_options IS NULL OR p_options='null'::jsonb THEN RETURN 'null'::jsonb; END IF;
  PERFORM private.nfse_preset_object(p_options,ARRAY['version','people','service']);
  IF p_options->'version'<>'1'::jsonb OR jsonb_typeof(v_existing_people) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_existing_service) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Configure Pessoas e Serviço antes dos campos adicionais.' USING ERRCODE='22023'; END IF;
  v_people:=p_options->'people'; v_service:=p_options->'service';
  PERFORM private.nfse_preset_object(v_people,ARRAY['destinationLocation','personalUse','providerPartner',
    'providerLocation','emissionReason','rejectedInvoiceReference','nif']);
  PERFORM private.nfse_preset_object(v_service,ARRAY['municipalServiceCode','internalContributorCode','construction',
    'property','event','foreignTrade','operationReferences','orderItems','rentedMovableAssets']);
  v_destination_location:=private.nfse_preset_choice(v_people->'destinationLocation',ARRAY['FROM_PARTNER','BRASIL','EXTERIOR'],true);
  v_provider_location:=private.nfse_preset_choice(v_people->'providerLocation',ARRAY['FROM_PARTNER','BRASIL','EXTERIOR'],true);
  v_reason:=private.nfse_preset_choice(v_people->'emissionReason',ARRAY['1','2','3','4'],true);
  IF jsonb_typeof(v_people->'personalUse') NOT IN ('boolean','null') THEN
    RAISE EXCEPTION 'Confirme a opção de uso pessoal.' USING ERRCODE='22023'; END IF;
  v_ibs:=v_existing_service->'includeIbsCbs'='true'::jsonb;
  v_destination:=coalesce(v_ibs,false) AND v_existing_people->'recipientIsDestination'='false'::jsonb;
  v_brazil:=v_existing_service->>'countryCode'='BRA'; v_role:=v_existing_people->>'issuerRole';
  IF NOT coalesce(v_ibs,false) AND v_people->'personalUse'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Uso pessoal é permitido somente com IBS/CBS.' USING ERRCODE='22023'; END IF;
  IF v_destination<>(v_destination_location IS NOT NULL) THEN
    RAISE EXCEPTION 'Localização do destinatário adicional incompatível.' USING ERRCODE='22023'; END IF;
  v_fixed:=private.nfse_preset_rule_value(v_people->'providerPartner');
  IF v_role='PROVIDER' THEN
    IF v_people->'providerPartner'<>'null'::jsonb OR v_provider_location IS NOT NULL OR v_reason IS NOT NULL
      OR v_people->'rejectedInvoiceReference'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Prestador emitente utiliza somente o cadastro da unidade.' USING ERRCODE='22023'; END IF;
  ELSE
    IF v_people->'providerPartner'='null'::jsonb OR v_provider_location IS NULL OR v_reason IS NULL THEN
      RAISE EXCEPTION 'Defina prestador, localização e motivo da emissão.' USING ERRCODE='22023'; END IF;
    IF v_fixed IS NOT NULL THEN
      v_partner:=private.nfse_preset_partner(v_fixed,p_polo_id);
      v_people:=v_people||jsonb_build_object('providerPartner',jsonb_build_object('source','FIXED','value',v_partner));
    END IF;
  END IF;
  v_fixed:=private.nfse_preset_rule_value(v_people->'rejectedInvoiceReference');
  IF coalesce(v_reason='4',false)<>(v_people->'rejectedInvoiceReference'<>'null'::jsonb) THEN
    RAISE EXCEPTION 'Referência rejeitada é exclusiva e obrigatória no motivo 4.' USING ERRCODE='22023';
  END IF;
  IF v_fixed IS NOT NULL THEN PERFORM private.nfse_preset_code(v_fixed,'^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$'); END IF;
  PERFORM private.nfse_preset_object(v_people->'nif',ARRAY['provider','recipient','destination','intermediary']);
  FOREACH v_key IN ARRAY ARRAY['provider','recipient','destination','intermediary'] LOOP
    v_nif:=v_people#>ARRAY['nif',v_key];
    IF v_nif<>'null'::jsonb THEN
      PERFORM private.nfse_preset_object(v_nif,ARRAY['policy','absenceReason']);
      v_policy:=private.nfse_preset_choice(v_nif->'policy',ARRAY['FROM_PARTNER','REQUIRE_NIF','WITHOUT_NIF']);
      v_identifier:=private.nfse_preset_choice(v_nif->'absenceReason',ARRAY['1','2'],true);
      IF (v_policy='WITHOUT_NIF')<>(v_identifier IS NOT NULL) THEN
        RAISE EXCEPTION 'Motivo de ausência NIF incompatível.' USING ERRCODE='22023'; END IF;
    END IF;
    IF (v_key='provider' AND (v_role='PROVIDER' OR v_provider_location='BRASIL')
      OR v_key='recipient' AND v_existing_people->>'recipientLocation'<>'EXTERIOR'
      OR v_key='intermediary' AND v_existing_people->>'intermediaryLocation'<>'EXTERIOR'
      OR v_key='destination' AND (NOT v_destination OR v_destination_location='BRASIL')) AND v_nif<>'null'::jsonb THEN
      RAISE EXCEPTION 'Estratégia NIF fora do participante exterior aplicável.' USING ERRCODE='22023'; END IF;
    IF (v_key='provider' AND v_provider_location='EXTERIOR'
      OR v_key='recipient' AND v_existing_people->>'recipientLocation'='EXTERIOR'
      OR v_key='intermediary' AND v_existing_people->>'intermediaryLocation'='EXTERIOR'
      OR v_key='destination' AND v_destination AND v_destination_location<>'BRASIL') AND v_nif='null'::jsonb THEN
      RAISE EXCEPTION 'Defina a estratégia NIF do participante no exterior.' USING ERRCODE='22023'; END IF;
  END LOOP;
  v_context:=private.nfse_preset_context(p_definition,p_polo_id,p_environment);
  FOREACH v_key IN ARRAY ARRAY['municipalServiceCode','internalContributorCode'] LOOP
    v_rule:=v_service->v_key; v_fixed:=private.nfse_preset_rule_value(v_rule);
    IF v_fixed IS NOT NULL THEN
      IF v_key='municipalServiceCode' THEN PERFORM private.nfse_preset_code(v_fixed,'^[0-9]{3}$');
      ELSE PERFORM private.nfse_preset_text(v_fixed,20,false); END IF;
    END IF;
  END LOOP;
  IF v_context->>'simpleNationalOption'='2' AND v_service->'municipalServiceCode'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Código municipal complementar não é permitido para MEI.' USING ERRCODE='22023'; END IF;
  IF v_service#>>'{municipalServiceCode,source}'='FIXED' THEN
    RAISE EXCEPTION 'Código municipal fixo exige catálogo oficial autorizado; mantenha resolução na emissão.' USING ERRCODE='22023'; END IF;
  v_construction:=v_code=ANY(ARRAY['070201','070202','070401','070501','070502','070601','070602',
    '070701','070801','071701','071901','141403','141404']);
  v_rule:=v_service->'construction'; v_fixed:=private.nfse_preset_rule_value(v_rule);
  IF (v_construction AND v_rule='null'::jsonb) OR (NOT v_construction AND v_code<>'990101' AND v_rule<>'null'::jsonb) THEN
    RAISE EXCEPTION 'Informações de obra incompatíveis com o serviço.' USING ERRCODE='22023'; END IF;
  IF v_fixed IS NOT NULL THEN PERFORM private.validate_nfse_preset_construction(v_fixed,v_brazil); END IF;
  v_event:=left(v_code,2)='12'; v_rule:=v_service->'event'; v_fixed:=private.nfse_preset_rule_value(v_rule);
  IF v_event<>(v_rule<>'null'::jsonb) THEN
    RAISE EXCEPTION 'Informações de evento incompatíveis com o serviço.' USING ERRCODE='22023'; END IF;
  IF v_fixed IS NOT NULL THEN PERFORM private.validate_nfse_preset_event(v_fixed,v_brazil); END IF;
  v_is_property:=coalesce(v_ibs,false) AND p_definition->>'operationIndicatorCode'=ANY(ARRAY['020101','020201','020301']) AND NOT v_construction;
  v_property:=v_service->'property';
  IF v_is_property<>(v_property<>'null'::jsonb) THEN
    RAISE EXCEPTION 'Informações de imóvel incompatíveis com o indicador.' USING ERRCODE='22023'; END IF;
  IF v_property<>'null'::jsonb THEN
    PERFORM private.nfse_preset_object(v_property,ARRAY['municipality','units','originalDueDate']);
    IF v_property->'municipality'='null'::jsonb OR v_property->'units'='null'::jsonb
      OR v_property->'originalDueDate'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Complete o imóvel Web sem ativar vencimento exclusivo da API.' USING ERRCODE='22023'; END IF;
    v_fixed:=private.nfse_preset_rule_value(v_property->'municipality');
    IF v_fixed IS NOT NULL THEN
      v_identifier:=private.nfse_preset_code(v_fixed,'^[0-9]{7}$');
      IF NOT EXISTS(SELECT 1 FROM public.catalogo_municipios_ibge WHERE codigo_ibge::text=v_identifier AND ativo) THEN
        RAISE EXCEPTION 'Município do imóvel indisponível.' USING ERRCODE='22023'; END IF;
    END IF;
    v_fixed:=private.nfse_preset_rule_value(v_property->'units');
    IF v_fixed IS NOT NULL THEN
      IF jsonb_typeof(v_fixed) IS DISTINCT FROM 'array' OR jsonb_array_length(v_fixed)<>1 THEN
        RAISE EXCEPTION 'O formulário Web permite uma unidade imobiliária; não ative multiunidade da API.' USING ERRCODE='22023'; END IF;
      FOR v_unit IN SELECT value FROM jsonb_array_elements(v_fixed) LOOP
        PERFORM private.validate_nfse_preset_property_unit(v_unit,v_brazil); END LOOP;
    END IF;
  END IF;
  IF v_service->'rentedMovableAssets'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Bens móveis alugados exclusivos da API não estão disponíveis neste formulário Web.' USING ERRCODE='22023'; END IF;
  v_comex:=(CASE WHEN v_role='PROVIDER' THEN v_existing_people->>'recipientLocation'='EXTERIOR'
      OR v_existing_people->>'intermediaryLocation'='EXTERIOR' OR p_definition->>'issTreatment'='EXPORTACAO'
    ELSE v_provider_location='EXTERIOR' END) OR NOT v_brazil;
  IF coalesce(v_comex,false) AND v_service->'foreignTrade'='null'::jsonb
    OR NOT coalesce(v_comex,false) AND v_provider_location IS DISTINCT FROM 'FROM_PARTNER' AND v_service->'foreignTrade'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Comércio exterior incompatível com o cenário conhecido.' USING ERRCODE='22023'; END IF;
  PERFORM private.normalize_nfse_preset_foreign_trade(v_service->'foreignTrade');
  v_references:=coalesce(v_ibs,false) AND v_existing_service->>'operationType'=ANY(ARRAY['2','3']);
  IF v_references<>(v_service->'operationReferences'<>'null'::jsonb) THEN
    RAISE EXCEPTION 'Referências anteriores são exclusivas e obrigatórias nos tipos 2 ou 3.' USING ERRCODE='22023'; END IF;
  FOREACH v_key IN ARRAY ARRAY['operationReferences','orderItems'] LOOP
    v_fixed:=private.nfse_preset_rule_value(v_service->v_key);
    IF v_fixed IS NOT NULL THEN
      IF jsonb_typeof(v_fixed) IS DISTINCT FROM 'array' OR jsonb_array_length(v_fixed) NOT BETWEEN 1 AND 99 THEN
        RAISE EXCEPTION 'Lista adicional deve possuir de 1 a 99 itens.' USING ERRCODE='22023'; END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_fixed) LOOP
        IF v_key='operationReferences' THEN PERFORM private.nfse_preset_code(v_item,'^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$');
        ELSE PERFORM private.nfse_preset_text(v_item,60,false); END IF;
      END LOOP;
      IF v_key='operationReferences' AND jsonb_array_length(v_fixed)<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(v_fixed)) THEN
        RAISE EXCEPTION 'Referência de NFS-e anterior duplicada.' USING ERRCODE='22023'; END IF;
    END IF;
  END LOOP;
  RETURN p_options||jsonb_build_object('people',v_people);
END;
$function$;
REVOKE ALL ON FUNCTION private.normalize_nfse_model_additional_options(jsonb,jsonb,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
