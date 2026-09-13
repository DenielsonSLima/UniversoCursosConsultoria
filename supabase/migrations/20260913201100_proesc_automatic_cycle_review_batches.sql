-- Reuse the existing authenticated Proesc worker; never issue or cancel debt.
begin;
create table internal_proesc.cycle_review_runtime (
  id boolean primary key default true check(id),
  enabled boolean not null default true,
  next_due_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  credential_revision uuid,
  round_active boolean not null default false,
  completed_ids uuid[] not null default array[]::uuid[],
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_result jsonb
);
alter table internal_proesc.cycle_review_runtime enable row level security;
revoke all on internal_proesc.cycle_review_runtime from public,anon,authenticated,service_role;
insert into internal_proesc.cycle_review_runtime(id) values(true);

create function public.proesc_cycle_review_runtime_service(
  p_action text,p_actor_id uuid,p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
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
      raise exception 'Resultado fora da concessão automática.' using errcode='40001'; end if;
    select count(*),count(*) filter(where m.id=any(v_state.completed_ids)) into v_total,v_complete
      from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
      where s.phase='CONFIRMED' and (s.batch_id is not null or s.financial_mode='CICLO1_PROESC');
    v_success:=v_complete=v_total;
    update internal_proesc.cycle_review_runtime set lease_id=null,lease_until=null,
      last_finished_at=now(),round_active=not v_success,
      last_result=(p_payload->'result')||jsonb_build_object('success',v_success,
        'reviewed',v_complete,'total',v_total,'remaining',v_total-v_complete),
      next_due_at=now()+case when v_success then interval '1 day'
        when coalesce((p_payload#>>'{result,reviewed}')::int,0)>0 then interval '0 seconds'
        else interval '15 minutes' end
      where id;
    return jsonb_build_object('finished',true);
  elsif p_action='status' then
    return jsonb_build_object('enabled',v_state.enabled,'nextDueAt',v_state.next_due_at,
      'lastStartedAt',v_state.last_started_at,'lastFinishedAt',v_state.last_finished_at,'result',v_state.last_result);
  end if;
  raise exception 'Ação automática inválida.' using errcode='22023';
end;
$$;

create function public.proesc_cycle_review_batch_service(
  p_action text,p_actor_id uuid,p_turma_id uuid default null,p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_enrollment uuid; v_rows jsonb; v_ids jsonb:=p_payload->'matriculaIds'; v_result jsonb;
  v_cache uuid; v_reviewed integer:=0; v_failed integer:=0; v_c1 integer:=0;
  v_full integer:=0; v_unknown integer:=0; v_protected integer:=0; v_eligible integer:=0;
  v_completed uuid[]:=array[]::uuid[]; v_runtime internal_proesc.cycle_review_runtime%rowtype;
begin
  if p_turma_id is null then
    perform internal_proesc.authorize_financial_operator(p_actor_id);
  else
    select m.id into v_enrollment from public.matriculas m
      join internal_proesc.class_scopes s on s.turma_id=m.turma_id
      where m.turma_id=p_turma_id and s.phase='CONFIRMED' order by m.id limit 1;
    if v_enrollment is null then raise exception 'Turma Proesc confirmada não encontrada.' using errcode='22023'; end if;
    perform internal_proesc.authorize_cycle_review(p_actor_id,v_enrollment);
  end if;
  if p_action='targets' then
    with contexts as materialized (
      select m.id,s.turma_id,internal_proesc.cycle_review_context(m.id) ctx
      from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
      where s.phase='CONFIRMED' and (s.batch_id is not null or s.financial_mode='CICLO1_PROESC')
        and (p_turma_id is null or s.turma_id=p_turma_id)
        and (p_turma_id is not null or not m.id=any(coalesce((select completed_ids from internal_proesc.cycle_review_runtime where id),array[]::uuid[])))
    ), groups as (
      select ctx->>'unitId' unit_id,(ctx->>'firstYear')::int first_year,(ctx->>'lastYear')::int last_year,
        jsonb_agg(id order by id) ids from contexts group by 1,2,3
    ) select coalesce(jsonb_agg(jsonb_build_object('unitId',unit_id,'firstYear',first_year,
      'lastYear',last_year,'matriculaIds',ids,'representativeId',ids->>0)
      order by last_year-first_year desc,first_year,last_year),'[]') into v_rows from groups;
    if jsonb_array_length(v_rows)>20 or (select coalesce(sum(jsonb_array_length(g->'matriculaIds')),0)
      from jsonb_array_elements(v_rows) g)>1000 then
      raise exception 'Lote automático excedeu o limite; divida por turma.' using errcode='22023'; end if;
    return jsonb_build_object('turmaId',p_turma_id,'groups',v_rows);
  elsif p_action='record' then
    if p_turma_id is null then
      select * into strict v_runtime from internal_proesc.cycle_review_runtime where id for update;
      if not v_runtime.round_active or v_runtime.lease_id is null
        or v_runtime.lease_id::text is distinct from p_payload->>'workerLease'
        or v_runtime.lease_until<now() or v_runtime.credential_revision is distinct from
          (select revision from internal_proesc.connection where id) then
        raise exception 'Lote fora da concessão automática.' using errcode='42501'; end if;
    end if;
    if jsonb_typeof(v_ids) is distinct from 'array' or jsonb_array_length(v_ids) not between 1 and 20
      or exists(select 1 from jsonb_array_elements_text(v_ids) id where id !~ '^[0-9a-fA-F-]{36}$')
      or (select count(distinct id) from jsonb_array_elements_text(v_ids) id)<>jsonb_array_length(v_ids)
      or (select count(*) from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
        where m.id in(select id::uuid from jsonb_array_elements_text(v_ids) id)
          and s.phase='CONFIRMED' and (p_turma_id is null or s.turma_id=p_turma_id))<>jsonb_array_length(v_ids) then
      raise exception 'Matrículas fora do lote autorizado.' using errcode='42501'; end if;
    v_cache:=(p_payload->>'cacheId')::uuid;
    for v_enrollment in select id::uuid from jsonb_array_elements_text(v_ids) id loop
      begin
        v_result:=public.proesc_record_api_cycle_review_service(p_actor_id,v_enrollment,v_cache);
        v_reviewed:=v_reviewed+1;
        v_completed:=array_append(v_completed,v_enrollment);
        if exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id=v_enrollment)
          or exists(select 1 from internal_academic.technical_external_cycle_coverage where matricula_id=v_enrollment) then
          v_protected:=v_protected+1;
        elsif v_result->>'classification'='C1' then v_c1:=v_c1+1;
        elsif v_result->>'classification'='FULL' then v_full:=v_full+1;
        else v_unknown:=v_unknown+1; end if;
        if v_result->'eligible'='true' then v_eligible:=v_eligible+1; end if;
      exception when others then
        -- No upstream body, identity or SQL message is returned to the client.
        v_failed:=v_failed+1;
      end;
    end loop;
    if p_turma_id is null then
      update internal_proesc.cycle_review_runtime set completed_ids=array(
        select distinct value from unnest(completed_ids||v_completed) value order by value) where id;
    end if;
    return jsonb_build_object('success',v_failed=0,'reviewed',v_reviewed,'failed',v_failed,
      'c1',v_c1,'full',v_full,'unknown',v_unknown,'protected',v_protected,'eligible',v_eligible);
  end if;
  raise exception 'Ação de lote inválida.' using errcode='22023';
end;
$$;
revoke all on function public.proesc_cycle_review_runtime_service(text,uuid,jsonb),
  public.proesc_cycle_review_batch_service(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.proesc_cycle_review_runtime_service(text,uuid,jsonb),
  public.proesc_cycle_review_batch_service(text,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
