BEGIN;
-- U+2014 exceeds the current XML composer's deliberately narrow repertoire.
-- Change only generated separators; user facts, templates and old snapshots stay intact.
CREATE OR REPLACE FUNCTION private.render_nfse_academic_description(p_description text, p_context jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE v_result text; v_course text; v_enrollments text; v_installments text; v_months text;
  v_count integer; v_has_academic boolean; v_has_unidentified boolean; v_dates text; v_default constant text:=
    'REFERENTE AOS SERVIÇOS EDUCACIONAIS DO CURSO {{curso}}; MATRÍCULA(S): {{matricula}}; MENSALIDADE(S)/PARCELA(S): {{parcelas}}; PAGAMENTO(S) EFETUADO(S) EM {{meses_pagamento}}.';
BEGIN
  PERFORM private.validate_nfse_description_template(p_description);
  IF p_context->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p_context->'entries') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_context->'entries')=0 OR nullif(btrim(p_context->>'courseName'),'') IS NULL THEN
    RAISE EXCEPTION 'Curso e recebimentos acadêmicos estruturados são obrigatórios.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_context->'entries') e WHERE
      nullif(btrim(e->>'enrollmentNumber'),'') IS NULL
      OR coalesce(e->>'paymentDate','') !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$') THEN
    RAISE EXCEPTION 'Matrícula e data efetiva do pagamento são obrigatórias.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_context->'entries') e
    WHERE (e->>'paymentDate')::date::text IS DISTINCT FROM e->>'paymentDate') THEN
    RAISE EXCEPTION 'Data efetiva de pagamento inválida.' USING ERRCODE='22023'; END IF;
  v_has_unidentified:=EXISTS(SELECT 1 FROM jsonb_array_elements(p_context->'entries') e
    WHERE nullif(btrim(e->>'installmentLabel'),'') IS NULL);
  v_course:=btrim(p_context->>'courseName');
  SELECT string_agg(label,', ' ORDER BY first_row),count(*) INTO v_enrollments,v_count FROM (
    SELECT e->>'enrollmentNumber' label,min(n) first_row
    FROM jsonb_array_elements(p_context->'entries') WITH ORDINALITY r(e,n) GROUP BY 1) labels;
  SELECT string_agg(label,'; ' ORDER BY first_row) INTO v_installments FROM (
    SELECT (e->>'installmentLabel')||CASE WHEN v_count>1 THEN ' - matrícula '||(e->>'enrollmentNumber') ELSE '' END
      ||' (pagamento em '||private.nfse_reference_month_label(left(e->>'paymentDate',7))||')' label,min(n) first_row
    FROM jsonb_array_elements(p_context->'entries') WITH ORDINALITY r(e,n)
    WHERE nullif(btrim(e->>'installmentLabel'),'') IS NOT NULL GROUP BY 1) labels;
  SELECT string_agg(label,', ' ORDER BY first_row) INTO v_months FROM (
    SELECT private.nfse_reference_month_label(left(e->>'paymentDate',7)) label,min(n) first_row
    FROM jsonb_array_elements(p_context->'entries') WITH ORDINALITY r(e,n) GROUP BY 1) labels;
  v_has_academic:=p_description LIKE '%{{curso}}%' OR p_description LIKE '%{{matricula}}%'
    OR p_description LIKE '%{{parcelas}}%' OR p_description LIKE '%{{meses_pagamento}}%';
  IF v_has_academic AND NOT (p_description LIKE '%{{curso}}%' AND p_description LIKE '%{{matricula}}%'
    AND p_description LIKE '%{{meses_pagamento}}%'
    AND (v_installments IS NULL OR p_description LIKE '%{{parcelas}}%')) THEN
    RAISE EXCEPTION 'A descrição acadêmica deve incluir curso, matrícula e meses de pagamento, além das parcelas identificadas.' USING ERRCODE='22023'; END IF;
  -- Existing literal templates keep their text and gain the required facts only
  -- on new academic preparations. The stored model is never modified.
  v_result:=btrim(p_description)||CASE WHEN NOT v_has_academic THEN E'\n'||v_default ELSE '' END;
  IF v_installments IS NULL THEN
    -- Only the known canonical clause is omitted; custom literal text is kept.
    v_result:=replace(v_result,'MENSALIDADE(S)/PARCELA(S): {{parcelas}}; ','');
  END IF;
  v_result:=replace(replace(replace(replace(replace(v_result,'{{curso}}',v_course),
    '{{matricula}}',v_enrollments),'{{parcelas}}',coalesce(v_installments,'pagamentos identificados por matrícula e data')),'{{meses_pagamento}}',v_months),
    '{{mes_referencia}}',v_months);
  IF v_has_unidentified THEN
    SELECT string_agg(label,'; ' ORDER BY first_row) INTO v_dates FROM (
      SELECT 'matrícula '||(e->>'enrollmentNumber')||' - '||to_char((e->>'paymentDate')::date,'DD/MM/YYYY') label,
        min(n) first_row
      FROM jsonb_array_elements(p_context->'entries') WITH ORDINALITY r(e,n)
      WHERE nullif(btrim(e->>'installmentLabel'),'') IS NULL GROUP BY 1) labels;
    v_result:=v_result||' DATA(S) DE PAGAMENTO: '||v_dates||'.';
  END IF;
  IF length(v_result)>2000 OR position('{{' IN v_result)>0 OR position('}}' IN v_result)>0 THEN
    RAISE EXCEPTION 'Descrição acadêmica preenchida excede 2.000 caracteres ou contém variável não resolvida. Divida a seleção.' USING ERRCODE='22023'; END IF;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION private.render_nfse_academic_description(text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

