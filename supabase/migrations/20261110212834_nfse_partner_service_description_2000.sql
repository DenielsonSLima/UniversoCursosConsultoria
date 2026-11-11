BEGIN;

-- Align the existing preparation with the national service-description limit.
-- Authentication, financial opt-in, replay and snapshot behavior are unchanged.
ALTER TABLE private.nfse_partner_services
  DROP CONSTRAINT nfse_partner_services_service_description_check,
  ADD CONSTRAINT nfse_partner_services_service_description_check
    CHECK (length(service_description) BETWEEN 1 AND 2000);

CREATE OR REPLACE FUNCTION private.normalize_nfse_partner_service(p_definition jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $function$
DECLARE
  v_partner uuid; v_model uuid; v_model_version integer; v_date date;
  v_amount numeric(14,2); v_description text; v_generate boolean;
  v_existing uuid; v_due date; v_category uuid;
BEGIN
  IF p_definition IS NULL OR jsonb_typeof(p_definition) <> 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_definition) k WHERE k NOT IN (
      'partnerId','modelId','modelVersion','serviceDate','serviceDescription','amount',
      'generateReceivable','existingReceivableId','dueDate','categoryId')) THEN
    RAISE EXCEPTION 'Dados do serviço inválidos.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_definition->'amount') IS DISTINCT FROM 'string'
    OR (p_definition->>'amount') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
    OR (p_definition->>'amount')::numeric <= 0
    OR jsonb_typeof(p_definition->'modelVersion') IS DISTINCT FROM 'number'
    OR (p_definition->>'modelVersion') !~ '^[1-9][0-9]{0,8}$'
    OR jsonb_typeof(p_definition->'serviceDescription') IS DISTINCT FROM 'string'
    OR coalesce(p_definition->>'serviceDate','') !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    OR (p_definition ? 'generateReceivable'
      AND jsonb_typeof(p_definition->'generateReceivable') IS DISTINCT FROM 'boolean') THEN
    RAISE EXCEPTION 'Valor, modelo ou data do serviço inválidos.' USING ERRCODE = '22023';
  END IF;
  v_partner := (p_definition->>'partnerId')::uuid;
  v_model := (p_definition->>'modelId')::uuid;
  v_model_version := (p_definition->>'modelVersion')::integer;
  v_date := (p_definition->>'serviceDate')::date;
  v_amount := (p_definition->>'amount')::numeric;
  v_description := btrim(p_definition->>'serviceDescription');
  v_generate := coalesce((p_definition->>'generateReceivable')::boolean,false);
  v_existing := nullif(p_definition->>'existingReceivableId','')::uuid;
  v_due := nullif(p_definition->>'dueDate','')::date;
  v_category := nullif(p_definition->>'categoryId','')::uuid;
  IF v_partner IS NULL OR v_model IS NULL OR length(v_description) NOT BETWEEN 1 AND 2000
    OR position('{{' IN v_description) > 0 OR position('}}' IN v_description) > 0
    OR to_char(v_date,'YYYY-MM-DD') IS DISTINCT FROM p_definition->>'serviceDate'
    OR (NOT v_generate AND (v_existing IS NOT NULL OR v_due IS NOT NULL OR v_category IS NOT NULL))
    OR (v_generate AND v_existing IS NOT NULL AND (v_due IS NOT NULL OR v_category IS NOT NULL))
    OR (v_generate AND v_existing IS NULL AND (v_due IS NULL OR v_category IS NULL))
    OR (v_due IS NOT NULL AND (to_char(v_due,'YYYY-MM-DD') IS DISTINCT FROM p_definition->>'dueDate'
      OR extract(year FROM v_due) NOT BETWEEN 1900 AND 2199)) THEN
    RAISE EXCEPTION 'Revise a descrição literal e as opções de contas a receber.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('partnerId',v_partner,'modelId',v_model,'modelVersion',v_model_version,
    'serviceDate',v_date,'serviceDescription',v_description,'amount',v_amount::text,
    'generateReceivable',v_generate,'existingReceivableId',v_existing,'dueDate',v_due,'categoryId',v_category);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format
  OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Dados do serviço inválidos.' USING ERRCODE = '22023';
END;
$function$;
REVOKE ALL ON FUNCTION private.normalize_nfse_partner_service(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
