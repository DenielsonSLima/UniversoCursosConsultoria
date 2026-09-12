-- After bootstrap+financial migrations and the synthetic academic fixture.
-- Caller owns BEGIN/ROLLBACK; no real enrollment may be selected by this test.
DO $$
DECLARE
  v_actor uuid;
  v_id uuid; v_scope internal_proesc.class_scopes%rowtype; v_person_hash text;
  v_unknown jsonb; v_proof jsonb; v_payload jsonb; v_result jsonb; v_request uuid;
  v_import jsonb; v_source jsonb; v_first_hash text; v_before text; v_after text;
  v_receivable uuid; v_old_evidence text; v_old_manifest text; v_policy_hash text;
BEGIN
  ASSERT current_setting('app.proesc_test_rollback',true)='on','Outer rollback required';
  SELECT s.* INTO STRICT v_scope FROM internal_proesc.class_scopes s
  WHERE s.class_code='ENF-T35-REHEARSAL' AND s.batch_id IS NOT NULL;
  v_actor:=v_scope.confirmed_by;
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SELECT m.id,internal_proesc.person_document_hash(m.aluno_id) INTO STRICT v_id,v_person_hash
  FROM public.matriculas m WHERE m.turma_id=v_scope.turma_id;
  SELECT md5(coalesce(string_agg(to_jsonb(c)::text,'' ORDER BY c.id),'')) INTO v_before
  FROM public.contas_receber c JOIN public.turmas t ON t.id=c.turma_id
  WHERE t.codigo IN ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');
  ASSERT NOT internal_proesc.has_confirmed_first_cycle_only(v_id),'Missing evidence must mean UNKNOWN';
  v_request:=gen_random_uuid();
  v_unknown:=jsonb_build_object('matriculaId',v_id,'scopeId',v_scope.id,
    'classification','UNKNOWN','hasExternalCycle2',NULL,'evidenceKind','UNRESOLVED',
    'sourceEvidence','{}'::jsonb,'observedAt',now(),'expectedRevision',0,'expectedEvidenceHash',NULL,
    'expectedManifestHash',internal_proesc.enrollment_cycle_manifest_hash(v_id));
  v_result:=public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,v_request,v_unknown);
  ASSERT v_result->>'classification'='UNKNOWN' AND v_result->'currentlyEligibleC1'='false'::jsonb,
    'UNKNOWN must not authorize local issuance';
  v_result:=public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,v_request,v_unknown);
  ASSERT v_result->'replayed'='true'::jsonb,'Evidence request must replay';
  BEGIN
    PERFORM public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,v_request,
      v_unknown||'{"hasExternalCycle2":true}'::jsonb);
    RAISE EXCEPTION 'Changed replay accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  BEGIN
    PERFORM public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,v_request,v_unknown);
    RAISE EXCEPTION 'Replay bypassed authorization';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SELECT evidence_hash INTO v_old_evidence FROM internal_proesc.enrollment_cycle_evidence WHERE matricula_id=v_id;
  v_payload:=v_unknown||jsonb_build_object('classification','C1','hasExternalCycle2',false,
    'expectedRevision',1,'expectedEvidenceHash',v_old_evidence);
  BEGIN
    PERFORM public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,gen_random_uuid(),v_payload);
    RAISE EXCEPTION 'Unproven C1 accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  v_source:=jsonb_build_object('unitId',v_scope.source_unit_id,'classId',v_scope.source_class_id,
    'personHash',v_person_hash,'key','999991001');
  v_import:=jsonb_build_object('matriculaId',v_id,'source',v_source,
    'sourceFingerprint',repeat('1',64),'expectedEnrollmentBefore',internal_proesc.enrollment_import_fingerprint(v_id),
    'principalCents',27990,'dueDate','2026-09-15','sourceCancelled',false,
    'obligationKind','TUITION','sourceCycle','UNRESOLVED','ordinal',NULL);
  v_result:=public.proesc_import_original_obligation_service(v_actor,gen_random_uuid(),v_import);
  v_receivable:=(v_result->>'receivableId')::uuid;
  v_old_manifest:=internal_proesc.enrollment_cycle_manifest_hash(v_id);
  v_proof:=jsonb_build_object('unitId',v_scope.source_unit_id,'classId',v_scope.source_class_id,
    'personHash',v_person_hash,'artifactHash',repeat('2',64),'contractReference','SYNTHETIC-CONTRACT-ONLY',
    'completeContract',true,'firstInstallmentCount',1,'secondInstallmentCount',0,
    'obligations',jsonb_build_array(jsonb_build_object('key','999991001','cycle','FIRST',
      'kind','TUITION','ordinal',1,'principalCents',27990,'dueDate','2026-09-15')));
  v_payload:=v_payload||jsonb_build_object('evidenceKind','SOURCE_CONTRACT','sourceEvidence',v_proof,
    'expectedManifestHash',v_old_manifest);
  v_result:=public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,gen_random_uuid(),v_payload);
  ASSERT v_result->>'classification'='C1' AND v_result->>'verification'='CONFIRMED','Complete synthetic proof failed';
  ASSERT NOT internal_proesc.has_confirmed_first_cycle_only(v_id),'Financial REVIEW is independent and blocks generation';
  UPDATE internal_proesc.enrollment_sources SET financial_review_state='CONFIRMED' WHERE matricula_id=v_id;
  ASSERT internal_proesc.has_confirmed_first_cycle_only(v_id),'Confirmed C1+active+financial review must pass coverage hook';
  ASSERT internal_academic.technical_manual_cycle_state(v_id)->'podeGerar' IS DISTINCT FROM 'true'::jsonb,
    'Coverage must not invent the missing real policy/config';
  v_first_hash:=internal_proesc.enrollment_cycle_manifest_hash(v_id);
  v_policy_hash:=internal_proesc.individual_cycle_policy_fingerprint(v_id,repeat('a',64));
  ASSERT internal_proesc.individual_cycle_policy_fingerprint(v_id,NULL) IS NULL,'Missing policy must remain missing';
  UPDATE public.contas_receber SET updated_at=now()+interval '1 second' WHERE id=v_receivable;
  UPDATE internal_proesc.obligation_links SET auto_enabled=true WHERE receivable_id=v_receivable;
  ASSERT internal_proesc.enrollment_cycle_manifest_hash(v_id)=v_first_hash,
    'Operational timestamps/auto-sync flags must not invalidate contract coverage';
  SELECT evidence_hash INTO v_old_evidence FROM internal_proesc.enrollment_cycle_evidence WHERE matricula_id=v_id;
  v_import:=v_import||jsonb_build_object('source',v_source||'{"key":"999991002"}'::jsonb,
    'sourceFingerprint',repeat('3',64),'dueDate','2026-10-15',
    'expectedEnrollmentBefore',internal_proesc.enrollment_import_fingerprint(v_id));
  PERFORM public.proesc_import_original_obligation_service(v_actor,gen_random_uuid(),v_import);
  UPDATE internal_proesc.enrollment_sources SET financial_review_state='CONFIRMED' WHERE matricula_id=v_id;
  ASSERT NOT internal_proesc.has_confirmed_first_cycle_only(v_id),'New obligation must invalidate old C1 even after financial closure';
  ASSERT internal_proesc.individual_cycle_policy_fingerprint(v_id,repeat('a',64))<>v_policy_hash,
    'Old preview policy fingerprint must expire after a new obligation';
  BEGIN
    PERFORM public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,gen_random_uuid(),
      v_payload||jsonb_build_object('expectedRevision',2,'expectedEvidenceHash',v_old_evidence));
    RAISE EXCEPTION 'Stale manifest accepted';
  EXCEPTION WHEN sqlstate '40001' THEN NULL; END;
  SELECT md5(coalesce(string_agg(to_jsonb(c)::text,'' ORDER BY c.id),'')) INTO v_after
  FROM public.contas_receber c JOIN public.turmas t ON t.id=c.turma_id
  WHERE t.codigo IN ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');
  ASSERT v_after=v_before,'T42/Radiologia changed';
  ASSERT NOT has_function_privilege('authenticated',
    'public.proesc_confirm_enrollment_cycle_evidence_service(uuid,uuid,jsonb)','EXECUTE'),
    'Confirmation RPC must remain service-only';
END;
$$;
