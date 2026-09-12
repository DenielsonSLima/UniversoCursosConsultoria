-- REHEARSAL ONLY. Requires applied00/01/02 plus06; independent of03/04/05,
-- class turno confirmation and financial guard migrations.
-- Caller must BEGIN; SET LOCAL app.proesc_test_rollback='on'; execute this file;
-- and ROLLBACK. Never COMMIT the synthetic fixture.
-- Only synthetic student data; no external sends or Auth creation.
do $bootstrap_rehearsal$
declare
  v_actor uuid; v_course uuid; v_batch uuid; v_partner uuid; v_hash text; v_base text; v_cpf text;
  v_sum integer; v_digit integer; v_counter integer; v_classes jsonb; v_payload jsonb; v_result jsonb;
  v_stage_request uuid:=gen_random_uuid(); v_student_request uuid:=gen_random_uuid(); v_request uuid;
  v_scope internal_proesc.class_scopes%rowtype; v_active_scope uuid; v_unknown_scope uuid; v_paused_scope uuid;
  v_active uuid; v_unknown uuid; v_paused uuid; v_proof jsonb; v_class_payload jsonb; v_enrollment_payload jsonb;
  v_before_classes bigint; v_before_students bigint; v_before_auth bigint; v_before_messages bigint; v_before_push bigint; v_partner_before jsonb; v_polo_original uuid; v_existing_fingerprint text; v_actual_fingerprint text;
begin
  assert not has_table_privilege('authenticated','internal_proesc.bootstrap_claims','INSERT'),
    'Authenticated role can forge internal claims';
  assert not has_function_privilege('authenticated','public.proesc_upsert_import_student_service(uuid,uuid,jsonb)','EXECUTE'),
    'Authenticated role can call the private importer';
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
  select count(*) into v_before_classes from public.turmas;
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
    'poloId',polo.id,'courseId',v_course,'startDate',target.start_date,'turno',null,
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
    'expectedStudents',1,'expectedEnrollments',1,'classes',v_classes);
  v_result:=public.proesc_stage_import_batch_service(v_actor,v_stage_request,v_payload);
  v_batch:=(v_result->>'batchId')::uuid;
  v_result:=public.proesc_stage_import_batch_service(v_actor,v_stage_request,v_payload);
  assert v_result->'replayed'='true'::jsonb, 'Stage request must replay';
  begin
    perform public.proesc_stage_import_batch_service(v_actor,v_stage_request,
      v_payload||jsonb_build_object('expectedStudents',2));
    raise exception 'Changed stage payload was accepted';
  exception when sqlstate '22023' then null; end;
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
  begin
    perform public.proesc_upsert_import_student_service(v_actor,gen_random_uuid(),
      jsonb_set(v_payload,'{sourceProvenance,observations,0,row}','3'));
    raise exception 'A new request overwrote the already-staged source proof';
  exception when sqlstate '40001' then null; end;
  assert (select source_provenance=v_payload->'sourceProvenance'
    from internal_proesc.student_staging where partner_id=v_partner and batch_id=v_batch),
    'Source proof was not persisted exactly';
  assert (select status='STAGING' from internal_proesc.import_batches where id=v_batch),
    'Student-only stage advanced into classes';
  assert (select count(*)=9 from internal_proesc.class_scopes where batch_id=v_batch and turma_id is null
    and phase='STAGED' and class_spec->>'turno' is null), 'Unknown turnos blocked or fabricated public classes';
  assert (select count(*)=v_before_classes from public.turmas), 'Student-only import created a class';
  assert (select count(*)=v_before_auth from auth.users), 'Student-only import created Auth';
  assert (select count(*)=v_before_messages from public.comunicacao_eventos_outbox), 'Import queued communication';
  assert (select count(*)=v_before_push from public.push_notification_jobs), 'Import queued push';
  assert (select auth_user_id is null from public.parceiros where id=v_partner), 'Import linked Auth';
  assert not public.documentacao_obrigatoria_aluno_concluida(v_partner), 'Import approved documentation';
  assert not exists(select 1 from public.matriculas where aluno_id=v_partner), 'Student-only import enrolled the person';
  assert not exists(select 1 from public.contas_receber where cliente_id=v_partner), 'Student-only import created a charge';
  assert (select to_jsonb(p)=v_partner_before from public.parceiros p where id=v_partner), 'Reuse changed the profile';
  raise notice 'Student-only Proesc bootstrap assertions passed; caller must ROLLBACK';
end;
$bootstrap_rehearsal$;
