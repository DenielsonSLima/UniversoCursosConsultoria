-- Run only within the combined academic+financial rehearsal. Synthetic DML
-- rolls back internally; this file never invokes enqueue or any external API.
do $proesc_financial_import_contract$
declare
  v_actor uuid;
  v_enrollment public.matriculas%rowtype;
  v_scope internal_proesc.class_scopes%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_payload jsonb; v_result jsonb; v_replay jsonb; v_observation jsonb;
  v_snapshot jsonb; v_apply jsonb; v_link_payload jsonb;
  v_request uuid; v_snapshot_request uuid; v_apply_request uuid; v_link uuid;
  v_original_count bigint; v_initial_jobs bigint; v_protected_before text; v_protected_after text;
  v_claim_role text:=current_setting('request.jwt.claim.role',true);
  v_claim_sub text:=current_setting('request.jwt.claim.sub',true);
  v_claims text:=current_setting('request.jwt.claims',true);
  v_observed timestamptz:=now();
begin
  if current_setting('app.proesc_test_rollback',true) is distinct from 'on' then
    raise exception 'Run only inside the explicit synthetic rollback rehearsal'; end if;
  begin
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    perform set_config('request.jwt.claim.role','service_role',true);
    select m.* into strict v_enrollment from public.matriculas m
      join internal_proesc.enrollment_sources e on e.matricula_id=m.id and e.source_verified
      join internal_proesc.class_scopes s on s.id=e.scope_id and s.turma_id=m.turma_id
      where s.batch_id is not null and s.phase='CONFIRMED' and s.class_code like 'ENF-T%-REHEARSAL' and s.financial_mode='INDIVIDUAL_REVIEW'
      order by m.id limit 1;
    select * into strict v_scope from internal_proesc.class_scopes where turma_id=v_enrollment.turma_id;
    v_actor:=v_scope.confirmed_by;
    perform internal_proesc.authorize_financial_operator(v_actor);
    select count(*) into v_original_count from public.contas_receber;
    select count(*) into v_initial_jobs from public.push_notification_jobs;
    select md5(coalesce(string_agg(to_jsonb(c)::text,',' order by c.id),'')) into v_protected_before
      from public.contas_receber c join public.turmas t on t.id=c.turma_id
      join public.cursos course on course.id=t.curso_id
      where t.codigo='ENF-T42-INT-MAT' or course.nome ilike '%radiologia%';
    v_payload:=jsonb_build_object('matriculaId',v_enrollment.id,
      'source',jsonb_build_object('unitId',v_scope.source_unit_id,'classId',v_scope.source_class_id,
        'key','999999999999999999999999999991','personHash',internal_proesc.person_document_hash(v_enrollment.aluno_id)),
      'sourceFingerprint',repeat('a',64),'sourceCancelled',false,
      'expectedEnrollmentBefore',internal_proesc.enrollment_import_fingerprint(v_enrollment.id),
      'principalCents',101,'dueDate','2000-01-01','obligationKind','UNRESOLVED','sourceCycle','UNRESOLVED');
    begin
      perform public.proesc_import_original_obligation_service(v_actor,gen_random_uuid(),
        jsonb_set(v_payload,'{source,personHash}',to_jsonb(repeat('0',64))));
      raise exception 'Wrong source CPF was accepted';
    exception when sqlstate '40001' then null; end;
    begin
      perform public.proesc_import_original_obligation_service(v_actor,gen_random_uuid(),
        v_payload||jsonb_build_object('expectedEnrollmentBefore',repeat('0',64)));
      raise exception 'Stale enrollment CAS was accepted';
    exception when sqlstate '40001' then null; end;
    begin
      perform public.proesc_import_original_obligation_service(v_actor,gen_random_uuid(),
        jsonb_set(v_payload,'{source,classId}','"999999999999999999999999999992"'::jsonb));
      raise exception 'Wrong source class was accepted';
    exception when sqlstate '42501' then null; end;
    v_request:=gen_random_uuid();
    v_result:=public.proesc_import_original_obligation_service(v_actor,v_request,v_payload);
    v_link:=(v_result->>'linkId')::uuid;
    select * into strict v_receivable from public.contas_receber where id=(v_result->>'receivableId')::uuid;
    assert v_receivable.valor=1.01 and v_receivable.data_vencimento=date '2000-01-01'
      and v_receivable.valor_pago=0 and v_receivable.data_pagamento is null
      and v_receivable.status='PENDENTE' and v_receivable.categoria='OUTROS_CREDITOS',
      'Unverified source must preserve principal with operational pending, not inferred overdue or tuition';
    assert v_receivable.origem_pagamento='SISTEMA_ANTERIOR'
      and v_receivable.gateway_provider is null and v_receivable.gateway_creation_token is null,
      'Historical import created a bank identity';
    assert (select not auto_enabled from internal_proesc.obligation_links where id=v_link), 'Import must not silently enable consultation';
    assert internal_academic.is_technical_manual_cycle_protected(v_enrollment.id), 'UNKNOWN coverage must block local C2';
    assert public.should_skip_technical_manual_future_sync(v_enrollment.id), 'Legacy future sync was not blocked';
    assert public.gerar_parcelas_matricula(v_enrollment.id)=0, 'Legacy installments were generated';
    assert public.gerar_rematricula_apos_parcelas(v_enrollment.id) is null, 'Legacy reenrollment was generated';
    v_replay:=public.proesc_import_original_obligation_service(v_actor,v_request,v_payload);
    assert v_replay->'replayed'='true'::jsonb and v_replay->>'receivableId'=v_result->>'receivableId', 'Import replay changed identity';
    begin
      perform public.proesc_import_original_obligation_service(v_actor,gen_random_uuid(),v_payload);
      raise exception 'Same external key duplicated principal';
    exception when sqlstate '40001' then null; end;
    perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    begin
      perform public.proesc_import_original_obligation_service(v_actor,v_request,v_payload);
      raise exception 'Unauthorized replay was accepted';
    exception when sqlstate '42501' then null; end;
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    perform set_config('request.jwt.claim.role','service_role',true);
    -- A principal-only snapshot records UNKNOWN, without manufacturing OPEN.
    v_observation:=jsonb_build_object('linkId',v_link,'sourceFingerprint',repeat('b',64),
      'observedAt',v_observed,'principalCents',101,'receivedCents',null,'paymentDate',null,
      'sourceStatus','UNKNOWN','verification','REVIEW','evidenceKind','UNRESOLVED',
      'lines',jsonb_build_array(jsonb_build_object('blockCode','1','amountCents',101,
        'cancelled',false,'renegotiation',false,'paymentDate',null,'paymentMethod',null,
        'sourceYear',2000,'sourceMonth',1)));
    v_snapshot:=public.proesc_record_financial_snapshot_service(v_actor,gen_random_uuid(),v_observation);
    assert v_snapshot->>'verification'='REVIEW', 'Principal-only history invented verified OPEN';
    v_apply:=jsonb_build_object('snapshotId',v_snapshot->>'snapshotId',
      'expectedBefore',internal_proesc.receivable_fingerprint(v_receivable),'mode','IMPORT');
    v_result:=public.proesc_apply_financial_snapshot_service(v_actor,gen_random_uuid(),v_apply);
    assert v_result->>'result'='REVIEW', 'UNKNOWN evidence applied a payment';
    v_link_payload:=jsonb_build_object('matriculaId',v_enrollment.id,'receivableId',v_receivable.id,
      'source',v_payload->'source','expectedBefore',internal_proesc.receivable_fingerprint(v_receivable),'autoEnabled',true);
    v_result:=public.proesc_link_obligation_service(v_actor,gen_random_uuid(),v_link_payload);
    assert internal_proesc.sync_link_allowed(v_link), 'UNKNOWN coverage prevented authorized read-only monitoring';
    assert internal_academic.is_technical_manual_cycle_protected(v_enrollment.id), 'Monitoring permission enabled Banese';
    -- Existing payment-total contract permits a real amount below principal.
    -- Two rows are intentionally kept; no discount is inferred from the difference.
    v_observation:=jsonb_build_object('linkId',v_link,'sourceFingerprint',repeat('c',64),
      'observedAt',v_observed+interval '1 second','principalCents',101,'receivedCents',89,
      'paymentDate',current_date-1,'sourceStatus','PAID','verification','VERIFIED','evidenceKind','API_PAYMENT_TOTAL',
      'components',jsonb_build_object('interestCents',null,'penaltyCents',null,'discountCents',null,'additionCents',null),
      'lines',jsonb_build_array(
        jsonb_build_object('blockCode','1','amountCents',101,'cancelled',false,'renegotiation',false),
        jsonb_build_object('blockCode','2','amountCents',40,'cancelled',false,'renegotiation',false,'paymentDate',current_date-1),
        jsonb_build_object('blockCode','2','amountCents',49,'cancelled',false,'renegotiation',false,'paymentDate',current_date-1)));
    v_snapshot_request:=gen_random_uuid();
    v_snapshot:=public.proesc_record_financial_snapshot_service(v_actor,v_snapshot_request,v_observation);
    assert v_snapshot->>'verification'='VERIFIED', 'Verified payment total rejected';
    v_replay:=public.proesc_record_financial_snapshot_service(v_actor,v_snapshot_request,v_observation);
    assert v_replay->'replayed'='true'::jsonb and v_replay->>'snapshotId'=v_snapshot->>'snapshotId', 'Snapshot replay duplicated payment evidence';
    v_apply:=jsonb_build_object('snapshotId',v_snapshot->>'snapshotId',
      'expectedBefore',internal_proesc.receivable_fingerprint(v_receivable),'mode','IMPORT');
    v_apply_request:=gen_random_uuid();
    v_result:=public.proesc_apply_financial_snapshot_service(v_actor,v_apply_request,v_apply);
    assert v_result->>'result'='APPLIED', 'Confirmed API payment was not applied';
    v_replay:=public.proesc_apply_financial_snapshot_service(v_actor,v_apply_request,v_apply);
    assert v_replay->'replayed'='true'::jsonb, 'Payment replay was not idempotent';
    select * into strict v_receivable from public.contas_receber where id=v_receivable.id;
    assert v_receivable.valor=1.01 and v_receivable.valor_pago=0.89 and v_receivable.status='PAGO'
      and v_receivable.data_pagamento=current_date-1,'Paid history did not retain exact source amount/date';
    assert (select components->'discountCents'='null'::jsonb and jsonb_array_length(accounting_lines)=3
      from internal_proesc.financial_snapshots where id=(v_snapshot->>'snapshotId')::uuid),
      'Components were inferred or accounting rows deduplicated';
    assert internal_academic.is_technical_manual_cycle_protected(v_enrollment.id), 'Paid receipt implied C1 coverage';
    begin
      update public.contas_receber set gateway_creation_token=gen_random_uuid() where id=v_receivable.id;
      raise exception 'External history accepted a bank claim';
    exception when sqlstate '42501' then null; end;
    begin
      update public.contas_receber set asaas_payment_id='synthetic-external-gateway' where id=v_receivable.id;
      raise exception 'External history accepted another provider';
    exception when sqlstate '42501' then null; end;
    begin
      insert into public.contas_receber(id,matricula_id,turma_id,cliente_id,polo_id,descricao,valor,
        data_vencimento,status,origem_pagamento,tipo_lancamento)
      values(gen_random_uuid(),v_enrollment.id,v_enrollment.turma_id,v_enrollment.aluno_id,v_scope.polo_id,
        'Synthetic unauthorized row',1,date '2199-12-30','PENDENTE','SISTEMA_ANTERIOR','PARCELA');
      raise exception 'Direct import bypassed claims';
    exception when sqlstate '42501' then null; end;
    assert (select count(*)=v_original_count+1 from public.contas_receber), 'Unexpected extra receivable';
    assert (select count(*)=v_initial_jobs from public.push_notification_jobs), 'Historical import sent a notification';
    select md5(coalesce(string_agg(to_jsonb(c)::text,',' order by c.id),'')) into v_protected_after
      from public.contas_receber c join public.turmas t on t.id=c.turma_id
      join public.cursos course on course.id=t.curso_id
      where t.codigo='ENF-T42-INT-MAT' or course.nome ilike '%radiologia%';
    assert v_protected_before=v_protected_after,'T42 or Radiology history changed';
    raise exception 'synthetic contract rollback' using errcode='PT999';
  exception when sqlstate 'PT999' then null; end;
  assert (select count(*)=v_original_count from public.contas_receber),'Test did not rollback';
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_claim_role,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_claim_sub,''),true);
  raise notice 'Financial history import, UNKNOWN monitoring, payment replay, claims, T42/Radiology preservation passed';
end;
$proesc_financial_import_contract$;
