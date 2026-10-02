BEGIN;

CREATE FUNCTION internal_proesc.v2_apply_invoice(p_actor_id uuid,p_observation_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
DECLARE
  v_observation internal_proesc.v2_invoice_observations;
  v_row jsonb;
  v_link internal_proesc.obligation_links;
  v_receivable public.contas_receber;
  v_previous internal_proesc.financial_snapshots;
  v_pin internal_proesc.v2_enrollment_links;
  v_count integer;
  v_reason text;
  v_result text:='REVIEW';
  v_status text;
  v_verification text;
  v_kind text;
  v_snapshot uuid;
  v_paid bigint;
  v_payment date;
  v_request uuid:=gen_random_uuid();
  v_before text;
  v_response jsonb;
  v_people_run uuid;
BEGIN
  PERFORM internal_proesc.authorize_financial_operator(p_actor_id);
  SELECT * INTO STRICT v_observation FROM internal_proesc.v2_invoice_observations
    WHERE id=p_observation_id FOR UPDATE;
  IF v_observation.result<>'STAGED' THEN RETURN v_observation.result; END IF;
  v_row:=v_observation.normalized;
  SELECT count(*) INTO v_count FROM internal_proesc.obligation_links
    WHERE source_unit_id=v_observation.unit_id AND source_key=v_observation.invoice_id;
  IF v_count<>1 THEN
    UPDATE internal_proesc.v2_invoice_observations SET result=CASE WHEN v_count=0 THEN 'UNLINKED' ELSE 'REVIEW' END,
      reason=CASE WHEN v_count=0 THEN 'SOURCE_OBLIGATION_NOT_LINKED' ELSE 'AMBIGUOUS_SOURCE_KEY' END
      WHERE id=p_observation_id;
    RETURN CASE WHEN v_count=0 THEN 'UNLINKED' ELSE 'REVIEW' END;
  END IF;
  SELECT * INTO STRICT v_link FROM internal_proesc.obligation_links
    WHERE source_unit_id=v_observation.unit_id AND source_key=v_observation.invoice_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('technical-manual-cycle-enrollment:'||v_link.matricula_id::text,0));
  PERFORM 1 FROM public.turmas WHERE id=v_link.turma_id FOR UPDATE;
  PERFORM 1 FROM public.matriculas WHERE id=v_link.matricula_id FOR UPDATE;
  SELECT * INTO STRICT v_link FROM internal_proesc.obligation_links WHERE id=v_link.id FOR UPDATE;
  SELECT * INTO STRICT v_receivable FROM public.contas_receber WHERE id=v_link.receivable_id FOR UPDATE;
  -- All historical, scope, gateway and native-cycle barriers remain canonical.
  PERFORM internal_proesc.assert_historical_receivable(v_receivable);
  SELECT * INTO v_previous FROM internal_proesc.financial_snapshots WHERE link_id=v_link.id
    ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1;
  SELECT * INTO v_pin FROM internal_proesc.v2_enrollment_links WHERE matricula_id=v_link.matricula_id;
  SELECT id INTO v_people_run FROM internal_proesc.v2_runs
    WHERE mode='FULL' AND (id=v_observation.run_id OR status='COMPLETE')
    ORDER BY (id=v_observation.run_id) DESC,created_at DESC LIMIT 1;
  v_paid:=(v_row->>'paidCents')::bigint;
  v_payment:=(v_row->>'paymentDate')::date;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_row->'reviewReasons') reason
    WHERE reason NOT IN ('PARTIAL_PAYMENT_REQUIRES_REVIEW','OVERPAYMENT_REQUIRES_REVIEW'))
    THEN v_reason:='INCOMPLETE_SOURCE_FIELDS';
  ELSIF v_link.source_class_id IS DISTINCT FROM v_row->>'sourceClassId'
    OR internal_proesc.person_document_hash(v_receivable.cliente_id) IS DISTINCT FROM v_row->>'personHash'
    OR v_row->>'personHash' IS NULL OR v_row->>'sourceEnrollmentId' IS NULL OR v_row->>'personId' IS NULL
    OR round(v_receivable.valor*100)::bigint IS DISTINCT FROM (v_row->>'principalCents')::bigint
    OR v_receivable.data_vencimento IS DISTINCT FROM (v_row->>'dueDate')::date THEN
    v_reason:='SOURCE_IDENTITY_MISMATCH';
  ELSIF v_pin.matricula_id IS NULL THEN v_reason:='V2_ENROLLMENT_NOT_CONFIRMED';
  ELSIF v_pin.unit_id<>v_observation.unit_id OR v_pin.source_enrollment_id<>v_row->>'sourceEnrollmentId'
    OR v_pin.source_person_id<>v_row->>'personId' OR v_pin.source_class_id<>v_row->>'sourceClassId'
    OR v_pin.person_hash<>v_row->>'personHash' THEN v_reason:='V2_ENROLLMENT_MISMATCH';
  ELSIF (SELECT count(DISTINCT (p.person_id,e->>'sourceEnrollmentId'))
    FROM internal_proesc.v2_people_observations p CROSS JOIN LATERAL jsonb_array_elements(p.enrollments) e
    WHERE p.run_id=v_people_run AND p.unit_id=v_observation.unit_id AND p.person_hash=v_row->>'personHash'
      AND e->>'sourceClassId'=v_row->>'sourceClassId')<>1 THEN
    v_reason:='AMBIGUOUS_REMOTE_ENROLLMENT';
  ELSIF v_previous.observed_at>v_observation.observed_at THEN v_reason:='STALE_SOURCE_OBSERVATION';
  ELSIF v_receivable.status='CANCELADO' OR v_previous.source_status='CANCELED'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v_previous.accounting_lines,'[]'::jsonb)) line
      WHERE line->>'cancelled'='true' OR line->>'renegotiation'='true') THEN
    v_reason:='EXISTING_CANCELLATION_REQUIRES_REVIEW';
  ELSIF EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots historical
    WHERE historical.link_id=v_link.id AND (historical.source_status='CANCELED'
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(historical.accounting_lines) line
        WHERE line->>'cancelled'='true' OR line->>'renegotiation'='true'))) THEN
    v_reason:='HISTORICAL_CANCELLATION_REQUIRES_REVIEW';
  END IF;
  IF v_reason IS NOT NULL THEN
    UPDATE internal_proesc.v2_invoice_observations SET link_id=v_link.id,result='REVIEW',reason=v_reason
      WHERE id=p_observation_id;
    RETURN 'REVIEW';
  END IF;
  -- The provider's partial/superior labels do not establish an outstanding balance.
  -- Preserve a previously proved equal payment, including its explicit components.
  IF v_observation.source_status IN ('PAGA','PAGAMENTO PARCIAL','PAGAMENTO SUPERIOR')
    AND v_receivable.status='PAGO' AND v_paid>0 AND v_payment IS NOT NULL
    AND round(v_receivable.valor_pago*100)::bigint=v_paid AND v_receivable.data_pagamento=v_payment
    AND v_previous.verification='VERIFIED' AND v_previous.source_status='PAID'
    AND v_previous.principal_cents=round(v_receivable.valor*100)::bigint
    AND v_previous.received_cents=v_paid AND v_previous.payment_date=v_payment THEN
    UPDATE internal_proesc.v2_invoice_observations SET link_id=v_link.id,snapshot_id=v_previous.id,
      result='PRESERVED',reason='EXISTING_EXACT_PAYMENT_PRESERVED' WHERE id=p_observation_id;
    RETURN 'PRESERVED';
  END IF;
  IF NOT v_link.auto_enabled THEN
    UPDATE internal_proesc.v2_invoice_observations SET link_id=v_link.id,result='REVIEW',reason='LINK_AUTOMATION_DISABLED'
      WHERE id=p_observation_id;
    RETURN 'REVIEW';
  END IF;
  IF v_receivable.status='PAGO' AND (v_observation.source_status<>'PAGA'
    OR round(v_receivable.valor_pago*100)::bigint IS DISTINCT FROM v_paid
    OR v_receivable.data_pagamento IS DISTINCT FROM v_payment) THEN
    UPDATE internal_proesc.v2_invoice_observations SET link_id=v_link.id,result='REVIEW',reason='EXISTING_PAYMENT_DIFFERS'
      WHERE id=p_observation_id;
    RETURN 'REVIEW';
  END IF;
  IF v_observation.source_status='PAGA' AND v_paid>0 AND v_payment IS NOT NULL
    AND v_payment<=(now() AT TIME ZONE 'America/Maceio')::date THEN
    v_status:='PAID'; v_verification:='VERIFIED'; v_kind:='API_V2_INVOICE_PAID';
  ELSIF v_observation.source_status IN ('VENCIDO','EM ABERTO') AND v_paid=0 AND v_payment IS NULL
    AND v_receivable.status IN ('PENDENTE','VENCIDO')
    AND coalesce(v_receivable.valor_pago,0)=0 AND v_receivable.data_pagamento IS NULL THEN
    v_status:='OPEN'; v_verification:='VERIFIED'; v_kind:='API_V2_INVOICE_OPEN';
    v_paid:=NULL; v_result:='OPEN_CONFIRMED';
  ELSE
    v_reason:=CASE WHEN v_observation.source_status IN ('PAGAMENTO PARCIAL','PAGAMENTO SUPERIOR')
      THEN 'PROVIDER_PAYMENT_STATUS_REQUIRES_REVIEW' ELSE 'SOURCE_STATE_REQUIRES_REVIEW' END;
    -- Preserve local proved payments; a new ambiguous label cannot reopen them.
    IF v_receivable.status='PAGO' THEN
      UPDATE internal_proesc.v2_invoice_observations SET link_id=v_link.id,result='REVIEW',reason=v_reason
        WHERE id=p_observation_id;
      RETURN 'REVIEW';
    END IF;
    v_status:='UNKNOWN'; v_verification:='REVIEW'; v_kind:='API_V2_INVOICE_REVIEW';
  END IF;
  v_snapshot:=gen_random_uuid();
  INSERT INTO internal_proesc.financial_snapshots(id,link_id,observed_at,source_fingerprint,
    principal_cents,received_cents,payment_date,source_status,verification,evidence_kind,
    components,accounting_lines,review_reasons,recorded_by,open_evidence,collector_review_reasons)
  VALUES(v_snapshot,v_link.id,v_observation.observed_at,
    encode(extensions.digest(jsonb_build_object('version','v2','observationId',v_observation.id,
      'invoice',v_row)::text,'sha256'),'hex'),round(v_receivable.valor*100)::bigint,v_paid,v_payment,
    v_status,v_verification,v_kind,
    '{"interestCents":null,"penaltyCents":null,"discountCents":null,"additionCents":null}'::jsonb,
    '[]'::jsonb,CASE WHEN v_reason IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_reason) END,p_actor_id,
    CASE WHEN v_status='OPEN' THEN jsonb_build_object('basis','EXPLICIT_SOURCE_STATUS',
      'providerStatus','OPEN','sourceField','v2.invoice.status',
      'sourceManifestHash',encode(extensions.digest(v_row::text,'sha256'),'hex')) END,
    CASE WHEN v_reason IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_reason) END);
  IF v_status='PAID' THEN
    v_before:=internal_proesc.receivable_fingerprint(v_receivable);
    -- IMPORT is already an authorized, exact-row projection mode. Its request,
    -- mutation claim, audit event and historical-only trigger are reused intact.
    v_response:=public.proesc_apply_financial_snapshot_service(p_actor_id,v_request,
      jsonb_build_object('snapshotId',v_snapshot,'expectedBefore',v_before,'mode','IMPORT'));
    v_result:=CASE WHEN v_response->>'result' IN ('APPLIED','UNCHANGED') THEN 'APPLIED' ELSE 'REVIEW' END;
    v_reason:=v_response->>'reviewReason';
  END IF;
  UPDATE internal_proesc.v2_invoice_observations SET link_id=v_link.id,snapshot_id=v_snapshot,
    result=v_result,reason=v_reason WHERE id=p_observation_id;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.v2_apply_invoice(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
