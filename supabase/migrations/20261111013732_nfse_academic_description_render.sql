BEGIN;

-- Template syntax is literal and bounded. Values are supplied only by the
-- selected academic receipt snapshot; no expressions or arbitrary lookup.
CREATE FUNCTION private.validate_nfse_description_template(p_description text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_remaining text:=p_description; v_token text;
BEGIN
  IF p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'A descrição deve conter de 1 a 2.000 caracteres.' USING ERRCODE='22023'; END IF;
  FOREACH v_token IN ARRAY ARRAY['mes_referencia','curso','matricula','parcelas','meses_pagamento'] LOOP
    v_remaining:=replace(v_remaining,'{{'||v_token||'}}','');
  END LOOP;
  IF position('{{' IN v_remaining)>0 OR position('}}' IN v_remaining)>0 THEN
    RAISE EXCEPTION 'Variável de descrição desconhecida. Selecione uma variável do catálogo.' USING ERRCODE='22023'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.validate_nfse_description_template(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.validate_nfse_model_description()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  PERFORM private.validate_nfse_description_template(NEW.definition->>'serviceDescription');
  RETURN NEW;
END;
$function$;

CREATE FUNCTION private.render_nfse_academic_description(p_description text,p_context jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_result text; v_course text; v_enrollments text; v_installments text; v_months text;
  v_count integer; v_has_academic boolean; v_default constant text:=
    'REFERENTE AOS SERVIÇOS EDUCACIONAIS DO CURSO {{curso}}; MATRÍCULA(S): {{matricula}}; MENSALIDADE(S)/PARCELA(S): {{parcelas}}; PAGAMENTO(S) EFETUADO(S) EM {{meses_pagamento}}.';
BEGIN
  PERFORM private.validate_nfse_description_template(p_description);
  IF p_context->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p_context->'entries') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_context->'entries')=0 OR nullif(btrim(p_context->>'courseName'),'') IS NULL THEN
    RAISE EXCEPTION 'Curso e recebimentos acadêmicos estruturados são obrigatórios.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_context->'entries') e WHERE
      nullif(btrim(e->>'enrollmentNumber'),'') IS NULL OR nullif(e->>'installmentLabel','') IS NULL
      OR coalesce(e->>'paymentDate','') !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$') THEN
    RAISE EXCEPTION 'Matrícula, parcela e data efetiva do pagamento são obrigatórias.' USING ERRCODE='22023'; END IF;
  v_course:=btrim(p_context->>'courseName');
  SELECT string_agg(label,', ' ORDER BY first_row),count(*) INTO v_enrollments,v_count FROM (
    SELECT e->>'enrollmentNumber' label,min(n) first_row
    FROM jsonb_array_elements(p_context->'entries') WITH ORDINALITY r(e,n) GROUP BY 1) labels;
  SELECT string_agg(label,'; ' ORDER BY first_row) INTO v_installments FROM (
    SELECT (e->>'installmentLabel')||CASE WHEN v_count>1 THEN ' — matrícula '||(e->>'enrollmentNumber') ELSE '' END
      ||' (pagamento em '||private.nfse_reference_month_label(left(e->>'paymentDate',7))||')' label,min(n) first_row
    FROM jsonb_array_elements(p_context->'entries') WITH ORDINALITY r(e,n) GROUP BY 1) labels;
  SELECT string_agg(label,', ' ORDER BY first_row) INTO v_months FROM (
    SELECT private.nfse_reference_month_label(left(e->>'paymentDate',7)) label,min(n) first_row
    FROM jsonb_array_elements(p_context->'entries') WITH ORDINALITY r(e,n) GROUP BY 1) labels;
  v_has_academic:=p_description LIKE '%{{curso}}%' OR p_description LIKE '%{{matricula}}%'
    OR p_description LIKE '%{{parcelas}}%' OR p_description LIKE '%{{meses_pagamento}}%';
  IF v_has_academic AND NOT (p_description LIKE '%{{curso}}%' AND p_description LIKE '%{{matricula}}%'
    AND p_description LIKE '%{{parcelas}}%' AND p_description LIKE '%{{meses_pagamento}}%') THEN
    RAISE EXCEPTION 'A descrição acadêmica deve incluir curso, matrícula, parcelas e meses de pagamento.' USING ERRCODE='22023'; END IF;
  -- Existing literal templates keep their text and gain the required facts only
  -- on new academic preparations. The stored model is never modified.
  v_result:=btrim(p_description)||CASE WHEN NOT v_has_academic THEN E'\n'||v_default ELSE '' END;
  v_result:=replace(replace(replace(replace(replace(v_result,'{{curso}}',v_course),
    '{{matricula}}',v_enrollments),'{{parcelas}}',v_installments),'{{meses_pagamento}}',v_months),
    '{{mes_referencia}}',v_months);
  IF length(v_result)>2000 OR position('{{' IN v_result)>0 OR position('}}' IN v_result)>0 THEN
    RAISE EXCEPTION 'Descrição acadêmica preenchida excede 2.000 caracteres ou contém variável não resolvida. Divida a seleção.' USING ERRCODE='22023'; END IF;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION private.render_nfse_academic_description(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_queue_description(p_snapshot jsonb,p_template text,p_payment_month text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
BEGIN
  IF p_snapshot#>'{academic,descriptionContext,version}'='1'::jsonb THEN
    RETURN private.render_nfse_academic_description(p_template,p_snapshot#>'{academic,descriptionContext}');
  END IF;
  -- Historical preparations keep the previous rendering contract and bytes.
  RETURN private.render_nfse_model_description(p_template,p_payment_month);
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_queue_description(jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.preview_nfse_model_description_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_description text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
DECLARE v_result text; v_academic boolean;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  PERFORM private.validate_nfse_description_template(p_description);
  v_academic:=p_description LIKE '%{{curso}}%' OR p_description LIKE '%{{matricula}}%'
    OR p_description LIKE '%{{parcelas}}%' OR p_description LIKE '%{{meses_pagamento}}%';
  v_result:=replace(btrim(p_description),'{{mes_referencia}}',private.nfse_reference_month_label(p_month));
  v_result:=replace(replace(replace(replace(v_result,'{{curso}}','[curso da turma selecionada]'),
    '{{matricula}}','[matrícula vinculada ao recebimento]'),'{{parcelas}}','[parcelas dos recebimentos selecionados]'),
    '{{meses_pagamento}}','[meses efetivos dos pagamentos]');
  IF length(v_result)>2000 THEN
    RAISE EXCEPTION 'Prévia da descrição excede 2.000 caracteres.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('description',v_result,
      'monthLabel',private.nfse_reference_month_label(p_month),'usesReferenceMonth',p_description LIKE '%{{mes_referencia}}%',
      'requiresAcademicContext',v_academic));
END;
$function$;
REVOKE ALL ON FUNCTION public.preview_nfse_model_description_secure(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_nfse_model_description_secure(uuid,uuid,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
