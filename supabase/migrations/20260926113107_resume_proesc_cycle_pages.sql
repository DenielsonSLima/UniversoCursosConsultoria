-- Short-lived source evidence for sequential Proesc reads. No names or raw CPF.
-- Reuse by unit/revision/month, not enrollment; bounded independently of traffic.
create table internal_proesc.cycle_review_pages (
  token_revision uuid not null,
  unit_id text not null check (unit_id ~ '^[1-9][0-9]*$'),
  year integer not null check (year between 1900 and 2200),
  month integer not null check (month between 1 and 12),
  observed_at timestamptz not null check (isfinite(observed_at)),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  primary key (token_revision,unit_id,year,month),
  check (jsonb_array_length(rows) < 20000 and octet_length(rows::text) <= 2000000)
);
alter table internal_proesc.cycle_review_pages enable row level security;
revoke all on internal_proesc.cycle_review_pages from public,anon,authenticated,service_role;

create function internal_proesc.valid_cycle_page_rows(p_rows jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare r jsonb; d date;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_rows)>=20000 or octet_length(p_rows::text)>2000000 then return false; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) is distinct from 'array' then return false; end if;
    if jsonb_array_length(r)<>10 or not coalesce(
      jsonb_typeof(r->0)='string' and r->>0 ~ '^[1-9][0-9]{0,79}$'
      and jsonb_typeof(r->1)='boolean'
      and jsonb_typeof(r->2)='number' and r->>2 ~ '^-?[0-9]+$'
      and abs((r->>2)::numeric)<=9007199254740991
      and (r->3='null' or (jsonb_typeof(r->3)='string' and r->>3 ~ '^[1-9][0-9]{0,79}$'))
      and (r->4='null' or (jsonb_typeof(r->4)='string' and r->>4 ~ '^[0-9a-f]{64}$'))
      and jsonb_typeof(r->5)='string' and r->>5 ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and (r->6='null' or (jsonb_typeof(r->6)='string' and r->>6 ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
      and (r->7='null' or jsonb_typeof(r->7)='boolean')
      and (r->8='null' or jsonb_typeof(r->8)='boolean')
      and jsonb_typeof(r->9)='boolean',false) then return false; end if;
    d:=(r->>5)::date;
    if r->6<>'null' then d:=(r->>6)::date; end if;
  end loop;
  return true;
exception when invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  return false;
end;
$$;
revoke all on function internal_proesc.valid_cycle_page_rows(jsonb) from public,anon,authenticated,service_role;

create function public.proesc_cycle_review_pages_service(
  p_action text,p_actor_id uuid,p_matricula_id uuid,p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '2s' as $$
declare
  v_context jsonb; v_revision uuid; v_cache internal_proesc.cycle_review_cache%rowtype;
  v_existing internal_proesc.cycle_review_pages%rowtype;
  v_year integer; v_month integer; v_observed timestamptz; v_rows jsonb;
  v_hash text; v_pages jsonb; v_bytes bigint; v_count integer;
begin
  -- Scope authorization always precedes cache/replay lookup.
  perform internal_proesc.authorize_cycle_review(p_actor_id,p_matricula_id);
  v_context:=internal_proesc.cycle_review_context(p_matricula_id);
  select revision into strict v_revision from internal_proesc.connection where id;
  select * into strict v_cache from internal_proesc.cycle_review_cache
    where id=(p_payload->>'cacheId')::uuid for share;
  if v_cache.state<>'FETCHING' or v_cache.lease::text is distinct from p_payload->>'lease'
    or v_cache.lease_until<=clock_timestamp() or v_cache.token_revision<>v_revision
    or v_cache.unit_id<>v_context->>'unitId' or v_cache.class_ids<>v_context->'classIds'
    or v_cache.first_year<>(v_context->>'firstYear')::int
    or v_cache.last_year<>(v_context->>'lastYear')::int then
    raise exception 'Concessão de consulta expirou ou mudou.' using errcode='PT409'; end if;
  if p_action='read' then
    select coalesce(jsonb_agg(jsonb_build_object('year',year,'month',month,
      'observedAt',observed_at,'rows',rows,'hash',content_hash) order by year,month),'[]')
      into v_pages from internal_proesc.cycle_review_pages
      where token_revision=v_revision and unit_id=v_cache.unit_id
        and year between v_cache.first_year and v_cache.last_year
        and observed_at>clock_timestamp()-interval '5 minutes';
    return jsonb_build_object('version',1,'unitId',v_cache.unit_id,
      'tokenRevision',v_revision,'pages',v_pages);
  elsif p_action is distinct from 'append' then
    raise exception 'Ação de páginas inválida.' using errcode='22023';
  end if;
  v_year:=(p_payload->>'year')::integer; v_month:=(p_payload->>'month')::integer;
  v_observed:=(p_payload->>'observedAt')::timestamptz; v_rows:=p_payload->'rows';
  if v_year is null or v_year not between v_cache.first_year and v_cache.last_year
    or v_month is null or v_month not between 1 and 12
    or v_observed is null or not isfinite(v_observed)
    or v_observed>clock_timestamp()+interval '5 seconds'
    or v_observed<=clock_timestamp()-interval '5 minutes'
    or not internal_proesc.valid_cycle_page_rows(v_rows) then
    raise exception 'Página inválida, incompleta ou fora da validade.' using errcode='22023'; end if;
  -- Hash includes the actual source observation. An identical payload is replayable;
  -- a changed observation must be re-read, never silently substituted at completion.
  v_hash:=encode(extensions.digest(jsonb_build_object('year',v_year,'month',v_month,
    'observedAt',v_observed,'rows',v_rows)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('proesc:cycle-pages:quota',0));
  delete from internal_proesc.cycle_review_pages
    where observed_at<=clock_timestamp()-interval '5 minutes' or token_revision<>v_revision;
  select * into v_existing from internal_proesc.cycle_review_pages
    where token_revision=v_revision and unit_id=v_cache.unit_id and year=v_year and month=v_month;
  if found then
    if v_existing.content_hash<>v_hash then
      raise exception 'Página mudou durante a consulta; retome a leitura.' using errcode='PT409'; end if;
    return jsonb_build_object('saved',false,'reused',true,'hash',v_hash);
  end if;
  select count(*),coalesce(sum(octet_length(rows::text)),0) into v_count,v_bytes
    from internal_proesc.cycle_review_pages;
  if v_count>=256 or v_bytes+octet_length(v_rows::text)>8000000 then
    raise exception 'Limite temporário de conferência atingido.' using errcode='PT409'; end if;
  insert into internal_proesc.cycle_review_pages
    values(v_revision,v_cache.unit_id,v_year,v_month,v_observed,v_rows,v_hash);
  return jsonb_build_object('saved',true,'reused',false,'hash',v_hash);
end;
$$;
revoke all on function public.proesc_cycle_review_pages_service(text,uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.proesc_cycle_review_pages_service(text,uuid,uuid,jsonb) to service_role;

create function internal_proesc.verify_cycle_page_manifest(p_cache_id uuid,p_lease uuid,p_hashes jsonb)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_cache internal_proesc.cycle_review_cache%rowtype; v_min timestamptz; v_count integer;
begin
  select * into strict v_cache from internal_proesc.cycle_review_cache where id=p_cache_id for update;
  if v_cache.state<>'FETCHING' or v_cache.lease is distinct from p_lease
    or v_cache.lease_until<=clock_timestamp() then
    raise exception 'Concessão de coleta expirou.' using errcode='PT409'; end if;
  if jsonb_typeof(p_hashes) is distinct from 'array' then
    raise exception 'Manifesto de páginas obrigatório.' using errcode='22023'; end if;
  if jsonb_array_length(p_hashes)<>(v_cache.last_year-v_cache.first_year+1)*12
    or exists(select 1 from jsonb_array_elements(p_hashes) p where not coalesce(
      jsonb_typeof(p)='object' and p->>'year' ~ '^[0-9]{4}$'
      and p->>'month' ~ '^[0-9]{1,2}$' and p->>'hash' ~ '^[0-9a-f]{64}$',false)) then
    raise exception 'Manifesto incompleto ou inválido.' using errcode='22023'; end if;
  -- Serialize with replacement/pruning; validate the exact pages used by the worker.
  perform pg_advisory_xact_lock(hashtextextended('proesc:cycle-pages:quota',0));
  if exists(select 1 from generate_series(v_cache.first_year,v_cache.last_year) y
    cross join generate_series(1,12) m where (select count(*) from jsonb_array_elements(p_hashes) p
      where (p->>'year')::int=y and (p->>'month')::int=m)<>1) then
    raise exception 'Há lacuna ou repetição no manifesto.' using errcode='22023'; end if;
  select count(*),min(s.observed_at) into v_count,v_min
    from internal_proesc.cycle_review_pages s join jsonb_array_elements(p_hashes) p
      on s.year=(p->>'year')::int and s.month=(p->>'month')::int and s.content_hash=p->>'hash'
    where s.unit_id=v_cache.unit_id and s.token_revision=v_cache.token_revision;
  if v_count<>jsonb_array_length(p_hashes) or v_min is null
    or v_min<=clock_timestamp()-interval '5 minutes' then
    raise exception 'Páginas expiraram ou mudaram; retome a coleta.' using errcode='PT409'; end if;
  return v_min;
end;
$$;
revoke all on function internal_proesc.verify_cycle_page_manifest(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
