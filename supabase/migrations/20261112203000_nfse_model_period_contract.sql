BEGIN;

CREATE OR REPLACE FUNCTION private.validate_nfse_description_template(p_description text)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE v_remaining text:=p_description; v_token text;
BEGIN
  IF p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'A descrição deve conter de 1 a 2.000 caracteres.' USING ERRCODE='22023'; END IF;
  FOREACH v_token IN ARRAY ARRAY['mes_referencia','curso','matricula','parcelas','meses_pagamento','periodo'] LOOP
    v_remaining:=replace(v_remaining,'{{'||v_token||'}}','');
  END LOOP;
  IF position('{{' IN v_remaining)>0 OR position('}}' IN v_remaining)>0 THEN
    RAISE EXCEPTION 'Variável de descrição desconhecida. Selecione uma variável do catálogo.' USING ERRCODE='22023'; END IF;
END;
$function$;

CREATE FUNCTION private.nfse_service_period(p_start text,p_end text,p_required boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_start date; v_end date;
BEGIN
  IF p_start IS NULL AND p_end IS NULL AND NOT p_required THEN RETURN '{}'::jsonb; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    OR p_end !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Selecione a data inicial e final do período do serviço.' USING ERRCODE='22023'; END IF;
  v_start:=p_start::date; v_end:=p_end::date;
  IF to_char(v_start,'YYYY-MM-DD')<>p_start OR to_char(v_end,'YYYY-MM-DD')<>p_end OR v_end<v_start THEN
    RAISE EXCEPTION 'O período do serviço deve ter datas válidas e final igual ou posterior ao início.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('servicePeriodStart',p_start,'servicePeriodEnd',p_end);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'O período do serviço contém uma data inválida.' USING ERRCODE='22023';
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_service_period(text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.render_nfse_service_period(p_description text,p_start text,p_end text,p_required boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_period jsonb; v_result text;
BEGIN
  v_period:=private.nfse_service_period(p_start,p_end,p_required OR position('{{periodo}}' IN p_description)>0);
  v_result:=btrim(p_description);
  IF v_period<>'{}'::jsonb THEN
    v_result:=replace(v_result,'{{periodo}}',to_char(p_start::date,'DD/MM/YYYY')||' ATÉ '||to_char(p_end::date,'DD/MM/YYYY'));
  END IF;
  IF v_result IS NULL OR length(v_result) NOT BETWEEN 1 AND 2000
    OR position('{{' IN v_result)>0 OR position('}}' IN v_result)>0 THEN
    RAISE EXCEPTION 'Descrição do serviço vazia, acima de 2.000 caracteres ou com variável não preenchida.' USING ERRCODE='22023'; END IF;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION private.render_nfse_service_period(text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.normalize_nfse_partner_service(p_definition jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_partner uuid; v_model uuid; v_model_version integer; v_date date;
  v_amount numeric(14,2); v_description text; v_generate boolean;
  v_existing uuid; v_due date; v_category uuid;
BEGIN
  IF p_definition IS NULL OR jsonb_typeof(p_definition) <> 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_definition) k WHERE k NOT IN (
      'partnerId','modelId','modelVersion','serviceDate','serviceDescription','amount',
      'generateReceivable','existingReceivableId','dueDate','categoryId','servicePeriodStart','servicePeriodEnd')) THEN
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
    OR position('{{' IN replace(v_description,'{{periodo}}','')) > 0 OR position('}}' IN replace(v_description,'{{periodo}}','')) > 0
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
    'generateReceivable',v_generate,'existingReceivableId',v_existing,'dueDate',v_due,'categoryId',v_category)
    ||private.nfse_service_period(p_definition->>'servicePeriodStart',p_definition->>'servicePeriodEnd',
      position('{{periodo}}' IN v_description)>0);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format
  OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Dados do serviço inválidos.' USING ERRCODE = '22023';
END;
$function$;
CREATE OR REPLACE FUNCTION public.preview_nfse_model_description_secure(p_context_key uuid, p_polo_id uuid, p_environment text, p_month text, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
DECLARE v_result text; v_academic boolean;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  PERFORM private.validate_nfse_description_template(p_description);
  v_academic:=p_description LIKE '%{{curso}}%' OR p_description LIKE '%{{matricula}}%'
    OR p_description LIKE '%{{parcelas}}%' OR p_description LIKE '%{{meses_pagamento}}%';
  v_result:=replace(btrim(p_description),'{{mes_referencia}}',private.nfse_reference_month_label(p_month));
  v_result:=replace(replace(replace(replace(v_result,'{{curso}}','[curso da turma selecionada]'),
    '{{matricula}}','[matrícula vinculada ao recebimento]'),'{{parcelas}}','[parcelas ou taxas da origem, quando informadas]'),
    '{{meses_pagamento}}','[meses efetivos dos pagamentos; datas reais quando não houver parcela]');
  v_result:=replace(v_result,'{{periodo}}','[data inicial ATÉ data final, selecionadas no lançamento do serviço]');
  IF length(v_result)>2000 THEN
    RAISE EXCEPTION 'Prévia da descrição excede 2.000 caracteres.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('description',v_result,
      'monthLabel',private.nfse_reference_month_label(p_month),'usesReferenceMonth',p_description LIKE '%{{mes_referencia}}%',
      'requiresAcademicContext',v_academic));
END;
$function$;


-- Explicit ACLs preserve least privilege even on a fresh database.
REVOKE ALL ON FUNCTION private.validate_nfse_description_template(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.normalize_nfse_partner_service(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preview_nfse_model_description_secure(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_nfse_model_description_secure(uuid,uuid,text,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
