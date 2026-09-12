begin;

create function internal_proesc.begin_bootstrap_request(
  p_action text,p_actor_id uuid,p_request_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing internal_proesc.bootstrap_requests%rowtype; v_hash text;
begin
  perform internal_proesc.authorize_financial_operator(p_actor_id);
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Requisição de importação inválida.' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('proesc:bootstrap-request:'||p_request_id::text,0));
  select * into v_existing from internal_proesc.bootstrap_requests where request_id=p_request_id;
  if found then
    if v_existing.action<>p_action or v_existing.actor_id<>p_actor_id
      or v_existing.payload_hash<>v_hash or v_existing.response is null then
      raise exception 'requestId já utilizado com outra intenção.' using errcode='22023'; end if;
    return v_existing.response||jsonb_build_object('replayed',true);
  end if;
  insert into internal_proesc.bootstrap_requests(request_id,action,actor_id,payload_hash)
  values(p_request_id,p_action,p_actor_id,v_hash);
  return null;
end;
$$;
create function internal_proesc.finish_bootstrap_request(p_request_id uuid,p_response jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  update internal_proesc.bootstrap_requests set response=p_response||'{"replayed":false}'::jsonb,completed_at=now()
  where request_id=p_request_id and response is null;
  if not found then raise exception 'Requisição fora da fase esperada.' using errcode='40001'; end if;
  return p_response||'{"replayed":false}'::jsonb;
end;
$$;
create function internal_proesc.assert_confirmed_class_scope(
  p_turma_id uuid,p_source_unit_id text,p_source_class_id text
) returns internal_proesc.class_scopes language plpgsql stable security definer set search_path='' as $$
declare v_scope internal_proesc.class_scopes%rowtype;
begin
  select * into v_scope from internal_proesc.class_scopes
  where turma_id=p_turma_id and source_unit_id=p_source_unit_id
    and source_class_id=p_source_class_id and phase='CONFIRMED';
  if not found then raise exception 'Turma/origem Proesc fora do escopo confirmado.' using errcode='42501'; end if;
  return v_scope;
end;
$$;
create function internal_proesc.is_bootstrap_claim(p_entity text,p_record_id uuid,p_row jsonb)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from internal_proesc.bootstrap_claims claim
    join internal_proesc.bootstrap_requests request on request.request_id=claim.request_id
    where claim.entity=p_entity and claim.record_id=p_record_id and claim.transaction_id=txid_current()
      and not claim.completed and request.response is null and request.action=p_entity
      and p_row @> claim.expected_new);
$$;
create function internal_proesc.is_enrollment_bootstrap_claim(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.matriculas enrollment
    join internal_proesc.enrollment_sources source on source.matricula_id=enrollment.id
    join internal_proesc.class_scopes scope on scope.id=source.scope_id
    where enrollment.id=p_matricula_id and scope.batch_id is not null
      and scope.phase='CONFIRMED' and scope.turma_id=enrollment.turma_id
      and internal_proesc.is_bootstrap_claim('ENROLLMENT',enrollment.id,to_jsonb(enrollment)));
$$;

-- Importing active academic history must not silently reschedule its financial
-- date or create an activation configuration. Other callers retain the original.
alter function internal_academic.ensure_technical_financial_pending(uuid)
  rename to ensure_technical_financial_pending_before_proesc_bootstrap;
revoke all on function internal_academic.ensure_technical_financial_pending_before_proesc_bootstrap(uuid)
  from public,anon,authenticated,service_role;
create function internal_academic.ensure_technical_financial_pending(p_matricula_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if internal_proesc.is_enrollment_bootstrap_claim(p_matricula_id) then return false; end if;
  return internal_academic.ensure_technical_financial_pending_before_proesc_bootstrap(p_matricula_id);
end;
$$;

create function internal_proesc.valid_xls_enrollment_proof(
  p_scope_id uuid,p_person_key text,p_status text,p_fingerprint text,p_enrolled_at timestamptz,p_proof jsonb
) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(exists(select 1 from internal_proesc.class_scopes scope
    where scope.id=p_scope_id and scope.batch_id is not null
      and scope.financial_mode='INDIVIDUAL_REVIEW'
      and p_proof->>'kind'='PROESC_XLS_EXPORT'
      and p_proof->>'fileName'=scope.source_academic->>'fileName'
      and p_proof->>'fileSha256'=scope.source_academic->>'fileSha256'
      and p_proof->>'fileSha256' ~ '^[0-9a-f]{64}$'
      and p_proof->>'row' ~ '^[1-9][0-9]{0,6}$'
      and (p_proof->>'row')::integer>=2
      and p_proof->>'rowFingerprint'=p_fingerprint
      and p_proof->>'classLabel'=scope.source_academic->>'classLabel'
      and p_proof->>'cpfHash'=p_person_key
      and p_proof->>'enrollmentDate'=to_char(p_enrolled_at at time zone 'America/Maceio','YYYY-MM-DD')
      and p_status=case p_proof->>'statusRaw'
        when 'CURSANDO' then 'CURSANDO' when 'TRANCOU' then 'TRANCADO'
        when 'DESISTENTE' then 'DESISTENTE' when 'CANCELOU' then 'CANCELADO'
        when 'TRANSFERIDO(A)' then 'TRANSFERIDO' when 'REMANEJADO(A)' then 'REMANEJADO'
        else null end),false);
$$;
revoke all on function internal_proesc.valid_xls_enrollment_proof(uuid,text,text,text,timestamptz,jsonb)
  from public,anon,authenticated,service_role;

create function internal_proesc.guard_bootstrap_enrollment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_scope internal_proesc.class_scopes%rowtype; v_source internal_proesc.enrollment_sources%rowtype;
begin
  select * into v_scope from internal_proesc.class_scopes where turma_id=new.turma_id and batch_id is not null;
  if not found then return new; end if;
  select * into v_source from internal_proesc.enrollment_sources where matricula_id=new.id and scope_id=v_scope.id;
  if not found or v_scope.phase<>'CONFIRMED'
    or not internal_proesc.is_bootstrap_claim('ENROLLMENT',new.id,to_jsonb(new)) then
    raise exception 'Matrícula importada exige identidade e plano de origem confirmados.' using errcode='42501'; end if;
  if new.status='ATIVO' and (v_source.source_status<>'CURSANDO' or not v_source.source_verified
    or not internal_proesc.valid_xls_enrollment_proof(v_scope.id,v_source.source_person_key,
      v_source.source_status,v_source.source_fingerprint,v_source.source_enrolled_at,v_source.source_provenance)) then
    raise exception 'Continuidade ativa exige matrícula CURSANDO comprovada na origem.' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger a01_guard_proesc_bootstrap_enrollment before insert on public.matriculas
for each row execute function internal_proesc.guard_bootstrap_enrollment();

revoke all on function internal_proesc.begin_bootstrap_request(text,uuid,uuid,jsonb),
  internal_proesc.finish_bootstrap_request(uuid,jsonb),
  internal_proesc.assert_confirmed_class_scope(uuid,text,text),
  internal_proesc.is_bootstrap_claim(text,uuid,jsonb),
  internal_proesc.is_enrollment_bootstrap_claim(uuid),internal_proesc.guard_bootstrap_enrollment(),
  internal_academic.ensure_technical_financial_pending(uuid) from public,anon,authenticated,service_role;
commit;
