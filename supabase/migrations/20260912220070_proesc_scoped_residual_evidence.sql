-- Scoped Proesc import extension, rebased against the verified remote contract.
begin;

-- Remote base CAS from MCP read-only inspection.
do $base_70$
begin
  if md5(pg_get_functiondef('public.proesc_import_residual_obligation_service(uuid,uuid,jsonb)'::regprocedure)) <> 'a9ecdddf63c8e703b410cd9f41943d9d' then
    raise exception 'Remote base changed: public.proesc_import_residual_obligation_service; rebase required.'; end if;
end;
$base_70$;

-- A verified historical balance may belong to a non-active imported enrollment.
-- This exception is limited to confirmed new scopes; the original T42 condition
-- and the guards against existing manual/external cycle runs remain unchanged.
do $scoped_residual_status$
declare v_definition text;
  v_old text := 'or not exists (select 1 from public.matriculas where id = v_parent.matricula_id and status in (''ATIVO'',''PENDENTE''))';
  v_new text := 'or not exists (select 1 from public.matriculas m where m.id=v_parent.matricula_id and (
      m.status in (''ATIVO'',''PENDENTE'') or exists (
        select 1 from internal_proesc.class_scopes s join internal_proesc.enrollment_sources e on e.scope_id=s.id
        where s.turma_id=m.turma_id and s.batch_id is not null and s.phase=''CONFIRMED''
          and e.matricula_id=m.id and e.source_verified and e.source_status<>''SOURCE_UNKNOWN'')))';
begin
  v_definition:=pg_get_functiondef('public.proesc_import_residual_obligation_service(uuid,uuid,jsonb)'::regprocedure);
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 then
    raise exception 'Contrato residual mudou; revisar antes da extensão.'; end if;
  execute replace(v_definition,v_old,v_new);
end;
$scoped_residual_status$;

alter function public.proesc_import_residual_obligation_service(uuid,uuid,jsonb)
  rename to import_residual_before_scope_evidence;
alter function public.import_residual_before_scope_evidence(uuid,uuid,jsonb) set schema internal_proesc;
create function public.proesc_import_residual_obligation_service(p_actor_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_parent internal_proesc.obligation_links%rowtype;
  v_parent_import internal_proesc.obligation_imports%rowtype;
  v_scope internal_proesc.class_scopes%rowtype;
  v_result jsonb; v_person uuid;
begin
  perform internal_proesc.authorize_financial_operator(p_actor_id);
  select * into strict v_parent from internal_proesc.obligation_links where id=(p_payload->>'parentLinkId')::uuid;
  v_scope:=internal_proesc.assert_confirmed_class_scope(v_parent.turma_id,
    p_payload->'source'->>'unitId',p_payload->'source'->>'classId');
  if v_scope.batch_id is not null then
    select * into strict v_parent_import from internal_proesc.obligation_imports where link_id=v_parent.id;
    select aluno_id into strict v_person from public.matriculas where id=v_parent.matricula_id;
    if internal_proesc.person_document_hash(v_person) is distinct from p_payload->'source'->>'personHash'
      or v_parent_import.source_person_hash is distinct from p_payload->'source'->>'personHash' then
      raise exception 'Residual exige a pessoa comprovada na obrigação-pai.' using errcode='42501'; end if;
  end if;
  v_result:=internal_proesc.import_residual_before_scope_evidence(p_actor_id,p_request_id,p_payload);
  if v_scope.batch_id is not null and not coalesce((v_result->>'replayed')::boolean,false) then
    insert into internal_proesc.obligation_imports(link_id,request_id,scope_id,source_person_hash,
      source_fingerprint,source_cycle,obligation_kind,source_ordinal)
    values((v_result->>'linkId')::uuid,p_request_id,v_scope.id,v_parent_import.source_person_hash,
      p_payload->>'sourceFingerprint',v_parent_import.source_cycle,'OTHER_CONFIRMED',null);
    update internal_proesc.enrollment_sources set financial_review_state='REVIEW' where matricula_id=v_parent.matricula_id;
  end if;
  return v_result;
end;
$$;
revoke all on function internal_proesc.import_residual_before_scope_evidence(uuid,uuid,jsonb),
  public.proesc_import_residual_obligation_service(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.proesc_import_residual_obligation_service(uuid,uuid,jsonb) to service_role;
commit;
