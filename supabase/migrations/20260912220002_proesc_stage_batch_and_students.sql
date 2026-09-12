begin;

create function public.proesc_stage_import_batch_service(p_actor_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_replay jsonb; v_batch uuid; v_item jsonb; v_number integer; v_city text;
  v_expected_city text; v_expected_date date; v_expected_class text; v_mode text; v_count integer:=0;
begin
  v_replay:=internal_proesc.begin_bootstrap_request('STAGE',p_actor_id,p_request_id,p_payload);
  if v_replay is not null then return v_replay; end if;
  if not coalesce(p_payload->>'sourceManifestHash' ~ '^[0-9a-f]{64}$',false)
    or jsonb_typeof(p_payload->'classes') is distinct from 'array'
    or jsonb_array_length(p_payload->'classes')<>9 then
    raise exception 'Manifesto deve conter exatamente as nove turmas autorizadas.' using errcode='22023'; end if;
  insert into internal_proesc.import_batches(request_id,actor_id,source_manifest_hash,expected_students,expected_enrollments)
  values(p_request_id,p_actor_id,p_payload->>'sourceManifestHash',
    (p_payload->>'expectedStudents')::integer,(p_payload->>'expectedEnrollments')::integer) returning id into v_batch;
  for v_item in select value from jsonb_array_elements(p_payload->'classes') loop
    if not coalesce(v_item->>'code' ~ '^ENF-T(35|37|38|39|40|41|43|44|45)-[A-Z0-9-]+$'
      and v_item->>'sourceUnitId' ~ '^[0-9]+$' and v_item->>'sourceClassId' ~ '^[0-9]+$',false) then
      raise exception 'Código ou identidade de turma fora do manifesto autorizado.' using errcode='22023'; end if;
    v_number:=substring(v_item->>'code' from '^ENF-T([0-9]+)-')::integer;
    select city,start_date,source_class into strict v_expected_city,v_expected_date,v_expected_class from (values
      (35,'JAPOATA',date '2024-06-01','304625'),(37,'PORTO DA FOLHA',date '2024-09-03','324931'),
      (38,'JAPOATA',date '2025-02-08','345341'),(39,'PORTO DA FOLHA',date '2025-04-08','371609'),
      (40,'JAPOATA',date '2025-04-12','371589'),(41,'AQUIDABA',date '2025-04-08','372477'),
      (43,'JAPOATA',date '2026-02-07','425565'),(44,'AQUIDABA',date '2026-03-03','425570'),
      (45,'PORTO DA FOLHA',date '2026-03-03','425568')) approved(number,city,start_date,source_class) where number=v_number;
    select replace(upper(cidade),'Ã','A') into v_city from public.polos
    where id=(v_item->>'poloId')::uuid and lower(status)='ativo';
    v_mode:='INDIVIDUAL_REVIEW';
    if v_city is distinct from v_expected_city or (v_item->>'startDate')::date is distinct from v_expected_date
      or v_item->>'sourceUnitId' is distinct from '3145'
      or v_item->>'sourceClassId' is distinct from v_expected_class
      or v_item->>'financialMode' is distinct from v_mode
      or not coalesce(v_item->'sourceAcademic'->>'kind'='PROESC_XLS_EXPORT'
        and v_item->'sourceAcademic'->>'fileName' in ('2024.xls','2025.xls','2026.xls')
        and v_item->'sourceAcademic'->>'fileSha256' ~ '^[0-9a-f]{64}$'
        and length(v_item->'sourceAcademic'->>'classLabel')>3,false)
      or (v_item->>'turno' is not null and v_item->>'turno' not in ('MATUTINO','VESPERTINO','NOTURNO','INTEGRAL'))
      or not exists(select 1 from public.cursos where id=(v_item->>'courseId')::uuid
        and modalidade='TECNICO' and nome ilike '%enfermagem%')
      or exists(select 1 from public.turmas where codigo=v_item->>'code')
      or exists(select 1 from internal_proesc.class_scopes where batch_id=v_batch
        and substring(class_code from '^ENF-T([0-9]+)-')::integer=v_number) then
      raise exception 'Polo, curso, início ou regime da turma diverge do escopo autorizado.' using errcode='22023'; end if;
    insert into internal_proesc.class_scopes(batch_id,source_unit_id,source_class_id,polo_id,
      class_code,financial_mode,phase,class_spec,source_academic)
    values(v_batch,v_item->>'sourceUnitId',v_item->>'sourceClassId',(v_item->>'poloId')::uuid,
      v_item->>'code',v_mode,'STAGED',v_item,coalesce(v_item->'sourceAcademic','{}'::jsonb));
    v_count:=v_count+1;
  end loop;
  return internal_proesc.finish_bootstrap_request(p_request_id,jsonb_build_object('batchId',v_batch,
    'status','STAGING','classes',v_count,'scopes',(select jsonb_agg(jsonb_build_object(
      'scopeId',id,'code',class_code,'sourceUnitId',source_unit_id,'sourceClassId',source_class_id))
      from internal_proesc.class_scopes where batch_id=v_batch)));
end;
$$;

create function public.proesc_upsert_import_student_service(p_actor_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_replay jsonb; v_batch internal_proesc.import_batches%rowtype; v_profile jsonb:=p_payload->'student';
  v_partner public.parceiros%rowtype; v_existing internal_proesc.student_staging%rowtype;
  v_cpf text; v_hash text; v_count integer; v_new boolean:=false; v_columns text; v_values text;
begin
  v_replay:=internal_proesc.begin_bootstrap_request('STUDENT',p_actor_id,p_request_id,p_payload);
  if v_replay is not null then return v_replay; end if;
  select * into strict v_batch from internal_proesc.import_batches where id=(p_payload->>'batchId')::uuid for update;
  if v_batch.status<>'STAGING' or jsonb_typeof(v_profile) is distinct from 'object'
    or not coalesce(p_payload->>'sourceFingerprint' ~ '^[0-9a-f]{64}$',false)
    or not exists(select 1 from internal_proesc.class_scopes where batch_id=v_batch.id
      and source_unit_id=p_payload->>'sourceUnitId') then
    raise exception 'Cadastro fora da etapa de alunos ou da origem autorizada.' using errcode='42501'; end if;
  if exists(select 1 from jsonb_object_keys(v_profile) key where key not in (
    'nome','cpf_cnpj','email','telefone','cep','endereco','numero','complemento','bairro','cidade','uf',
    'data_nascimento','sexo','rg','orgao_emissor','nacionalidade','naturalidade','nome_mae','nome_pai',
    'nome_social','responsavel_nome','responsavel_cpf','responsavel_parentesco','responsavel_telefone',
    'responsavel_email','responsavel_financeiro','estado_civil','pcd','pcd_tipo','escolaridade_anterior',
    'instituicao_origem','ano_conclusao_ensino_medio','tipo_documento','situacao_ensino_medio',
    'serie_ensino_medio_atual','escola_ensino_medio','ano_previsto_conclusao_ensino_medio','raca_cor')) then
    raise exception 'Campo cadastral fora do contrato de importação.' using errcode='22023'; end if;
  v_cpf:=regexp_replace(coalesce(v_profile->>'cpf_cnpj',''),'[^0-9]','','g');
  if not coalesce(public.is_valid_cpf(v_cpf),false) or length(btrim(coalesce(v_profile->>'nome','')))<2 then
    raise exception 'Aluno exige CPF válido e nome confirmado na origem.' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(v_cpf,'sha256'),'hex');
  if p_payload ? 'sourcePersonKey' and p_payload->>'sourcePersonKey' is distinct from v_hash then
    raise exception 'Identidade de origem diverge do CPF confirmado.' using errcode='40001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('proesc:student-cpf:'||v_cpf,0));
  select count(*) into v_count from public.parceiros where tipo='Aluno'
    and regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')=v_cpf;
  if v_count>1 then raise exception 'CPF corresponde a mais de um cadastro; conferência obrigatória.' using errcode='40001'; end if;
  if v_count=1 then
    select * into strict v_partner from public.parceiros where tipo='Aluno'
      and regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')=v_cpf for update;
  end if;
  select * into v_existing from internal_proesc.student_staging where batch_id=v_batch.id
    and source_unit_id=p_payload->>'sourceUnitId' and source_person_key=v_hash;
  if found then
    if v_existing.partner_id is distinct from v_partner.id
      or v_existing.identity_fingerprint is distinct from p_payload->>'sourceFingerprint'
      or v_existing.source_profile is distinct from v_profile
      or v_existing.source_person_id is distinct from nullif(p_payload->>'sourcePersonId','') then
      raise exception 'Identidade já conferida não pode ser redirecionada.' using errcode='40001'; end if;
    return internal_proesc.finish_bootstrap_request(p_request_id,jsonb_build_object('partnerId',v_partner.id,
      'sourcePersonKey',v_hash,'result','ALREADY_STAGED','created',false));
  end if;
  if (select count(*) from internal_proesc.student_staging where batch_id=v_batch.id)>=v_batch.expected_students then
    raise exception 'Quantidade de alunos excede o manifesto.' using errcode='22023'; end if;
  if v_partner.id is null then
    -- Only explicitly supplied demographic columns are inserted. Defaults and
    -- portal/document triggers remain authoritative; existing identity is untouched.
    v_profile:=v_profile||jsonb_build_object('tipo','Aluno','status','ATIVO','cpf_cnpj',v_cpf);
    select string_agg(format('%I',key),',' order by key),string_agg(format('record.%I',key),',' order by key)
      into v_columns,v_values from jsonb_object_keys(v_profile) key;
    begin
      execute format('insert into public.parceiros(%s) select %s from jsonb_populate_record(null::public.parceiros,$1) record returning *',
        v_columns,v_values) into v_partner using v_profile;
    exception when unique_violation then
      raise exception 'Cadastro contém conflito de identidade; conferência privada obrigatória.' using errcode='23505';
    end;
    v_new:=true;
  end if;
  if v_new and v_partner.auth_user_id is not null then
    raise exception 'Importação cadastral não pode vincular uma credencial existente.' using errcode='40001'; end if;
  insert into internal_proesc.student_staging(batch_id,source_unit_id,source_person_key,source_person_id,
    partner_id,identity_fingerprint,created_new,source_profile,request_id)
  values(v_batch.id,p_payload->>'sourceUnitId',v_hash,nullif(p_payload->>'sourcePersonId',''),v_partner.id,
    p_payload->>'sourceFingerprint',v_new,p_payload->'student',p_request_id);
  return internal_proesc.finish_bootstrap_request(p_request_id,jsonb_build_object('partnerId',v_partner.id,
    'sourcePersonKey',v_hash,'result',case when v_new then 'CREATED' else 'REUSED' end,'created',v_new));
end;
$$;
revoke all on function public.proesc_stage_import_batch_service(uuid,uuid,jsonb),
  public.proesc_upsert_import_student_service(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.proesc_stage_import_batch_service(uuid,uuid,jsonb),
  public.proesc_upsert_import_student_service(uuid,uuid,jsonb) to service_role;
commit;
