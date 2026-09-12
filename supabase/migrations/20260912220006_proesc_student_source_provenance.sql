begin;

alter table internal_proesc.student_staging add column source_provenance jsonb not null default '{}'::jsonb
  check (jsonb_typeof(source_provenance)='object');

-- Preserve applied authorization and immutable request replay behavior.
CREATE OR REPLACE FUNCTION public.proesc_upsert_import_student_service(p_actor_id uuid, p_request_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
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
  if jsonb_typeof(p_payload->'sourceProvenance') is distinct from 'object'
    or p_payload->'sourceProvenance'->>'kind' is distinct from 'PROESC_XLS_EXPORT'
    or p_payload->'sourceProvenance'->>'cpfHash' is distinct from v_hash
    or jsonb_typeof(p_payload->'sourceProvenance'->'observations') is distinct from 'array' then
    raise exception 'Cadastro exige proveniência documental da identidade.' using errcode='22023'; end if;
  if jsonb_array_length(p_payload->'sourceProvenance'->'observations') not between 1 and 32
    or exists(select 1 from jsonb_array_elements(p_payload->'sourceProvenance'->'observations') proof
      where not coalesce(proof->>'fileSha256' ~ '^[0-9a-f]{64}$'
        and proof->>'rowFingerprint' ~ '^[0-9a-f]{64}$'
        and proof->>'row' ~ '^[1-9][0-9]{0,6}$',false)
        or case when proof->>'row' ~ '^[1-9][0-9]{0,6}$' then (proof->>'row')::integer<2 else true end
        or not exists(select 1 from internal_proesc.class_scopes scope
          where scope.batch_id=v_batch.id
            and scope.source_academic->>'fileName'=proof->>'fileName'
            and scope.source_academic->>'fileSha256'=proof->>'fileSha256'))
    or (p_payload->'sourceProvenance' ? 'identityConfirmation' and not coalesce(
      p_payload->'sourceProvenance'->'identityConfirmation'->>'kind'='USER_CONFIRMED'
      and p_payload->'sourceProvenance'->'identityConfirmation'->>'cpfHash'=v_hash
      and p_payload->'sourceProvenance'->'identityConfirmation'->>'confirmationFingerprint' ~ '^[0-9a-f]{64}$',false)) then
    raise exception 'Origem, arquivo ou confirmação de CPF diverge do manifesto.' using errcode='22023'; end if;
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
      or v_existing.source_provenance is distinct from p_payload->'sourceProvenance'
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
    partner_id,identity_fingerprint,created_new,source_profile,source_provenance,request_id)
  values(v_batch.id,p_payload->>'sourceUnitId',v_hash,nullif(p_payload->>'sourcePersonId',''),v_partner.id,
    p_payload->>'sourceFingerprint',v_new,p_payload->'student',p_payload->'sourceProvenance',p_request_id);
  return internal_proesc.finish_bootstrap_request(p_request_id,jsonb_build_object('partnerId',v_partner.id,
    'sourcePersonKey',v_hash,'result',case when v_new then 'CREATED' else 'REUSED' end,'created',v_new));
end;
$function$;

revoke all on function public.proesc_upsert_import_student_service(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.proesc_upsert_import_student_service(uuid,uuid,jsonb) to service_role;
commit;
