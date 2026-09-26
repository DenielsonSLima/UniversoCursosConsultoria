-- Complete only from fresh, exact source pages; preserve the legacy v24 path.
CREATE OR REPLACE FUNCTION public.proesc_cycle_review_cache_service(p_action text, p_actor_id uuid, p_matricula_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
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
  if p_action='complete' and p_payload->>'resumeVersion'='1' then
    v_observed:=internal_proesc.verify_cycle_page_manifest(
      (p_payload->>'cacheId')::uuid,(p_payload->>'lease')::uuid,p_payload->'pageHashes');
    -- The oldest persisted observation is authoritative, not assembly time.
    p_payload:=p_payload||jsonb_build_object('sourceObservedAt',v_observed);
  elsif p_action='complete' and p_payload ? 'resumeVersion' then
    raise exception 'Versão de retomada inválida.' using errcode='22023';
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
$function$
;
CREATE OR REPLACE FUNCTION public.proesc_cycle_review_runtime_service(p_action text, p_actor_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare v_state internal_proesc.cycle_review_runtime%rowtype; v_revision uuid; v_total integer; v_complete integer; v_success boolean;
begin
  perform internal_proesc.authorize_financial_operator(p_actor_id);
  if p_actor_id is distinct from (select updated_by from internal_proesc.connection where id) then
    raise exception 'Operador da integração mudou.' using errcode='42501'; end if;
  select revision into strict v_revision from internal_proesc.connection where id;
  select * into strict v_state from internal_proesc.cycle_review_runtime where id for update;
  if p_action='claim' then
    if not v_state.enabled or v_state.next_due_at>now() or v_state.lease_until>now() then
      return jsonb_build_object('claimed',false); end if;
    update internal_proesc.cycle_review_runtime set lease_id=gen_random_uuid(),
      lease_until=now()+interval '4 minutes',credential_revision=v_revision,last_started_at=now(),
      completed_ids=case when round_active and credential_revision is not distinct from v_revision
        then completed_ids else array[]::uuid[] end,round_active=true
      where id returning * into v_state;
    return jsonb_build_object('claimed',true,'leaseId',v_state.lease_id);
  elsif p_action='finish' then
    if v_state.lease_id::text is distinct from p_payload->>'leaseId' or v_state.lease_id is null
      or v_state.lease_until<now() or v_state.credential_revision<>v_revision
      or jsonb_typeof(p_payload->'success') is distinct from 'boolean'
      or jsonb_typeof(p_payload->'result') is distinct from 'object' then
      raise exception 'Resultado fora da concessão automática.' using errcode='PT409'; end if;
    select count(*),count(*) filter(where m.id=any(v_state.completed_ids)) into v_total,v_complete
      from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
      where s.phase='CONFIRMED' and (s.batch_id is not null or s.financial_mode='CICLO1_PROESC');
    v_success:=v_complete=v_total;
    update internal_proesc.cycle_review_runtime set lease_id=null,lease_until=null,
      last_finished_at=now(),round_active=not v_success,
      last_result=(p_payload->'result')||jsonb_build_object('success',v_success,
        'reviewed',v_complete,'total',v_total,'remaining',v_total-v_complete),
      next_due_at=now()+case when v_success then interval '1 day'
        when p_payload#>'{result,sourceFailed}'='true'::jsonb then interval '15 minutes'
        when coalesce((p_payload#>>'{result,reviewed}')::int,0)>0 then interval '0 seconds'
        when coalesce((p_payload#>>'{result,pending}')::int,0)>0
          and coalesce((p_payload#>>'{result,progressiveCount}')::int,0)>0
          and p_payload#>'{result,sourceFailed}'='false'::jsonb then interval '0 seconds'
        else interval '15 minutes' end
      where id;
    return jsonb_build_object('finished',true);
  elsif p_action='status' then
    return jsonb_build_object('enabled',v_state.enabled,'nextDueAt',v_state.next_due_at,
      'lastStartedAt',v_state.last_started_at,'lastFinishedAt',v_state.last_finished_at,'result',v_state.last_result);
  end if;
  raise exception 'Ação automática inválida.' using errcode='22023';
end;
$function$
;

-- These business conflicts are permanent for this payload. 40001 causes
-- automatic PostgREST serialization retries and can amplify the same error.
do $patch$
declare v_name text; v_definition text; v_message text;
begin
  for v_name,v_message in select * from (values
    ('public.proesc_cycle_review_cache_before_automatic(text,uuid,uuid,jsonb)',
      'Consulta expirou ou mudou; confira novamente.'),
    ('public.proesc_record_api_cycle_review_service(uuid,uuid,uuid)',
      'Conferência expirou ou mudou; consulte o Proesc novamente.')
  ) x(name,message) loop
    v_definition:=pg_get_functiondef(v_name::regprocedure);
    if position(quote_literal(v_message)||' using errcode=''40001''' in v_definition)=0 then
      raise exception 'Cycle conflict patch contract changed: %',v_name;
    end if;
    execute replace(v_definition,quote_literal(v_message)||' using errcode=''40001''',
      quote_literal(v_message)||' using errcode=''PT409''');
  end loop;
end;
$patch$;
