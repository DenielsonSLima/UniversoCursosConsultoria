-- Rehearsal only, BEFORE importing the nine real classes.
-- Caller must BEGIN; SET LOCAL app.proesc_test_rollback='on'; run this fixture,
-- optional financial contract tests, then ROLLBACK. It intentionally leaves the
-- synthetic fixture available to the next contract test in that same transaction.
-- No real student identifiers are embedded or selected. The portal sequence may
-- consume an unused registration number, although all rows are rolled back.
do $bootstrap_rehearsal$
declare
  v_actor uuid; v_course uuid; v_batch uuid; v_partner uuid; v_hash text; v_base text; v_cpf text;
  v_sum integer; v_digit integer; v_counter integer; v_classes jsonb; v_payload jsonb; v_result jsonb;
  v_stage_request uuid:=gen_random_uuid(); v_student_request uuid:=gen_random_uuid(); v_request uuid;
  v_scope internal_proesc.class_scopes%rowtype; v_active_scope uuid; v_unknown_scope uuid; v_paused_scope uuid;
  v_active uuid; v_unknown uuid; v_paused uuid; v_proof jsonb; v_class_payload jsonb; v_enrollment_payload jsonb;
  v_before_students bigint; v_before_auth bigint; v_before_messages bigint; v_before_push bigint; v_partner_before jsonb; v_polo_original uuid; v_existing_fingerprint text; v_actual_fingerprint text;
begin
  assert current_setting('app.proesc_test_rollback',true)='on', 'Outer rollback rehearsal flag required';
  assert not exists(select 1 from internal_proesc.class_scopes where batch_id is not null),
    'Run synthetic bootstrap contract before the real nine-class import';
  select u.id into strict v_actor from public.usuarios_sistema u
  left join public.perfis_acesso profile on profile.id=u.perfil_acesso_id
  where lower(u.status) in ('ativo','active') and lower(u.perfil)='gestor'
    and (case when profile.id is not null and not coalesce(u.personalizar_permissoes,false)
      then profile.permissoes else u.permissoes end) @> '{"allPolos":true,"modules":["configuracoes"]}'::jsonb
    and coalesce(to_jsonb(u)->'polo_ids','[]'::jsonb) in ('[]'::jsonb,'null'::jsonb)
    and btrim(coalesce(to_jsonb(u)->>'context',''))
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  order by u.id limit 1;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select id into strict v_course from public.cursos where modalidade='TECNICO' and nome ilike '%enfermagem%';
  select count(*) into v_before_students from public.parceiros where tipo='Aluno';
  select count(*) into v_before_auth from auth.users;
  select count(*) into v_before_messages from public.comunicacao_eventos_outbox;
  select count(*) into v_before_push from public.push_notification_jobs;
  select md5(coalesce(string_agg(to_jsonb(receipt)::text,'' order by receipt.id),'')) into v_existing_fingerprint
  from public.contas_receber receipt join public.turmas class on class.id=receipt.turma_id
  where class.codigo in ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');
  -- Generate an isolated valid CPF; it must not match any existing partner.
  loop
    v_base:=lpad(floor(random()*1000000000)::bigint::text,9,'0');
    v_cpf:=v_base;
    for v_counter in 1..2 loop
      select sum(substring(v_cpf from n for 1)::integer*(length(v_cpf)+2-n)) into v_sum
      from generate_series(1,length(v_cpf)) n;
      v_digit:=(v_sum*10)%11;
      v_cpf:=v_cpf||(case when v_digit=10 then 0 else v_digit end)::text;
    end loop;
    exit when public.is_valid_cpf(v_cpf) and not exists(select 1 from public.parceiros
      where regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')=v_cpf);
  end loop;
  v_hash:=encode(extensions.digest(v_cpf,'sha256'),'hex');
  select jsonb_agg(jsonb_build_object('sourceUnitId','3145','sourceClassId',target.source_class,
    'code','ENF-T'||target.number||'-REHEARSAL','name','Turma sintética de ensaio Proesc '||target.number,
    'poloId',polo.id,'courseId',v_course,'startDate',target.start_date,'turno',case when target.number=37 then null else 'INTEGRAL' end,
    'financialMode','INDIVIDUAL_REVIEW','sourceAcademic',jsonb_build_object(
      'kind','PROESC_XLS_EXPORT','fileName','2024.xls','fileSha256',repeat('f',64),
      'classLabel','SYNTHETIC-'||target.number,'cursandoCount',1))
    order by target.number) into v_classes
  from (values
    (35,'JAPOATA',date '2024-06-01','304625'),(37,'PORTO DA FOLHA',date '2024-09-03','324931'),
    (38,'JAPOATA',date '2025-02-08','345341'),(39,'PORTO DA FOLHA',date '2025-04-08','371609'),
    (40,'JAPOATA',date '2025-04-12','371589'),(41,'AQUIDABA',date '2025-04-08','372477'),
    (43,'JAPOATA',date '2026-02-07','425565'),(44,'AQUIDABA',date '2026-03-03','425570'),
    (45,'PORTO DA FOLHA',date '2026-03-03','425568')) target(number,city,start_date,source_class)
  join public.polos polo on replace(upper(polo.cidade),'Ã','A')=target.city and lower(polo.status)='ativo';
  assert jsonb_array_length(v_classes)=9, 'The three authorized polos must resolve uniquely';
  v_payload:=jsonb_build_object('sourceManifestHash',encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'),
    'expectedStudents',1,'expectedEnrollments',3,'classes',v_classes);
  v_result:=public.proesc_stage_import_batch_service(v_actor,v_stage_request,v_payload);
  v_batch:=(v_result->>'batchId')::uuid;
  v_result:=public.proesc_stage_import_batch_service(v_actor,v_stage_request,v_payload);
  assert v_result->'replayed'='true'::jsonb, 'Stage request must replay';
  begin
    perform public.proesc_stage_import_batch_service(v_actor,v_stage_request,
      v_payload||jsonb_build_object('expectedStudents',2));
    raise exception 'Changed stage payload was accepted';
  exception when sqlstate '22023' then null; end;
  select id into v_active_scope from internal_proesc.class_scopes where batch_id=v_batch and class_code='ENF-T35-REHEARSAL';
  select id into v_unknown_scope from internal_proesc.class_scopes where batch_id=v_batch and class_code='ENF-T43-REHEARSAL';
  select id into v_paused_scope from internal_proesc.class_scopes where batch_id=v_batch and class_code='ENF-T44-REHEARSAL';
  begin
    perform public.proesc_create_import_class_service(v_actor,gen_random_uuid(),jsonb_build_object('scopeId',v_active_scope));
    raise exception 'Class creation before students was accepted';
  exception when sqlstate '42501' then null; end;
  v_payload:=jsonb_build_object('batchId',v_batch,'sourceUnitId','3145','sourcePersonId','SYNTHETIC-PERSON',
    'sourceProvenance',jsonb_build_object('kind','PROESC_XLS_EXPORT','cpfHash',v_hash,
      'observations',jsonb_build_array(jsonb_build_object('fileName','2024.xls','fileSha256',repeat('f',64),
        'row',2,'rowFingerprint',repeat('a',64)))),
    'sourceFingerprint',repeat('a',64),'student',jsonb_build_object('nome','Aluno sintético de ensaio Proesc','cpf_cnpj',v_cpf));
  v_result:=public.proesc_upsert_import_student_service(v_actor,v_student_request,v_payload);
  v_partner:=(v_result->>'partnerId')::uuid;
  assert v_result->>'result'='CREATED' and v_result->>'sourcePersonKey'=v_hash, 'Synthetic student identity mismatch';
  assert (select count(*)=v_before_students+1 from public.parceiros where tipo='Aluno'), 'Student was duplicated';
  v_result:=public.proesc_upsert_import_student_service(v_actor,v_student_request,v_payload);
  assert v_result->'replayed'='true'::jsonb, 'Student request must replay';
  select to_jsonb(p) into strict v_partner_before from public.parceiros p where id=v_partner;
  v_result:=public.proesc_upsert_import_student_service(v_actor,gen_random_uuid(),v_payload);
  assert v_result->>'result'='ALREADY_STAGED' and (v_result->>'partnerId')::uuid=v_partner, 'CPF reuse duplicated identity';
  assert (select to_jsonb(p)=v_partner_before from public.parceiros p where id=v_partner), 'Reuse overwrote the existing partner';
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    perform public.proesc_upsert_import_student_service(v_actor,v_student_request,v_payload);
    raise exception 'Replay bypassed actor authorization';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  begin
    insert into public.parceiros(tipo,nome,cpf_cnpj) values('Aluno','Duplicação sintética proibida',
      substring(v_cpf,1,3)||'.'||substring(v_cpf,4,3)||'.'||substring(v_cpf,7,3)||'-'||substring(v_cpf,10,2));
    raise exception 'Formatting bypassed the canonical CPF constraint';
  exception when unique_violation then null; end;
  for v_scope in select * from internal_proesc.class_scopes where batch_id=v_batch
    and class_code<>'ENF-T37-REHEARSAL' order by class_code loop
    v_class_payload:=jsonb_build_object('scopeId',v_scope.id,
      'sourceAcademic',v_scope.source_academic||jsonb_build_object('status','EM_ANDAMENTO',
        'verified',true,'fingerprint',repeat('c',64),'observedAt',now()));
    if v_scope.class_spec->>'turno' is null then
      begin
        perform public.proesc_create_import_class_service(v_actor,gen_random_uuid(),v_class_payload);
        raise exception 'Class without a proven turno was created';
      exception when sqlstate '22023' then null; end;
      begin
        perform public.proesc_create_import_class_service(v_actor,gen_random_uuid(),
          v_class_payload||jsonb_build_object('turno','INTEGRAL'));
        raise exception 'Turno without explicit user provenance was accepted';
      exception when sqlstate '22023' then null; end;
      v_class_payload:=v_class_payload||jsonb_build_object('turno','INTEGRAL','sourceTurno','USER_CONFIRMED');
    else
      begin
        perform public.proesc_create_import_class_service(v_actor,gen_random_uuid(),
          v_class_payload||jsonb_build_object('turno','NOTURNO','sourceTurno','USER_CONFIRMED'));
        raise exception 'Conflicting staged turno was overwritten';
      exception when sqlstate '22023' then null; end;
    end if;
    v_request:=gen_random_uuid();
    v_result:=public.proesc_create_import_class_service(v_actor,v_request,v_class_payload);
    assert v_result->>'status'='EM_ANDAMENTO', 'Verified historical class failed to enter the correct phase';
    v_result:=public.proesc_create_import_class_service(v_actor,v_request,v_class_payload);
    assert v_result->'replayed'='true'::jsonb, 'Class request must replay';
  end loop;
  v_enrollment_payload:=jsonb_build_object('scopeId',v_active_scope,'sourcePersonKey',v_hash,
    'sourceEnrollmentId',null,'sourceStatus','CURSANDO','sourceVerified',true,
    'sourceFingerprint',repeat('d',64),'sourceObservedAt',now(),'sourceEnrollmentDate','2025-01-15',
    'sourceAcademic','{"fixture":true}'::jsonb);
  v_proof:=jsonb_build_object('kind','PROESC_XLS_EXPORT','fileName','2024.xls','fileSha256',repeat('f',64),
    'row',2,'rowFingerprint',repeat('d',64),'classLabel','SYNTHETIC-35','cpfHash',v_hash,
    'statusRaw','CURSANDO','enrollmentDate','2025-01-15');
  v_enrollment_payload:=v_enrollment_payload||jsonb_build_object('sourceProvenance',v_proof);
  begin
    perform public.proesc_import_enrollment_service(v_actor,gen_random_uuid(),v_enrollment_payload-'sourceProvenance');
    raise exception 'Active import without exact XLS proof was accepted';
  exception when sqlstate '22023' then null; end;
  v_request:=gen_random_uuid();
  v_result:=public.proesc_import_enrollment_service(v_actor,v_request,v_enrollment_payload);
  v_active:=(v_result->>'matriculaId')::uuid;
  assert v_result->>'status'='ATIVO', 'Confirmed CURSANDO must not be mislabeled as preregistration';
  v_result:=public.proesc_import_enrollment_service(v_actor,v_request,v_enrollment_payload);
  assert v_result->'replayed'='true'::jsonb, 'Enrollment request must replay';
  assert (select status='STUDENTS_READY' from internal_proesc.import_batches where id=v_batch),
    'Enrollment in a confirmed class was blocked by another pending class';
  select * into strict v_scope from internal_proesc.class_scopes
    where batch_id=v_batch and class_code='ENF-T37-REHEARSAL';
  begin
    perform public.proesc_import_enrollment_service(v_actor,gen_random_uuid(),
      v_enrollment_payload||jsonb_build_object('scopeId',v_scope.id));
    raise exception 'Enrollment was accepted in an unconfirmed class';
  exception when sqlstate '42501' then null; end;
  v_class_payload:=jsonb_build_object('scopeId',v_scope.id,
    'sourceAcademic',v_scope.source_academic||jsonb_build_object('status','EM_ANDAMENTO',
      'verified',true,'fingerprint',repeat('c',64),'observedAt',now()));
  begin
    perform public.proesc_create_import_class_service(v_actor,gen_random_uuid(),v_class_payload);
    raise exception 'Pending class without a turno was created';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.proesc_create_import_class_service(v_actor,gen_random_uuid(),
      v_class_payload||jsonb_build_object('turno','INTEGRAL'));
    raise exception 'Turno without explicit user provenance was accepted';
  exception when sqlstate '22023' then null; end;
  v_class_payload:=v_class_payload||jsonb_build_object('turno','INTEGRAL','sourceTurno','USER_CONFIRMED');
  v_request:=gen_random_uuid();
  v_result:=public.proesc_create_import_class_service(v_actor,v_request,v_class_payload);
  assert v_result->>'status'='EM_ANDAMENTO', 'User-confirmed turno did not release the pending class';
  assert (select status='CLASSES_READY' from internal_proesc.import_batches where id=v_batch), 'All classes did not finish';
  v_enrollment_payload:=v_enrollment_payload||jsonb_build_object('scopeId',v_unknown_scope,
    'sourceEnrollmentId',null,'sourceStatus','DESISTENTE','sourceVerified',true,
    'sourceProvenance',v_proof||jsonb_build_object('classLabel','SYNTHETIC-43','statusRaw','DESISTENTE'));
  v_result:=public.proesc_import_enrollment_service(v_actor,gen_random_uuid(),v_enrollment_payload);
  v_unknown:=(v_result->>'matriculaId')::uuid;
  select polo_id into strict v_polo_original from public.parceiros where id=v_partner;
  assert v_result->>'status'='DESISTENTE', 'Source withdrawal must remain inactive';
  v_enrollment_payload:=v_enrollment_payload||jsonb_build_object('scopeId',v_paused_scope,
    'sourceEnrollmentId',null,'sourceStatus','TRANCADO','sourceVerified',true,
    'sourceProvenance',v_proof||jsonb_build_object('classLabel','SYNTHETIC-44','statusRaw','TRANCOU'));
  v_result:=public.proesc_import_enrollment_service(v_actor,gen_random_uuid(),v_enrollment_payload);
  v_paused:=(v_result->>'matriculaId')::uuid;
  assert v_result->>'status'='TRANCADO', 'Confirmed paused source state must remain paused';
  assert (select p.polo_id=v_polo_original and cardinality(p.polo_ids)=2 from public.parceiros p where p.id=v_partner),
    'Multiple enrollment polos moved the original identity or lost visibility';
  assert not exists(select 1 from public.contas_receber where matricula_id in (v_active,v_unknown,v_paused)),
    'Academic bootstrap generated a financial title';
  assert not exists(select 1 from public.matriculas_tecnicas_financeiro_config where matricula_id in (v_active,v_unknown,v_paused)),
    'Academic bootstrap invented activation configuration';
  assert not exists(select 1 from public.matriculas where id in (v_active,v_unknown,v_paused) and (data_matricula at time zone 'America/Maceio')::date is distinct from date '2025-01-15'),
    'Historical enrollment date was not preserved';
  assert not exists(select 1 from internal_proesc.enrollment_sources where matricula_id in (v_active,v_unknown,v_paused)
    and source_enrollment_id is not null), 'A native enrollment id was fabricated';
  assert not exists(select 1 from public.turmas t join internal_proesc.class_scopes s on s.turma_id=t.id
    where s.batch_id=v_batch and (t.regra_financeira_fingerprint is not null or t.cronograma_financeiro<>'[]'::jsonb
      or t.data_previsao_termino is not null)), 'Rule or academic end date was fabricated';
  assert (select count(*)=v_before_auth from auth.users), 'Academic import created an Auth account';
  assert (select count(*)=v_before_messages from public.comunicacao_eventos_outbox), 'Academic import queued communication';
  assert (select count(*)=v_before_push from public.push_notification_jobs), 'Academic import queued push notifications';
  assert (select auth_user_id is null from public.parceiros where id=v_partner), 'Import linked an Auth credential';
  assert not public.documentacao_obrigatoria_aluno_concluida(v_partner), 'Source active state falsely approved documentation';
  assert (select status='ENROLLMENTS_READY' from internal_proesc.import_batches where id=v_batch), 'Batch phase mismatch';
  assert not exists(select 1 from internal_proesc.bootstrap_claims where not completed), 'Unconsumed bootstrap claim';
  select md5(coalesce(string_agg(to_jsonb(receipt)::text,'' order by receipt.id),'')) into v_actual_fingerprint
  from public.contas_receber receipt join public.turmas class on class.id=receipt.turma_id
  where class.codigo in ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');
  assert v_actual_fingerprint=v_existing_fingerprint, 'Existing T42/Radiology titles changed';
  raise notice 'Synthetic Proesc bootstrap assertions passed; caller must ROLLBACK after financial tests';
end;
$bootstrap_rehearsal$;
