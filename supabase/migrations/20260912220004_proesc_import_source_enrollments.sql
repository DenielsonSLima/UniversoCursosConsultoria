begin;

create function public.proesc_import_enrollment_service(p_actor_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_replay jsonb; v_scope internal_proesc.class_scopes%rowtype; v_batch internal_proesc.import_batches%rowtype;
  v_student internal_proesc.student_staging%rowtype; v_partner public.parceiros%rowtype;
  v_class public.turmas%rowtype; v_enrollment public.matriculas%rowtype;
  v_source_status text:=p_payload->>'sourceStatus'; v_status text; v_id uuid:=gen_random_uuid();
  v_observed timestamptz; v_enrolled timestamptz; v_expected jsonb; v_before jsonb;
begin
  v_replay:=internal_proesc.begin_bootstrap_request('ENROLLMENT',p_actor_id,p_request_id,p_payload);
  if v_replay is not null then return v_replay; end if;
  if not coalesce(v_source_status in ('CURSANDO','TRANCADO','DESISTENTE','CANCELADO','TRANSFERIDO','REMANEJADO')
    and p_payload->>'sourcePersonKey' ~ '^[0-9a-f]{64}$'
    and p_payload->>'sourceFingerprint' ~ '^[0-9a-f]{64}$',false)
    or jsonb_typeof(p_payload->'sourceVerified') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'sourceAcademic') is distinct from 'object'
    or p_payload->'sourceVerified' is distinct from 'true'::jsonb
    or jsonb_typeof(p_payload->'sourceProvenance') is distinct from 'object'
    or nullif(p_payload->>'sourceEnrollmentId','') is not null then
    raise exception 'Matrícula exige identidade e situação acadêmica comprovadas na origem.' using errcode='22023'; end if;
  v_observed:=(p_payload->>'sourceObservedAt')::timestamptz;
  if p_payload ? 'sourceEnrollmentDate' and nullif(p_payload->>'sourceEnrollmentDate','') is not null then
    v_enrolled:=((p_payload->>'sourceEnrollmentDate')::date)::timestamp at time zone 'America/Maceio';
  elsif nullif(p_payload->>'sourceEnrolledAt','') is not null then
    if p_payload->>'sourceEnrolledAt' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'Data histórica com horário exige fuso explícito.' using errcode='22023'; end if;
    v_enrolled:=(p_payload->>'sourceEnrolledAt')::timestamptz;
  end if;
  if v_observed is null or not isfinite(v_observed) or v_observed>now()+interval '5 minutes'
    or (v_enrolled is not null and (not isfinite(v_enrolled) or v_enrolled>now())) then
    raise exception 'Data histórica ou observação inválida.' using errcode='22023'; end if;
  select * into strict v_scope from internal_proesc.class_scopes where id=(p_payload->>'scopeId')::uuid;
  select * into strict v_batch from internal_proesc.import_batches where id=v_scope.batch_id for update;
  if v_batch.status not in ('STUDENTS_READY','CLASSES_READY')
    or (select count(*) from internal_proesc.student_staging where batch_id=v_batch.id)<>v_batch.expected_students
    or v_scope.phase<>'CONFIRMED' or v_scope.turma_id is null then
    raise exception 'Conclua todos os alunos e confirme esta turma antes da matrícula.' using errcode='42501'; end if;
  if not internal_proesc.valid_xls_enrollment_proof(v_scope.id,p_payload->>'sourcePersonKey',
    v_source_status,p_payload->>'sourceFingerprint',v_enrolled,p_payload->'sourceProvenance') then
    raise exception 'Proveniência XLS diverge do arquivo, turma, aluno ou situação confirmados.' using errcode='22023'; end if;
  select * into strict v_student from internal_proesc.student_staging where batch_id=v_batch.id
    and source_unit_id=v_scope.source_unit_id and source_person_key=p_payload->>'sourcePersonKey';
  perform pg_advisory_xact_lock(hashtextextended('proesc:enrollment-source:'||v_scope.id::text||':'||v_student.source_person_key,0));
  select * into strict v_class from public.turmas where id=v_scope.turma_id for update;
  select * into strict v_partner from public.parceiros where id=v_student.partner_id for update;
  if v_partner.tipo<>'Aluno' or encode(extensions.digest(
    regexp_replace(coalesce(v_partner.cpf_cnpj,''),'[^0-9]','','g'),'sha256'),'hex')<>v_student.source_person_key then
    raise exception 'Cadastro do aluno divergiu da identidade conferida.' using errcode='40001'; end if;
  if exists(select 1 from public.matriculas where aluno_id=v_partner.id and turma_id=v_class.id)
    or exists(select 1 from internal_proesc.enrollment_sources where scope_id=v_scope.id
      and source_person_key=v_student.source_person_key) then
    raise exception 'Matrícula já existente; não duplicar ou sobrescrever histórico.' using errcode='40001'; end if;
  if (select count(*) from internal_proesc.enrollment_sources source join internal_proesc.class_scopes scope
    on scope.id=source.scope_id where scope.batch_id=v_batch.id)>=v_batch.expected_enrollments then
    raise exception 'Quantidade de matrículas excede o manifesto.' using errcode='22023'; end if;
  if v_source_status='CURSANDO' and exists(select 1 from public.matriculas enrollment
    join public.turmas class on class.id=enrollment.turma_id where enrollment.aluno_id=v_partner.id
      and class.curso_id=v_class.curso_id and enrollment.status='ATIVO') then
    raise exception 'Existe matrícula ativa no mesmo curso; conferir a continuidade na origem.' using errcode='40001'; end if;
  -- Concluded source history cannot manufacture local grades/certificates.
  -- Its exact source status remains private and financial release stays REVIEW.
  v_status:=case when v_source_status='CURSANDO' then 'ATIVO' else 'PENDENTE' end;
  insert into internal_proesc.enrollment_sources(matricula_id,scope_id,source_person_key,source_enrollment_id,
    source_status,source_verified,source_fingerprint,source_observed_at,source_enrolled_at,source_academic,source_provenance,request_id)
  values(v_id,v_scope.id,v_student.source_person_key,nullif(p_payload->>'sourceEnrollmentId',''),v_source_status,
    (p_payload->>'sourceVerified')::boolean,p_payload->>'sourceFingerprint',v_observed,v_enrolled,
    p_payload->'sourceAcademic',p_payload->'sourceProvenance',p_request_id);
  v_expected:=jsonb_build_object('id',v_id,'aluno_id',v_partner.id,'turma_id',v_class.id,'status',v_status,
    'data_matricula',v_enrolled,'fluxo_operacional','REGULAR','financeiro_herdado',true,
    'gerar_cobranca_inicial',false,'gerar_cobranca_futura',false,'sincronizar_asaas',false);
  insert into internal_proesc.bootstrap_claims(request_id,transaction_id,entity,record_id,expected_new)
  values(p_request_id,txid_current(),'ENROLLMENT',v_id,v_expected);
  perform internal_academic.authorize_enrollment_upsert(v_partner.id,v_class.id,v_status);
  insert into public.matriculas(id,aluno_id,turma_id,status,data_matricula,fluxo_operacional,
    financeiro_herdado,gerar_cobranca_inicial,gerar_cobranca_futura,sincronizar_asaas)
  values(v_id,v_partner.id,v_class.id,v_status,v_enrolled,'REGULAR',true,false,false,false)
  returning * into v_enrollment;
  if v_source_status in ('TRANCADO','DESISTENTE','CANCELADO','TRANSFERIDO','REMANEJADO') then
    v_status:=case when v_source_status='REMANEJADO' then 'TRANSFERIDO' else v_source_status end;
    v_before:=to_jsonb(v_enrollment);
    perform internal_academic.authorize_transition('MATRICULA_STATUS',v_id,v_status);
    update public.matriculas set status=v_status where id=v_id returning * into v_enrollment;
    v_expected:=v_expected||jsonb_build_object('status',v_status);
  end if;
  if not to_jsonb(v_enrollment) @> v_expected or exists(select 1 from public.contas_receber where matricula_id=v_id)
    or exists(select 1 from public.matriculas_tecnicas_financeiro_config where matricula_id=v_id) then
    raise exception 'A importação criou cobrança/configuração ou alterou dados fora do plano.' using errcode='40001'; end if;
  insert into public.matricula_movimentacoes(matricula_id,aluno_id,tipo,status_anterior,status_novo,
    turma_destino_id,motivo,observacao,responsavel_id)
  values(v_id,v_partner.id,'MATRICULA',null,v_enrollment.status,v_class.id,
    'Importação acadêmica Proesc conferida, sem emissão financeira.',
    'Situação de origem: '||v_source_status||'. Documentos e acesso permanecem com as validações próprias.',p_actor_id);
  update internal_proesc.bootstrap_claims set completed=true where request_id=p_request_id;
  if (select count(*) from internal_proesc.enrollment_sources source join internal_proesc.class_scopes scope
    on scope.id=source.scope_id where scope.batch_id=v_batch.id)=v_batch.expected_enrollments then
    update internal_proesc.import_batches set status='ENROLLMENTS_READY' where id=v_batch.id;
  end if;
  return internal_proesc.finish_bootstrap_request(p_request_id,jsonb_build_object('matriculaId',v_id,
    'partnerId',v_partner.id,'turmaId',v_class.id,'status',v_enrollment.status,'sourceStatus',v_source_status,
    'financialReviewState','REVIEW','created',true));
end;
$$;
revoke all on function public.proesc_import_enrollment_service(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.proesc_import_enrollment_service(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
