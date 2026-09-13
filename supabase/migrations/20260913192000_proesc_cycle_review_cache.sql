-- Bounded API preflight. No receivable, payment or gateway mutation.
begin;

create table internal_proesc.cycle_review_cache (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null,
  first_year integer not null,
  last_year integer not null,
  class_ids jsonb not null,
  token_revision uuid not null,
  state text not null check(state in ('FETCHING','COMPLETE')),
  lease uuid not null,
  observed_at timestamptz not null,
  lease_until timestamptz not null,
  completed_at timestamptz,
  source_hash text,
  obligations jsonb,
  unique(unit_id,first_year,last_year),
  check(last_year between first_year and first_year+5)
);
alter table internal_proesc.cycle_review_cache enable row level security;
revoke all on internal_proesc.cycle_review_cache from public,anon,authenticated,service_role;

-- Evaluate the existing financial permissions as the verified service actor.
-- The caller cannot supply claims, roles or another authentication identity.
create function internal_proesc.authorize_cycle_review(p_actor_id uuid,p_matricula_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_actor public.usuarios_sistema%rowtype;
  v_claims text:=current_setting('request.jwt.claims',true);
  v_role text:=current_setting('request.jwt.claim.role',true);
  v_sub text:=current_setting('request.jwt.claim.sub',true);
  v_allowed boolean;
  v_class uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Acesso interno obrigatório.' using errcode='42501'; end if;
  select * into strict v_actor from public.usuarios_sistema where id=p_actor_id
    and lower(status) in ('ativo','active') and lower(perfil)='gestor'
    and auth_user_id is not null;
  select turma_id into strict v_class from public.matriculas where id=p_matricula_id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor.auth_user_id,
    'email',v_actor.email,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_actor.auth_user_id::text,true);
  v_allowed:=public.can_operate_turma_academics(v_class)
    and public.gestor_has_tab('gestao','financeiro');
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_role,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  if not coalesce(v_allowed,false) then
    raise exception 'Sem permissão financeira nesta turma.' using errcode='42501'; end if;
end;
$$;

create function internal_proesc.cycle_review_context(p_matricula_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_start date; v_first date; v_last date;
begin
  select jsonb_build_object('matriculaId',m.id,'scopeId',s.id,'unitId',s.source_unit_id,
    'classId',s.source_class_id,'personHash',internal_proesc.person_document_hash(m.aluno_id),
    'reconciledSeed',s.batch_id is null and s.financial_mode='CICLO1_PROESC',
    'academicFingerprint',coalesce(a.source_fingerprint,encode(extensions.digest(
      jsonb_build_object('enrollment',m.id,'class',m.turma_id,'enrolledAt',m.data_matricula,
        'startDate',t.data_inicio,'status',m.status)::text,'sha256'),'hex')),
    'academicReady',case when s.batch_id is null then s.financial_mode='CICLO1_PROESC'
      and upper(m.status) in ('ATIVO','PENDENTE')
      else upper(m.status)='ATIVO' and a.source_verified and a.source_status='CURSANDO' end,
    'startDate',greatest(coalesce((s.class_spec->>'startDate')::date,t.data_inicio),
      coalesce(a.source_enrolled_at::date,m.data_matricula::date)),
    'manifestHash',internal_proesc.enrollment_cycle_manifest_hash(m.id),
    'classIds',(select jsonb_agg(x.source_class_id order by x.source_class_id)
      from internal_proesc.class_scopes x where x.source_unit_id=s.source_unit_id
        and x.phase='CONFIRMED'),
    'obligations',coalesce((select jsonb_agg(jsonb_build_object('key',l.source_key,
      'amountCents',round(c.valor*100)::bigint,'dueDate',c.data_vencimento)
      order by l.source_key) from internal_proesc.obligation_links l
      join public.contas_receber c on c.id=l.receivable_id
      left join internal_proesc.obligation_imports i on i.link_id=l.id
      where l.matricula_id=m.id and (s.batch_id is null or (i.scope_id=s.id
        and i.source_person_hash=internal_proesc.person_document_hash(m.aluno_id)))), '[]'::jsonb))
    into v_context
  from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
  join public.turmas t on t.id=m.turma_id
  left join internal_proesc.enrollment_sources a on a.matricula_id=m.id and a.scope_id=s.id
  where m.id=p_matricula_id and s.phase='CONFIRMED'
    and ((s.batch_id is not null and s.financial_mode='INDIVIDUAL_REVIEW' and a.matricula_id is not null)
      or (s.batch_id is null and s.financial_mode='CICLO1_PROESC'));
  if v_context is null then
    raise exception 'Matrícula não pertence à conferência individual Proesc.' using errcode='22023'; end if;
  v_start:=(v_context->>'startDate')::date;
  if v_start is null then raise exception 'Data acadêmica confirmada ausente.' using errcode='22023'; end if;
  select least(v_start,min(c.data_vencimento)),greatest(v_start+interval '24 months',max(c.data_vencimento))
    into v_first,v_last from public.contas_receber c
    join internal_proesc.obligation_links l on l.receivable_id=c.id where l.matricula_id=p_matricula_id;
  if extract(year from v_last)-extract(year from v_first)>5 then
    raise exception 'Histórico fora da janela automática; revisão individual necessária.' using errcode='22023'; end if;
  return v_context||jsonb_build_object('firstYear',extract(year from v_first)::integer,
    'lastYear',extract(year from v_last)::integer);
end;
$$;

create function public.proesc_cycle_review_cache_service(
  p_action text,p_actor_id uuid,p_matricula_id uuid,p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_context jsonb;
  v_cache internal_proesc.cycle_review_cache%rowtype;
  v_revision uuid;
  v_rows jsonb:=p_payload->'obligations';
  v_periods jsonb:=p_payload->'periods';
begin
  perform internal_proesc.authorize_cycle_review(p_actor_id,p_matricula_id);
  v_context:=internal_proesc.cycle_review_context(p_matricula_id);
  select revision into strict v_revision from internal_proesc.connection where id;
  if p_action='begin' then
    perform pg_advisory_xact_lock(hashtextextended('proesc:cycle-cache:'||(v_context->>'unitId')
      ||':'||(v_context->>'firstYear')||':'||(v_context->>'lastYear'),0));
    select * into v_cache from internal_proesc.cycle_review_cache
      where unit_id=v_context->>'unitId' and first_year=(v_context->>'firstYear')::integer
        and last_year=(v_context->>'lastYear')::integer for update;
    if v_cache.state='COMPLETE' and v_cache.observed_at>now()-interval '5 minutes'
      and v_cache.token_revision=v_revision and v_cache.class_ids=v_context->'classIds' then
      return jsonb_build_object('context',v_context,'cacheId',v_cache.id,'cached',true); end if;
    if v_cache.state='FETCHING' and v_cache.lease_until>now() then
      return jsonb_build_object('busy',true); end if;
    insert into internal_proesc.cycle_review_cache(unit_id,first_year,last_year,class_ids,
      token_revision,state,lease,observed_at,lease_until)
    values(v_context->>'unitId',(v_context->>'firstYear')::integer,(v_context->>'lastYear')::integer,
      v_context->'classIds',v_revision,'FETCHING',gen_random_uuid(),clock_timestamp(),now()+interval '2 minutes')
    on conflict(unit_id,first_year,last_year) do update set class_ids=excluded.class_ids,
      token_revision=excluded.token_revision,state=excluded.state,lease=excluded.lease,
      observed_at=excluded.observed_at,lease_until=excluded.lease_until,
      completed_at=null,source_hash=null,obligations=null returning * into v_cache;
    return jsonb_build_object('context',v_context,'cacheId',v_cache.id,'cached',false,
      'lease',v_cache.lease,'tokenRevision',v_revision);
  elsif p_action='complete' then
    select * into strict v_cache from internal_proesc.cycle_review_cache
      where id=(p_payload->>'cacheId')::uuid for update;
    if v_cache.state<>'FETCHING' or v_cache.lease::text is distinct from p_payload->>'lease'
      or v_cache.lease_until<now() or v_cache.token_revision<>v_revision
      or v_cache.unit_id<>v_context->>'unitId'
      or v_cache.first_year<>(v_context->>'firstYear')::integer
      or v_cache.last_year<>(v_context->>'lastYear')::integer
      or v_cache.class_ids<>v_context->'classIds' then
      raise exception 'Consulta expirou ou mudou; confira novamente.' using errcode='40001'; end if;
    if jsonb_typeof(v_rows) is distinct from 'array' or jsonb_array_length(v_rows)>50000
      or octet_length(v_rows::text)>16000000 or jsonb_typeof(v_periods) is distinct from 'array'
      or jsonb_array_length(v_periods)<>(v_cache.last_year-v_cache.first_year+1)*12
      or exists(select 1 from generate_series(v_cache.first_year,v_cache.last_year) y
        cross join generate_series(1,12) m where (select count(*) from jsonb_array_elements(v_periods) p
          where (p->>'year')::int=y and (p->>'month')::int=m and p->'complete'='true')<>1)
      or exists(select 1 from jsonb_array_elements(v_rows) r where not coalesce(
        r->>'key' ~ '^[1-9][0-9]*$' and r->>'classId' ~ '^[1-9][0-9]*$'
        and (r->'personHash'='null' or r->>'personHash' ~ '^[0-9a-f]{64}$')
        and jsonb_typeof(r->'unsafe')='boolean' and r->>'amountCents' ~ '^[0-9]+$'
        and r->>'dueDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false)) then
      raise exception 'Coleta completa e identificada obrigatória.' using errcode='22023'; end if;
    update internal_proesc.cycle_review_cache set state='COMPLETE',completed_at=clock_timestamp(),
      obligations=v_rows,source_hash=encode(extensions.digest(v_rows::text,'sha256'),'hex')
      where id=v_cache.id;
    return jsonb_build_object('cacheId',v_cache.id,'complete',true);
  end if;
  raise exception 'Ação de conferência inválida.' using errcode='22023';
end;
$$;
revoke all on function internal_proesc.authorize_cycle_review(uuid,uuid),
  internal_proesc.cycle_review_context(uuid),
  public.proesc_cycle_review_cache_service(text,uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.proesc_cycle_review_cache_service(text,uuid,uuid,jsonb) to service_role;
commit;
