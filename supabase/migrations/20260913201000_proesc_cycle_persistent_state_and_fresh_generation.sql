-- Keep the reviewed cycle visible; require a fresh API check before new debt.
begin;
alter table internal_proesc.cycle_review_cache add column verified_observed_at timestamptz;
update internal_proesc.cycle_review_cache set verified_observed_at=observed_at where state='COMPLETE';

alter function public.proesc_cycle_review_cache_service(text,uuid,uuid,jsonb)
  rename to proesc_cycle_review_cache_before_automatic;
create function public.proesc_cycle_review_cache_service(
  p_action text,p_actor_id uuid,p_matricula_id uuid,p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_context jsonb; v_old internal_proesc.cycle_review_cache%rowtype;
  v_result jsonb; v_observed timestamptz;
begin
  perform internal_proesc.authorize_cycle_review(p_actor_id,p_matricula_id);
  v_context:=internal_proesc.cycle_review_context(p_matricula_id);
  if p_action='abort' then
    select * into strict v_old from internal_proesc.cycle_review_cache where id=(p_payload->>'cacheId')::uuid for update;
    if v_old.unit_id<>v_context->>'unitId' or v_old.lease::text is distinct from p_payload->>'lease'
      or v_old.first_year<>(v_context->>'firstYear')::int or v_old.last_year<>(v_context->>'lastYear')::int then
      raise exception 'Concessão de consulta inválida.' using errcode='42501'; end if;
    if v_old.state='FETCHING' then
      update internal_proesc.cycle_review_cache set lease_until=now(),
        state=case when verified_observed_at is not null then 'COMPLETE' else 'FETCHING' end,
        observed_at=coalesce(verified_observed_at,observed_at) where id=v_old.id;
    end if;
    return jsonb_build_object('released',true);
  end if;
  if p_action='begin' then
    select * into v_old from internal_proesc.cycle_review_cache
      where unit_id=v_context->>'unitId' and first_year=(v_context->>'firstYear')::int
        and last_year=(v_context->>'lastYear')::int;
  elsif p_action='complete' and p_payload ? 'sourceObservedAt' then
    v_observed:=(p_payload->>'sourceObservedAt')::timestamptz;
    if v_observed is null or not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 seconds'
      or v_observed<=clock_timestamp()-interval '5 minutes' then
      raise exception 'Data real da coleta está fora da validade.' using errcode='22023'; end if;
  end if;
  v_result:=public.proesc_cycle_review_cache_before_automatic(p_action,p_actor_id,p_matricula_id,p_payload);
  if p_action='begin' and v_result->'cached'='false' then
    -- A failed refresh must not erase the last known classification. The
    -- FETCHING state still prevents using that source as a fresh issuance proof.
    update internal_proesc.cycle_review_cache set
      source_hash=case when token_revision=v_old.token_revision and class_ids=v_old.class_ids then v_old.source_hash end,
      obligations=case when token_revision=v_old.token_revision and class_ids=v_old.class_ids then v_old.obligations end,
      verified_observed_at=case when token_revision=v_old.token_revision and class_ids=v_old.class_ids
        then v_old.verified_observed_at end where id=(v_result->>'cacheId')::uuid;
  elsif p_action='complete' then
    update internal_proesc.cycle_review_cache set
      observed_at=least(observed_at,coalesce(v_observed,observed_at)),
      verified_observed_at=least(observed_at,coalesce(v_observed,observed_at))
      where id=(v_result->>'cacheId')::uuid;
  end if;
  return v_result;
end;
$$;

create function internal_proesc.api_cycle_schedule_matches_source(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from internal_proesc.enrollment_cycle_evidence e
    join internal_proesc.cycle_review_cache c on c.id::text=e.source_evidence->>'cacheId'
    join internal_proesc.connection token on token.id
    where e.matricula_id=p_matricula_id and e.evidence_kind='API_SCHEDULE_REVIEW'
      and e.classification='C1' and e.verification='CONFIRMED'
      and c.token_revision=token.revision and c.source_hash=e.source_evidence->>'sourceHash'
      and internal_proesc.cycle_review_context(p_matricula_id)->>'academicFingerprint'
        =e.source_evidence->>'academicFingerprint'
      and e.obligation_manifest_hash=internal_proesc.enrollment_cycle_manifest_hash(p_matricula_id));
$$;
do $persistent_state$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('internal_proesc.has_confirmed_first_cycle_only(uuid)'::regprocedure);
  if position('then internal_proesc.api_cycle_schedule_is_fresh(m.id)' in v_definition)=0 then
    raise exception 'Cycle guard changed; rebase required.'; end if;
  execute replace(v_definition,'then internal_proesc.api_cycle_schedule_is_fresh(m.id)',
    'then internal_proesc.api_cycle_schedule_matches_source(m.id)');
  v_definition:=pg_get_functiondef('internal_academic.technical_manual_cycle_state(uuid)'::regprocedure);
  if position('Confira os ciclos no Proesc para verificar se esta matrícula possui somente o primeiro ciclo.' in v_definition)=0 then
    raise exception 'Cycle state message changed; rebase required.'; end if;
  execute replace(v_definition,
    'Confira os ciclos no Proesc para verificar se esta matrícula possui somente o primeiro ciclo.',
    'A consulta automática ainda não confirmou que esta matrícula possui somente o primeiro ciclo.');
end;
$persistent_state$;

create function internal_proesc.assert_fresh_cycle_generation(p_matricula_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_seed boolean; v_status text; v_source_ready boolean;
begin
  select s.batch_id is null,m.status,a.source_verified and a.source_status='CURSANDO'
    into v_seed,v_status,v_source_ready from public.matriculas m
    join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    left join internal_proesc.enrollment_sources a on a.matricula_id=m.id and a.scope_id=s.id
    where m.id=p_matricula_id and s.phase='CONFIRMED'
      and (s.batch_id is not null or s.financial_mode='CICLO1_PROESC');
  if not found then return; end if;
  if (v_seed and v_status not in ('ATIVO','PENDENTE'))
    or (not v_seed and (v_status<>'ATIVO' or not coalesce(v_source_ready,false))) then
    raise exception 'A situação acadêmica não permite gerar um novo ciclo.' using errcode='42501'; end if;
  if not internal_proesc.api_cycle_schedule_is_fresh(p_matricula_id) then
    raise exception 'A consulta automática Proesc precisa ser atualizada antes de gerar o ciclo.' using errcode='42501'; end if;
end;
$$;
alter function internal_academic.technical_manual_cycle_preview(uuid,integer,date)
  rename to technical_manual_cycle_preview_before_automatic_proesc;
create function internal_academic.technical_manual_cycle_preview(
  p_matricula_id uuid,p_cycle_number integer,p_first_due_date date default null
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform internal_proesc.assert_fresh_cycle_generation(p_matricula_id);
  return internal_academic.technical_manual_cycle_preview_before_automatic_proesc(
    p_matricula_id,p_cycle_number,p_first_due_date);
end;
$$;
create function internal_proesc.guard_fresh_cycle_generation_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.matricula_id is null or upper(coalesce(new.tipo_lancamento,'')) not in ('MATRICULA','REMATRICULA','PARCELA')
    or not exists(select 1 from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
      where m.id=new.matricula_id) then return new; end if;
  if internal_academic.is_authorized_external_history_insert(new) then return new; end if;
  perform internal_proesc.assert_fresh_cycle_generation(new.matricula_id);
  return new;
end;
$$;
create trigger guard_proesc_fresh_cycle_generation before insert on public.contas_receber
  for each row execute function internal_proesc.guard_fresh_cycle_generation_insert();
revoke all on function public.proesc_cycle_review_cache_before_automatic(text,uuid,uuid,jsonb),
  public.proesc_cycle_review_cache_service(text,uuid,uuid,jsonb),
  internal_proesc.api_cycle_schedule_matches_source(uuid),internal_proesc.assert_fresh_cycle_generation(uuid),
  internal_proesc.guard_fresh_cycle_generation_insert(),
  internal_academic.technical_manual_cycle_preview_before_automatic_proesc(uuid,integer,date),
  internal_academic.technical_manual_cycle_preview(uuid,integer,date)
  from public,anon,authenticated,service_role;
grant execute on function public.proesc_cycle_review_cache_service(text,uuid,uuid,jsonb) to service_role;
commit;
