BEGIN;
-- User-approved formal fallback for unavailable legacy installment numbering.
-- No model, financial title, old snapshot, XML or ledger row is updated.
CREATE OR REPLACE FUNCTION private.nfse_academic_description_context(p_polo uuid, p_class uuid, p_student uuid, p_receipts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_course jsonb; v_entries jsonb; v_receipt jsonb; v_enrollment public.matriculas%ROWTYPE;
  v_source public.contas_receber%ROWTYPE; v_number text; v_label text; v_date date;
BEGIN
  IF jsonb_typeof(p_receipts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_receipts)=0 THEN
    RAISE EXCEPTION 'Selecione recebimentos acadêmicos vinculados.' USING ERRCODE='22023'; END IF;
  -- Academic edits are fenced while the context is captured. Financial source
  -- and event locks were acquired by prepare_nfse_batch_secure before this call.
  PERFORM 1 FROM public.turmas WHERE id=p_class AND polo_id=p_polo FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turma fora da unidade da preparação.' USING ERRCODE='40001'; END IF;
  PERFORM 1 FROM public.cursos WHERE id=(SELECT curso_id FROM public.turmas WHERE id=p_class) FOR SHARE;
  PERFORM 1 FROM public.matriculas WHERE id IN (SELECT (e->>'enrollmentId')::uuid
    FROM jsonb_array_elements(p_receipts) e) ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.documentos_templates WHERE id='academicos_config' FOR SHARE;
  SELECT jsonb_build_object('version',1,'classId',t.id,'classLabel',concat_ws(' · ',t.codigo,t.nome),
    'courseId',c.id,'courseName',nullif(btrim(c.nome),''),'courseType',upper(btrim(c.modalidade))) INTO v_course
    FROM public.turmas t JOIN public.cursos c ON c.id=t.curso_id WHERE t.id=p_class AND t.polo_id=p_polo;
  IF nullif(v_course->>'courseName','') IS NULL OR nullif(v_course->>'courseType','') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome e a modalidade reais do curso da turma selecionada.' USING ERRCODE='22023'; END IF;
  v_entries:='[]';
  FOR v_receipt IN SELECT value FROM jsonb_array_elements(p_receipts) ORDER BY value->>'receiptId' LOOP
    SELECT * INTO v_enrollment FROM public.matriculas WHERE id=(v_receipt->>'enrollmentId')::uuid
      AND turma_id=p_class AND aluno_id=p_student;
    IF NOT FOUND OR v_enrollment.data_matricula IS NULL THEN
      RAISE EXCEPTION 'Recebimento %: confira a matrícula e a data de matrícula da turma selecionada.',
        v_receipt->>'receiptId' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_source FROM public.contas_receber WHERE id=(v_receipt->>'sourceReceivableId')::uuid
      AND polo_id=p_polo AND matricula_id=v_enrollment.id
      AND (turma_id IS NULL OR turma_id=p_class);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Recebimento %: o título não pertence à matrícula e à turma selecionadas.',
        v_receipt->>'receiptId' USING ERRCODE='40001'; END IF;
    -- No installment number is ever parsed from free-text descriptions.
    v_label:=CASE WHEN upper(btrim(v_source.tipo_lancamento))='MATRICULA' THEN 'taxa de matrícula'
      WHEN upper(btrim(v_source.tipo_lancamento))='REMATRICULA' THEN 'taxa de rematrícula'
      WHEN v_source.parcela_numero>0 THEN 'nº '||v_source.parcela_numero::text ELSE NULL END;
    -- Missing legacy numbering stays NULL. Course, enrollment and actual
    -- payment date remain mandatory; no ordinal is inferred from free text.
    IF coalesce(v_receipt->>'paymentDate','') !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Recebimento %: a data efetiva do pagamento é obrigatória.',
        v_receipt->>'receiptId' USING ERRCODE='22023'; END IF;
    v_date:=(v_receipt->>'paymentDate')::date;
    IF v_date::text IS DISTINCT FROM v_receipt->>'paymentDate' THEN
      RAISE EXCEPTION 'Data de pagamento inválida.' USING ERRCODE='22023'; END IF;
    v_number:=public.formatar_matricula_validacao(v_enrollment.id,v_enrollment.data_matricula,p_polo);
    IF nullif(btrim(v_number),'') IS NULL THEN
      RAISE EXCEPTION 'Não foi possível obter o número da matrícula selecionada.' USING ERRCODE='22023'; END IF;
    v_entries:=v_entries||jsonb_build_array(jsonb_build_object('receiptId',v_receipt->>'receiptId',
      'sourceReceivableId',v_source.id,'enrollmentId',v_enrollment.id,'enrollmentNumber',v_number,
      'enrollmentDate',v_enrollment.data_matricula,
      'installmentNumber',v_source.parcela_numero,'installmentType',v_source.tipo_lancamento,
      'installmentLabel',v_label,'paymentDate',v_date::text));
  END LOOP;
  RETURN v_course||jsonb_build_object('entries',v_entries);
END;
$function$;

REVOKE ALL ON FUNCTION private.nfse_academic_description_context(uuid,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

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
    SELECT (e->>'installmentLabel')||CASE WHEN v_count>1 THEN ' — matrícula '||(e->>'enrollmentNumber') ELSE '' END
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
      SELECT 'matrícula '||(e->>'enrollmentNumber')||' — '||to_char((e->>'paymentDate')::date,'DD/MM/YYYY') label,
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

-- The pre-preparation preview is illustrative, never a promise of legacy numbering.
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
    '{{matricula}}','[matrícula vinculada ao recebimento]'),'{{parcelas}}','[parcelas ou taxas da origem, quando informadas]'),
    '{{meses_pagamento}}','[meses efetivos dos pagamentos; datas reais quando não houver parcela]');
  IF length(v_result)>2000 THEN
    RAISE EXCEPTION 'Prévia da descrição excede 2.000 caracteres.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('description',v_result,
      'monthLabel',private.nfse_reference_month_label(p_month),'usesReferenceMonth',p_description LIKE '%{{mes_referencia}}%',
      'requiresAcademicContext',v_academic));
END;
$function$;
REVOKE ALL ON FUNCTION public.preview_nfse_model_description_secure(uuid,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_nfse_model_description_secure(uuid,uuid,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

