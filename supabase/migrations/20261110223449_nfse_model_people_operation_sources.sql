BEGIN;

-- New writes contain reusable strategies, never a participant of a future note.
-- Historical definitions and request payloads are not rewritten.
CREATE OR REPLACE FUNCTION private.normalize_nfse_model_people_options(p_options jsonb,p_service_options jsonb,p_polo_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_mode text; v_series text; v_option text; v_assessment text; v_relation boolean; v_destination text;
  v_ibs boolean:=p_service_options->'includeIbsCbs'='true'::jsonb; v_date date;
BEGIN
  IF p_options IS NULL OR p_options='null'::jsonb THEN RETURN 'null'::jsonb; END IF;
  PERFORM private.nfse_preset_object(p_options,ARRAY['version','competenceMode','competenceDate','dpsSeriesMode',
    'dpsSeries','issuerRole','simpleNationalOption','simpleNationalAssessment','recipientSource',
    'recipientAddressSource','recipientIsDestination','destinationSource','intermediarySource']);
  IF p_options->'version'<>'2'::jsonb THEN
    RAISE EXCEPTION 'Revise as estratégias sem participantes fixos.' USING ERRCODE='22023'; END IF;
  v_mode:=private.nfse_preset_choice(p_options->'competenceMode',ARRAY['ISSUE_DATE','FIXED_DATE']);
  IF v_mode='FIXED_DATE' THEN
    v_date:=private.nfse_preset_date(p_options->'competenceDate');
    IF v_ibs IS TRUE AND v_date<DATE '2026-01-01' THEN
      RAISE EXCEPTION 'O preenchimento IBS/CBS exige competência a partir de 01/01/2026.' USING ERRCODE='22023'; END IF;
  ELSIF p_options->'competenceDate'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Competência pela emissão não armazena data concreta.' USING ERRCODE='22023'; END IF;
  v_mode:=private.nfse_preset_choice(p_options->'dpsSeriesMode',ARRAY['AUTOMATIC','CUSTOM']);
  IF v_mode='CUSTOM' THEN
    v_series:=private.nfse_preset_code(p_options->'dpsSeries','^[0-9]{1,5}$');
    IF v_series::integer NOT BETWEEN 1 AND 49999 THEN
      RAISE EXCEPTION 'A série de integração deve estar entre 1 e 49999.' USING ERRCODE='22023'; END IF;
  ELSIF p_options->'dpsSeries'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Série automática não armazena série concreta.' USING ERRCODE='22023'; END IF;
  PERFORM private.nfse_preset_choice(p_options->'issuerRole',ARRAY['PROVIDER','RECIPIENT','INTERMEDIARY']);
  v_option:=private.nfse_preset_choice(p_options->'simpleNationalOption',ARRAY['FROM_ESTABLISHMENT','1','2','3']);
  v_assessment:=private.nfse_preset_choice(p_options->'simpleNationalAssessment',ARRAY['FROM_ESTABLISHMENT','1','2','3'],true);
  IF (v_option IN ('1','2') AND v_assessment IS NOT NULL) OR (v_option='3' AND v_assessment IS NULL) THEN
    RAISE EXCEPTION 'Apuração incompatível ou não confirmada para a opção do Simples.' USING ERRCODE='22023'; END IF;
  PERFORM private.nfse_preset_choice(p_options->'recipientSource',ARRAY['AT_ISSUANCE']);
  PERFORM private.nfse_preset_choice(p_options->'recipientAddressSource',ARRAY['FROM_PARTNER','OMIT']);
  PERFORM private.nfse_preset_choice(p_options->'intermediarySource',ARRAY['NONE','AT_ISSUANCE']);
  IF jsonb_typeof(p_options->'recipientIsDestination') NOT IN ('boolean','null') THEN
    RAISE EXCEPTION 'Confirme a relação entre adquirente e destinatário.' USING ERRCODE='22023'; END IF;
  v_relation:=(p_options->>'recipientIsDestination')::boolean;
  v_destination:=private.nfse_preset_choice(p_options->'destinationSource',ARRAY['AT_ISSUANCE'],true);
  IF v_ibs IS TRUE THEN
    IF v_relation IS NULL OR (v_relation AND v_destination IS NOT NULL) OR (NOT v_relation AND v_destination IS NULL) THEN
      RAISE EXCEPTION 'Defina a estratégia de destinatário IBS/CBS.' USING ERRCODE='22023'; END IF;
  ELSIF v_relation IS NOT NULL OR v_destination IS NOT NULL THEN
    RAISE EXCEPTION 'Destinatário adicional permitido somente com IBS/CBS.' USING ERRCODE='22023'; END IF;
  -- Country, legal identity and government-recipient requirements are resolved
  -- against the participants of the individual operation, not guessed here.
  RETURN p_options;
END;
$function$;
REVOKE ALL ON FUNCTION private.normalize_nfse_model_people_options(jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.nfse_model_people_option_labels(p_definition jsonb,p_polo_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT CASE WHEN p_definition#>'{peopleOptions,version}'='1'::jsonb THEN
    p_definition||jsonb_build_object('peopleOptions',(p_definition->'peopleOptions')||jsonb_build_object(
      'destinationPartnerLabel',private.nfse_model_partner_label(p_polo_id,(p_definition#>>'{peopleOptions,destinationPartnerId}')::uuid),
      'intermediaryPartnerLabel',private.nfse_model_partner_label(p_polo_id,(p_definition#>>'{peopleOptions,intermediaryPartnerId}')::uuid)))
    ELSE p_definition END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_model_people_option_labels(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
