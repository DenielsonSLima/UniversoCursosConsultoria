BEGIN;
-- Explicit shared-course rule approved for future operations, never a model mutation.
-- Primary indicator catalogue: https://dfe-portal.svrs.rs.gov.br/CFF/TabelaIndicadoresDosLocaisDeOperacao
-- 030101: local do fornecedor = estabelecimento do fornecedor. Other codes remain fixed.
CREATE FUNCTION private.resolve_nfse_operation_service_location(p_definition jsonb,p_configuration jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_service jsonb:=p_definition->'serviceOptions'; v_country text; v_fixed text; v_code text;
  v_indicator text; v_from_issuer boolean; v_source text;
BEGIN
  IF v_service->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(v_service->'countryCode') IS DISTINCT FROM 'string' THEN RETURN NULL; END IF;
  v_country:=v_service->>'countryCode';
  v_fixed:=CASE WHEN jsonb_typeof(v_service->'municipalityCode')='string'
    AND v_service->>'municipalityCode' ~ '^[0-9]{7}$' THEN v_service->>'municipalityCode' ELSE NULL END;
  IF v_country !~ '^[A-Z]{3}$' OR(v_country='BRA' AND v_fixed IS NULL) THEN RETURN NULL; END IF;
  v_indicator:=CASE WHEN jsonb_typeof(p_definition->'operationIndicatorCode')='string'
    AND p_definition->>'operationIndicatorCode' ~ '^[0-9]{6}$' THEN p_definition->>'operationIndicatorCode' ELSE NULL END;
  v_from_issuer:=coalesce(v_country='BRA' AND p_definition#>>'{peopleOptions,issuerRole}'='PROVIDER'
    AND v_service->'includeIbsCbs'='true'::jsonb AND v_service->'governmentPurchase'='false'::jsonb
    AND v_indicator='030101',false);
  IF v_from_issuer THEN
    v_source:='ISSUER_ESTABLISHMENT';
    v_code:=CASE WHEN jsonb_typeof(p_configuration->'municipalityCode')='string'
      AND p_configuration->>'municipalityCode' ~ '^[0-9]{7}$' THEN p_configuration->>'municipalityCode' ELSE NULL END;
  ELSE v_source:='MODEL_FIXED';v_code:=v_fixed; END IF;
  IF(v_country='BRA' AND v_code IS NULL) OR(v_country<>'BRA' AND v_fixed IS NOT NULL) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('source',v_source,'countryCode',v_country,'municipalityCode',v_code,
    'modelMunicipalityCode',v_fixed,'operationIndicatorCode',v_indicator);
END;
$function$;
REVOKE ALL ON FUNCTION private.resolve_nfse_operation_service_location(jsonb,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.resolve_nfse_operation_service_location(jsonb,jsonb) IS
  'Deterministic operation location from frozen model/configuration; model identity/version and original XML are never rewritten.';
COMMIT;

