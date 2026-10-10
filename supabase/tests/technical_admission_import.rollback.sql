-- Synthetic staging metadata; the real class/student/import RPCs create all claims.
-- No real source identifiers, credentials, charges or changes are committed.
begin;
set local statement_timeout='60s';
set local lock_timeout='3s';
set local plpgsql.check_asserts='on';
do $test$
declare
  v_actor uuid; v_course uuid; v_polo uuid; v_batch uuid:=gen_random_uuid();
  v_scope uuid:=gen_random_uuid(); v_request uuid:=gen_random_uuid(); v_student_request uuid:=gen_random_uuid();
  v_partner uuid; v_class uuid; v_enrollment uuid; v_cpf text; v_hash text; v_digit integer; v_sum integer;
  v_i integer; v_payload jsonb; v_result jsonb; v_replay jsonb; v_spec jsonb; v_academic jsonb;
  v_import_request uuid:=gen_random_uuid(); v_today date:=timezone('America/Maceio',now())::date;
begin
  select u.id into strict v_actor from public.usuarios_sistema u
    left join public.perfis_acesso p on p.id=u.perfil_acesso_id
    where lower(u.status) in ('ativo','active') and lower(u.perfil)='gestor'
      and (case when p.id is not null and not coalesce(u.personalizar_permissoes,false)
        then p.permissoes else u.permissoes end) @> '{"allPolos":true,"modules":["configuracoes"]}'::jsonb
      and coalesce(to_jsonb(u)->'polo_ids','[]') in ('[]'::jsonb,'null'::jsonb)
      and btrim(coalesce(to_jsonb(u)->>'context',''))
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    limit 1;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  select t.curso_id,t.polo_id into strict v_course,v_polo from public.turmas t
    join public.cursos c on c.id=t.curso_id where c.modalidade='TECNICO' limit 1;
  loop
    v_cpf:=lpad(floor(random()*1000000000)::bigint::text,9,'0');
    for v_i in 1..2 loop
      select sum(substring(v_cpf,n,1)::integer*(length(v_cpf)+2-n)) into v_sum
        from generate_series(1,length(v_cpf)) n;
      v_digit:=(v_sum*10)%11;
      v_cpf:=v_cpf||case when v_digit=10 then 0 else v_digit end::text;
    end loop;
    exit when public.is_valid_cpf(v_cpf) and not exists(select 1 from public.parceiros
      where regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')=v_cpf);
  end loop;
  v_hash:=encode(extensions.digest(v_cpf,'sha256'),'hex');
  -- Minimal isolated staging fixture: do not reuse the nine already imported source scopes.
  perform internal_proesc.begin_bootstrap_request('STAGE',v_actor,v_request,'{"fixture":"365"}');
  insert into internal_proesc.import_batches(id,request_id,actor_id,source_manifest_hash,expected_students,expected_enrollments)
    values(v_batch,v_request,v_actor,encode(extensions.digest(v_request::text,'sha256'),'hex'),1,1);
  perform internal_proesc.finish_bootstrap_request(v_request,jsonb_build_object('batchId',v_batch));
  v_academic:=jsonb_build_object('kind','PROESC_XLS_EXPORT','fileName','2024.xls',
    'fileSha256',repeat('f',64),'classLabel','SYNTHETIC-365','cursandoCount',1);
  v_spec:=jsonb_build_object('name','Turma sintética importação365','courseId',v_course,'poloId',v_polo,
    'startDate',v_today-730,'endDate',v_today+365,'turno','INTEGRAL');
  insert into internal_proesc.class_scopes(id,batch_id,source_unit_id,source_class_id,polo_id,class_code,
    financial_mode,phase,class_spec,source_academic)
    values(v_scope,v_batch,'999999','9'||floor(random()*1000000000000)::bigint::text,v_polo,
      'TEST-IMPORT-'||v_scope,'INDIVIDUAL_REVIEW','STAGED',v_spec,v_academic);
  v_payload:=jsonb_build_object('batchId',v_batch,'sourceUnitId','999999','sourcePersonId','SYNTHETIC-PERSON-365',
    'sourceProvenance',jsonb_build_object('kind','PROESC_XLS_EXPORT','cpfHash',v_hash,
      'observations',jsonb_build_array(jsonb_build_object('fileName','2024.xls','fileSha256',repeat('f',64),
        'row',2,'rowFingerprint',repeat('a',64)))),
    'sourceFingerprint',repeat('a',64),'student',jsonb_build_object('nome','Aluno sintético importação365','cpf_cnpj',v_cpf));
  v_result:=public.proesc_upsert_import_student_service(v_actor,v_student_request,v_payload);
  v_partner:=(v_result->>'partnerId')::uuid;
  assert v_partner is not null;
  v_result:=public.proesc_create_import_class_service(v_actor,gen_random_uuid(),jsonb_build_object('scopeId',v_scope,
    'sourceAcademic',v_academic||jsonb_build_object('status','EM_ANDAMENTO','verified',true,
      'fingerprint',repeat('c',64),'observedAt',now())));
  v_class:=(v_result->>'turmaId')::uuid;
  assert (select phase='CONFIRMED' from internal_proesc.class_scopes where id=v_scope);
  assert internal_academic.technical_class_admission_policy(v_class)->>'motivo'='PRAZO_EXPIRADO';
  v_payload:=jsonb_build_object('scopeId',v_scope,'sourcePersonKey',v_hash,'sourceStatus','CURSANDO',
    'sourceVerified',true,'sourceFingerprint',repeat('d',64),'sourceObservedAt',now(),
    'sourceEnrollmentDate',(v_today-700)::text,'sourceAcademic','{"fixture":true}'::jsonb,
    'sourceProvenance',jsonb_build_object('kind','PROESC_XLS_EXPORT','fileName','2024.xls',
      'fileSha256',repeat('f',64),'row',2,'rowFingerprint',repeat('d',64),'classLabel','SYNTHETIC-365',
      'cpfHash',v_hash,'statusRaw','CURSANDO','enrollmentDate',(v_today-700)::text));
  begin
    perform public.proesc_import_enrollment_service(v_actor,gen_random_uuid(),v_payload-'sourceProvenance');
    raise exception 'Unproved import bypassed admission policy' using errcode='ZX001';
  exception when invalid_parameter_value then null; end;
  v_result:=public.proesc_import_enrollment_service(v_actor,v_import_request,v_payload);
  v_enrollment:=(v_result->>'matriculaId')::uuid;
  v_replay:=public.proesc_import_enrollment_service(v_actor,v_import_request,v_payload);
  assert v_result->>'status'='ATIVO' and v_replay->>'replayed'='true';
  assert exists(select 1 from internal_proesc.enrollment_sources where matricula_id=v_enrollment and scope_id=v_scope);
  assert not exists(select 1 from public.contas_receber where matricula_id=v_enrollment);
  assert not exists(select 1 from public.matriculas_tecnicas_financeiro_config where matricula_id=v_enrollment);
  assert not exists(select 1 from internal_academic.technical_transfer_admission_permits where database_txid=txid_current());
end;
$test$;
set constraints all immediate;
rollback;
