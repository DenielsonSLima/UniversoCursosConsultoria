BEGIN;

CREATE FUNCTION internal_proesc.v2_stage_invoice(
  p_task internal_proesc.v2_tasks,p_row jsonb,p_observed timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_key text; v_due date;
BEGIN
  IF jsonb_typeof(p_row) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_row) k WHERE k NOT IN
      ('invoiceId','personId','sourceEnrollmentId','sourceClassId','personHash','unitId','dueDate',
       'principalCents','paidCents','paymentDate','sourceStatus','groupId','order','groupTotal',
       'financialConfiguration','reviewReasons'))
    OR NOT coalesce(p_row->>'invoiceId' ~ '^[1-9][0-9]{0,17}$',false)
    OR p_row->>'unitId' IS DISTINCT FROM p_task.unit_id
    OR NOT coalesce(p_row->>'sourceStatus' IN ('PAGA','VENCIDO','EM ABERTO','PAGAMENTO PARCIAL','PAGAMENTO SUPERIOR','UNKNOWN'),false)
    OR jsonb_typeof(p_row->'reviewReasons') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_row->'reviewReasons')>30
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_row->'reviewReasons') r
      WHERE jsonb_typeof(r)<>'string' OR r#>>'{}' !~ '^[A-Z_]{1,80}$') THEN
    RAISE EXCEPTION 'Observação V2 inválida.' USING ERRCODE='22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['personId','sourceEnrollmentId','sourceClassId','groupId'] LOOP
    IF p_row->v_key IS NOT NULL AND p_row->v_key<>'null'::jsonb
      AND NOT coalesce(p_row->>v_key ~ '^[1-9][0-9]{0,17}$',false) THEN
      RAISE EXCEPTION 'Identificador V2 inválido.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['order','groupTotal'] LOOP
    IF p_row->v_key IS NOT NULL AND p_row->v_key<>'null'::jsonb
      AND (jsonb_typeof(p_row->v_key)<>'number' OR p_row->>v_key !~ '^[0-9]{1,5}$') THEN
      RAISE EXCEPTION 'Posição ou total de grupo V2 inválido.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['principalCents','paidCents'] LOOP
    IF p_row->v_key IS NOT NULL AND p_row->v_key<>'null'::jsonb
      AND (jsonb_typeof(p_row->v_key)<>'number' OR p_row->>v_key !~ '^[0-9]{1,14}$') THEN
      RAISE EXCEPTION 'Montante V2 inválido.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF p_row->'personHash' IS NOT NULL AND p_row->'personHash'<>'null'::jsonb
    AND NOT coalesce(p_row->>'personHash' ~ '^[0-9a-f]{64}$',false) THEN
    RAISE EXCEPTION 'Identidade V2 inválida.' USING ERRCODE='22023';
  END IF;
  IF p_row->>'dueDate' IS NOT NULL THEN
    v_due:=(p_row->>'dueDate')::date;
    IF NOT isfinite(v_due) OR extract(year FROM v_due)<>p_task.source_year
      OR extract(month FROM v_due)<>p_task.source_month THEN
      RAISE EXCEPTION 'Vencimento fora do período consultado.' USING ERRCODE='22023';
    END IF;
  END IF;
  IF p_row->>'paymentDate' IS NOT NULL AND NOT isfinite((p_row->>'paymentDate')::date) THEN
    RAISE EXCEPTION 'Data de pagamento inválida.' USING ERRCODE='22023';
  END IF;
  -- Only configuration numbers are retained, never an arbitrary provider object.
  IF p_row->'financialConfiguration' IS NOT NULL AND p_row->'financialConfiguration'<>'null'::jsonb
    AND (jsonb_typeof(p_row->'financialConfiguration')<>'object'
      OR EXISTS(SELECT 1 FROM jsonb_each(p_row->'financialConfiguration') e
        WHERE e.key NOT IN ('fixedDiscountCents','earlyDiscountCents','earlyDiscountPercentage','fineRate','interestRate')
          OR (e.value<>'null'::jsonb AND (jsonb_typeof(e.value) NOT IN ('number','string')
            OR e.value#>>'{}' !~ '^[0-9]{1,14}(\.[0-9]{1,10})?$')))) THEN
    RAISE EXCEPTION 'Configuração financeira V2 inválida.' USING ERRCODE='22023';
  END IF;
  INSERT INTO internal_proesc.v2_invoice_observations(run_id,task_id,unit_id,invoice_id,
    source_status,normalized,result,observed_at)
  VALUES(p_task.run_id,p_task.id,p_task.unit_id,p_row->>'invoiceId',p_row->>'sourceStatus',p_row,'STAGED',p_observed);
  -- Unique(run,unit,invoice) rejects duplicates across pages AND periods.
END;
$function$;

CREATE FUNCTION internal_proesc.v2_observe_person(
  p_task internal_proesc.v2_tasks,p_row jsonb,p_observed timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_enrollment jsonb; v_local uuid; v_count integer; v_matched integer:=0; v_review integer:=0;
  v_previous internal_proesc.v2_enrollment_links;
BEGIN
  IF jsonb_typeof(p_row) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_row) k WHERE k NOT IN ('personId','personHash','enrollments'))
    OR NOT coalesce(p_row->>'personId' ~ '^[1-9][0-9]{0,17}$',false)
    OR (p_row->>'personHash' IS NOT NULL AND p_row->>'personHash' !~ '^[0-9a-f]{64}$')
    OR jsonb_typeof(p_row->'enrollments') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_row->'enrollments')>100 THEN
    RAISE EXCEPTION 'Pessoa V2 inválida.' USING ERRCODE='22023';
  END IF;
  FOR v_enrollment IN SELECT value FROM jsonb_array_elements(p_row->'enrollments') LOOP
    IF jsonb_typeof(v_enrollment)<>'object'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_enrollment) k
        WHERE k NOT IN ('sourceEnrollmentId','sourceClassId'))
      OR NOT coalesce(v_enrollment->>'sourceEnrollmentId' ~ '^[1-9][0-9]{0,17}$',false)
      OR NOT coalesce(v_enrollment->>'sourceClassId' ~ '^[1-9][0-9]{0,17}$',false) THEN
      RAISE EXCEPTION 'Matrícula V2 inválida.' USING ERRCODE='22023';
    END IF;
    SELECT count(*),(array_agg(m.id))[1] INTO v_count,v_local
    FROM public.matriculas m JOIN internal_proesc.class_scopes s ON s.turma_id=m.turma_id
    WHERE s.phase='CONFIRMED' AND s.source_unit_id=p_task.unit_id
      AND s.source_class_id=v_enrollment->>'sourceClassId'
      AND internal_proesc.person_document_hash(m.aluno_id)=p_row->>'personHash';
    IF v_count<>1 THEN v_review:=v_review+1; CONTINUE; END IF;
    SELECT * INTO v_previous FROM internal_proesc.v2_enrollment_links
      WHERE matricula_id=v_local OR (unit_id=p_task.unit_id
        AND source_enrollment_id=v_enrollment->>'sourceEnrollmentId') LIMIT 1;
    IF FOUND THEN
      IF v_previous.matricula_id<>v_local OR v_previous.unit_id<>p_task.unit_id
        OR v_previous.source_enrollment_id<>v_enrollment->>'sourceEnrollmentId'
        OR v_previous.source_person_id<>p_row->>'personId'
        OR v_previous.source_class_id<>v_enrollment->>'sourceClassId'
        OR v_previous.person_hash<>p_row->>'personHash' THEN
        v_review:=v_review+1; CONTINUE;
      END IF;
      UPDATE internal_proesc.v2_enrollment_links SET last_observed_at=greatest(last_observed_at,p_observed)
        WHERE matricula_id=v_local;
    ELSE
      INSERT INTO internal_proesc.v2_enrollment_links(unit_id,source_enrollment_id,source_person_id,
        source_class_id,person_hash,matricula_id,first_run_id,first_observed_at,last_observed_at)
      VALUES(p_task.unit_id,v_enrollment->>'sourceEnrollmentId',p_row->>'personId',
        v_enrollment->>'sourceClassId',p_row->>'personHash',v_local,p_task.run_id,p_observed,p_observed);
    END IF;
    v_matched:=v_matched+1;
  END LOOP;
  INSERT INTO internal_proesc.v2_people_observations(run_id,task_id,unit_id,person_id,person_hash,
    enrollments,matched,review,observed_at)
  VALUES(p_task.run_id,p_task.id,p_task.unit_id,p_row->>'personId',p_row->>'personHash',
    p_row->'enrollments',v_matched,v_review,p_observed);
  -- No inferred academic status, contact overwrite or cycle classification.
  RETURN jsonb_build_object('matched',v_matched,'review',v_review);
END;
$function$;
REVOKE ALL ON FUNCTION
  internal_proesc.v2_stage_invoice(internal_proesc.v2_tasks,jsonb,timestamptz),
  internal_proesc.v2_observe_person(internal_proesc.v2_tasks,jsonb,timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
