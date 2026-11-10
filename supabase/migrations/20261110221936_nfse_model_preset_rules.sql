BEGIN;

CREATE FUNCTION private.nfse_preset_object(p_value jsonb,p_fields text[])
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR NOT(p_value ?& p_fields)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) f(key) WHERE NOT(key=ANY(p_fields))) THEN
    RAISE EXCEPTION 'Objeto de pré-modelo inválido ou com campos desconhecidos.' USING ERRCODE='22023'; END IF;
END;
$function$;

CREATE FUNCTION private.nfse_preset_choice(p_value jsonb,p_choices text[],p_nullable boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_text text:=p_value#>>'{}';
BEGIN
  IF p_nullable AND p_value='null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR NOT(v_text=ANY(p_choices)) THEN
    RAISE EXCEPTION 'Opção de pré-modelo inválida.' USING ERRCODE='22023'; END IF;
  RETURN v_text;
END;
$function$;

CREATE FUNCTION private.nfse_preset_text(p_value jsonb,p_max integer,p_nullable boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_text text:=p_value#>>'{}';
BEGIN
  IF p_nullable AND p_value='null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR nullif(btrim(v_text),'') IS NULL
    OR length(v_text)>p_max THEN
    RAISE EXCEPTION 'Texto de pré-modelo inválido.' USING ERRCODE='22023'; END IF;
  RETURN v_text;
END;
$function$;

CREATE FUNCTION private.nfse_preset_code(p_value jsonb,p_pattern text,p_nullable boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_text text:=p_value#>>'{}';
BEGIN
  IF p_nullable AND p_value='null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR v_text !~ p_pattern THEN
    RAISE EXCEPTION 'Código de pré-modelo inválido.' USING ERRCODE='22023'; END IF;
  RETURN v_text;
END;
$function$;

CREATE FUNCTION private.nfse_preset_decimal(p_value jsonb,p_percent boolean DEFAULT false,p_nullable boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_text text:=p_value#>>'{}'; v_number numeric;
BEGIN
  IF p_nullable AND p_value='null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR v_text !~ '^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'Use decimal canônico no pré-modelo.' USING ERRCODE='22023'; END IF;
  v_number:=v_text::numeric;
  IF p_percent AND v_number>100 THEN
    RAISE EXCEPTION 'Percentual fora do intervalo permitido.' USING ERRCODE='22023'; END IF;
  RETURN v_number;
END;
$function$;

CREATE FUNCTION private.nfse_preset_date(p_value jsonb)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_text text; v_date date;
BEGIN
  v_text:=private.nfse_preset_code(p_value,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
  v_date:=v_text::date;
  IF to_char(v_date,'YYYY-MM-DD')<>v_text THEN
    RAISE EXCEPTION 'Data de pré-modelo inválida.' USING ERRCODE='22023'; END IF;
  RETURN v_date;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'Data de pré-modelo inválida.' USING ERRCODE='22023';
END;
$function$;

-- A null return means either an inactive rule or a rule deliberately deferred
-- to the individual document. FIXED is always non-null and typed by its caller.
CREATE FUNCTION private.nfse_preset_rule_value(p_rule jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_source text;
BEGIN
  IF p_rule='null'::jsonb THEN RETURN NULL; END IF;
  PERFORM private.nfse_preset_object(p_rule,ARRAY['source','value']);
  v_source:=private.nfse_preset_choice(p_rule->'source',ARRAY['FIXED','AT_ISSUANCE']);
  IF v_source='AT_ISSUANCE' THEN
    IF p_rule->'value'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Regra definida na emissão não armazena valor concreto.' USING ERRCODE='22023'; END IF;
    RETURN NULL;
  END IF;
  IF p_rule->'value'='null'::jsonb THEN
    RAISE EXCEPTION 'Regra fixa exige valor explícito.' USING ERRCODE='22023'; END IF;
  RETURN p_rule->'value';
END;
$function$;

CREATE FUNCTION private.nfse_preset_partner(p_value jsonb,p_polo_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_id uuid;
BEGIN
  v_id:=private.nfse_preset_code(p_value,'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')::uuid;
  IF private.nfse_model_partner_label(p_polo_id,v_id) IS NULL THEN
    RAISE EXCEPTION 'Parceiro indisponível neste polo.' USING ERRCODE='22023'; END IF;
  RETURN v_id;
END;
$function$;

CREATE FUNCTION private.nfse_preset_context(p_definition jsonb,p_polo_id uuid,p_environment text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_config jsonb; v_option text; v_option_rule text; v_assessment text; v_competence date;
BEGIN
  SELECT definition INTO v_config FROM private.nfse_configurations
    WHERE polo_id=p_polo_id AND environment=p_environment;
  v_option_rule:=p_definition#>>'{peopleOptions,simpleNationalOption}'; v_option:=v_option_rule;
  IF v_option IS NULL OR v_option='FROM_ESTABLISHMENT' THEN v_option:=v_config->>'opSimpNac'; END IF;
  IF v_option='3' THEN
    v_assessment:=p_definition#>>'{peopleOptions,simpleNationalAssessment}';
    IF v_assessment='FROM_ESTABLISHMENT' OR (v_assessment IS NULL AND
      (v_option_rule IS NULL OR v_option_rule='FROM_ESTABLISHMENT')) THEN
      v_assessment:=v_config->>'regApTribSN'; END IF;
  END IF;
  v_competence:=CASE WHEN p_definition#>>'{peopleOptions,competenceMode}'='FIXED_DATE'
    THEN private.nfse_preset_date(p_definition#>'{peopleOptions,competenceDate}')
    ELSE (now() AT TIME ZONE 'America/Maceio')::date END;
  RETURN jsonb_build_object('simpleNationalOption',v_option,'simpleNationalAssessment',v_assessment,
    'competenceDate',v_competence,'environment',p_environment);
END;
$function$;

REVOKE ALL ON FUNCTION private.nfse_preset_object(jsonb,text[]),
  private.nfse_preset_choice(jsonb,text[],boolean),private.nfse_preset_text(jsonb,integer,boolean),
  private.nfse_preset_code(jsonb,text,boolean),private.nfse_preset_decimal(jsonb,boolean,boolean),
  private.nfse_preset_date(jsonb),private.nfse_preset_rule_value(jsonb),
  private.nfse_preset_partner(jsonb,uuid),private.nfse_preset_context(jsonb,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
