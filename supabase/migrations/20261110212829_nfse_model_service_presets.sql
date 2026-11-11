BEGIN;

-- Match the national service-description limit, preserving literal expansion
-- and keeping the receipt reference month separate from fiscal competence.
CREATE OR REPLACE FUNCTION private.render_nfse_model_description(p_description text,p_month text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_month_label text:=private.nfse_reference_month_label(p_month); v_remaining text; v_rendered text;
BEGIN
  IF p_description IS NULL OR btrim(p_description)='' OR length(p_description)>2000 THEN
    RAISE EXCEPTION 'Descrição do serviço inválida.' USING ERRCODE='22023';
  END IF;
  v_remaining:=replace(p_description,'{{mes_referencia}}','');
  IF position('{{' IN v_remaining)>0 OR position('}}' IN v_remaining)>0 THEN
    RAISE EXCEPTION 'Variável de descrição inválida. Use {{mes_referencia}}.' USING ERRCODE='22023';
  END IF;
  v_rendered:=replace(btrim(p_description),'{{mes_referencia}}',v_month_label);
  IF length(v_rendered)>2000 THEN
    RAISE EXCEPTION 'Descrição preenchida excede 2.000 caracteres.' USING ERRCODE='22023';
  END IF;
  RETURN v_rendered;
END;
$function$;
REVOKE ALL ON FUNCTION private.render_nfse_model_description(text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.normalize_nfse_model_service_options(
  p_options jsonb,p_iss_treatment text,p_national_service_code text,p_operation_indicator text
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_country text; v_municipality text; v_export_country text; v_include boolean; v_government boolean;
  v_operation text; v_entity text; v_operation_required boolean;
BEGIN
  IF p_options IS NULL OR p_options='null'::jsonb THEN RETURN 'null'::jsonb; END IF;
  IF jsonb_typeof(p_options)<>'object'
    OR NOT (p_options ?& ARRAY['version','countryCode','municipalityCode','exportResultCountryCode',
      'includeIbsCbs','governmentPurchase','governmentEntityType','operationType'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_options) f(key) WHERE key NOT IN
      ('version','countryCode','municipalityCode','exportResultCountryCode','includeIbsCbs',
       'governmentPurchase','governmentEntityType','operationType'))
    OR p_options->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_options->'countryCode') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_options->'includeIbsCbs') NOT IN ('boolean','null')
    OR jsonb_typeof(p_options->'governmentPurchase') NOT IN ('boolean','null') THEN
    RAISE EXCEPTION 'Preferências do serviço inválidas.' USING ERRCODE='22023';
  END IF;
  v_country:=upper(btrim(p_options->>'countryCode'));
  IF v_country !~ '^[A-Z]{3}$' OR NOT EXISTS(SELECT 1 FROM public.catalogo_paises_nacionalidades
    WHERE codigo_iso3=v_country AND ativo IS TRUE) THEN
    RAISE EXCEPTION 'Selecione um país ativo do catálogo.' USING ERRCODE='22023';
  END IF;
  IF v_country='BRA' THEN
    IF jsonb_typeof(p_options->'municipalityCode') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Informe o município da prestação no Brasil.' USING ERRCODE='22023'; END IF;
    v_municipality:=btrim(p_options->>'municipalityCode');
    IF v_municipality !~ '^[0-9]{7}$' OR NOT EXISTS(SELECT 1 FROM public.catalogo_municipios_ibge
      WHERE codigo_ibge::text=v_municipality AND ativo IS TRUE) THEN
      RAISE EXCEPTION 'Selecione um município ativo do catálogo IBGE.' USING ERRCODE='22023'; END IF;
  ELSIF p_options->'municipalityCode' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Município IBGE permitido somente para prestação no Brasil.' USING ERRCODE='22023';
  END IF;
  IF p_iss_treatment='EXPORTACAO' THEN
    IF jsonb_typeof(p_options->'exportResultCountryCode') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Informe o país onde ocorre o resultado da exportação.' USING ERRCODE='22023'; END IF;
    v_export_country:=upper(btrim(p_options->>'exportResultCountryCode'));
    IF v_export_country !~ '^[A-Z]{3}$' OR NOT EXISTS(SELECT 1 FROM public.catalogo_paises_nacionalidades
      WHERE codigo_iso3=v_export_country AND ativo IS TRUE) THEN
      RAISE EXCEPTION 'Selecione um país ativo para o resultado da exportação.' USING ERRCODE='22023'; END IF;
  ELSIF p_options->'exportResultCountryCode' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'País de resultado permitido somente para exportação.' USING ERRCODE='22023';
  END IF;
  IF p_options->'operationType'<>'null'::jsonb AND
    (jsonb_typeof(p_options->'operationType') IS DISTINCT FROM 'string'
      OR p_options->>'operationType' NOT IN ('1','2','3','4','5')) THEN
    RAISE EXCEPTION 'Tipo de operação inválido.' USING ERRCODE='22023'; END IF;
  IF p_options->'governmentEntityType'<>'null'::jsonb AND
    (jsonb_typeof(p_options->'governmentEntityType') IS DISTINCT FROM 'string'
      OR p_options->>'governmentEntityType' NOT IN ('1','2','3','4')) THEN
    RAISE EXCEPTION 'Tipo de ente governamental inválido.' USING ERRCODE='22023'; END IF;
  v_include:=(p_options->>'includeIbsCbs')::boolean;
  v_government:=(p_options->>'governmentPurchase')::boolean;
  v_operation:=p_options->>'operationType'; v_entity:=p_options->>'governmentEntityType';
  IF v_include IS TRUE THEN
    IF v_government IS NULL THEN
      RAISE EXCEPTION 'Informe se a operação envolve compra governamental.' USING ERRCODE='22023'; END IF;
    IF coalesce(p_operation_indicator,'') !~ '^[0-9]{6}$' THEN
      RAISE EXCEPTION 'Informe o código indicador da operação IBS/CBS.' USING ERRCODE='22023'; END IF;
    IF v_government IS TRUE AND v_entity IS NULL THEN
      RAISE EXCEPTION 'Informe o tipo de ente na compra governamental.' USING ERRCODE='22023'; END IF;
    IF v_government IS NOT TRUE AND v_entity IS NOT NULL THEN
      RAISE EXCEPTION 'Ente governamental permitido somente para compra governamental.' USING ERRCODE='22023'; END IF;
    v_operation_required:=v_government IS TRUE OR left(p_national_service_code,4) IN ('2505','1509','1712','1005');
    IF v_operation_required AND v_operation IS NULL THEN
      RAISE EXCEPTION 'Informe o tipo de operação deste serviço.' USING ERRCODE='22023'; END IF;
    IF NOT v_operation_required AND v_operation IS NOT NULL THEN
      RAISE EXCEPTION 'Tipo de operação não aplicável ao cenário selecionado.' USING ERRCODE='22023'; END IF;
  ELSE
    IF v_government IS NOT NULL OR v_entity IS NOT NULL OR v_operation IS NOT NULL
      OR (v_include IS FALSE AND coalesce(p_operation_indicator,'')<>'') THEN
      RAISE EXCEPTION 'Opções IBS/CBS incompatíveis com o preenchimento selecionado.' USING ERRCODE='22023'; END IF;
  END IF;
  -- ISO3 is the model/catalog identifier. It is not a ready-to-send cPais XML value.
  RETURN jsonb_build_object('version',1,'countryCode',v_country,'municipalityCode',v_municipality,
    'exportResultCountryCode',v_export_country,'includeIbsCbs',v_include,'governmentPurchase',v_government,
    'governmentEntityType',v_entity,'operationType',v_operation);
END;
$function$;
REVOKE ALL ON FUNCTION private.normalize_nfse_model_service_options(jsonb,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_model_service_option_labels(p_definition jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT CASE WHEN jsonb_typeof(p_definition->'serviceOptions')='object' THEN
    p_definition||jsonb_build_object('serviceOptions',(p_definition->'serviceOptions')||jsonb_build_object(
      'countryLabel',(SELECT pais FROM public.catalogo_paises_nacionalidades
        WHERE codigo_iso3=p_definition#>>'{serviceOptions,countryCode}' AND ativo IS TRUE ORDER BY pais LIMIT 1),
      'municipalityLabel',(SELECT nome||' / '||uf FROM public.catalogo_municipios_ibge
        WHERE codigo_ibge::text=p_definition#>>'{serviceOptions,municipalityCode}' AND ativo IS TRUE ORDER BY nome LIMIT 1),
      'exportResultCountryLabel',(SELECT pais FROM public.catalogo_paises_nacionalidades
        WHERE codigo_iso3=p_definition#>>'{serviceOptions,exportResultCountryCode}' AND ativo IS TRUE ORDER BY pais LIMIT 1)))
    ELSE p_definition END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_model_service_option_labels(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_nfse_models_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
DECLARE v_rows jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  SELECT coalesce(jsonb_agg(private.nfse_model_service_option_labels(model.definition)
    ||jsonb_build_object('id',model.id,'version',model.version)
    ORDER BY lower(model.definition->>'name'),model.id),'[]'::jsonb) INTO v_rows
  FROM private.nfse_models model WHERE model.polo_id=p_polo_id AND model.environment=p_environment;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('rows',v_rows,'page',1,'pageSize',100,
    'totalItems',jsonb_array_length(v_rows)));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_models_secure(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_models_secure(uuid,uuid,text,text) TO authenticated;
COMMIT;
