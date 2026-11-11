BEGIN;

CREATE FUNCTION private.nfse_academic_description_context(
  p_polo uuid,p_class uuid,p_student uuid,p_receipts jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $function$
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
    IF v_label IS NULL THEN
      RAISE EXCEPTION 'Recebimento %: informe a parcela ou o tipo de taxa no lançamento financeiro.',
        v_receipt->>'receiptId' USING ERRCODE='22023'; END IF;
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
COMMIT;
