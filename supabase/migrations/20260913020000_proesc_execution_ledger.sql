begin;

create function internal_proesc.sync_safe_error_code(p_code text)
returns text language sql immutable set search_path='' as $$
  select case when p_code is null then null when p_code in (
    'INVALID_REQUEST','HTTP_ERROR','REDIRECT','TIMEOUT','ABORTED','TRANSPORT_ERROR',
    'RESPONSE_LIMIT','INVALID_RESPONSE','SEMANTIC_ERROR','CREDENTIAL_UNAVAILABLE',
    'CREDENTIAL_CHANGED','OBSERVATION_ERROR','SNAPSHOT_REJECTED','APPLY_REJECTED',
    'INTERNAL_ERROR','LEASE_EXPIRED') then p_code else 'INTERNAL_ERROR' end;
$$;
create function internal_proesc.sync_error_message(p_code text)
returns text language sql immutable set search_path='' as $$
  select case p_code
    when 'HTTP_ERROR' then 'O Proesc recusou ou não concluiu a consulta.'
    when 'REDIRECT' then 'Redirecionamento bloqueado durante a consulta.'
    when 'TIMEOUT' then 'A consulta excedeu o prazo permitido.'
    when 'ABORTED' then 'A consulta foi interrompida.'
    when 'TRANSPORT_ERROR' then 'Não foi possível conectar ao Proesc.'
    when 'RESPONSE_LIMIT' then 'A resposta excedeu o limite seguro.'
    when 'INVALID_RESPONSE' then 'O Proesc retornou uma resposta inválida ou incompleta.'
    when 'SEMANTIC_ERROR' then 'O Proesc informou falha na consulta.'
    when 'INVALID_REQUEST' then 'Os parâmetros internos da consulta são inválidos.'
    when 'CREDENTIAL_UNAVAILABLE' then 'A credencial configurada não está disponível para consulta.'
    when 'CREDENTIAL_CHANGED' then 'A credencial mudou durante a consulta.'
    when 'OBSERVATION_ERROR' then 'Não foi possível conferir a obrigação.'
    when 'SNAPSHOT_REJECTED' then 'Não foi possível registrar a conferência.'
    when 'APPLY_REJECTED' then 'Não foi possível confirmar a aplicação da baixa; a obrigação requer conferência.'
    when 'LEASE_EXPIRED' then 'A execução não informou conclusão antes de expirar sua concessão.'
    when null then null
    else case when p_code is null then null else 'Falha interna durante a consulta Proesc.' end end;
$$;

-- Only executions claimed after this migration are logged. No historical runs
-- are inferred from imports, snapshots or the HTTP-enqueue cron job.
create table internal_proesc.sync_runs (
  id uuid primary key,
  actor_id uuid not null references public.usuarios_sistema(id),
  started_at timestamptz not null,
  lease_until timestamptz not null,
  finished_at timestamptz,
  abandoned_at timestamptz,
  status text not null check(status in ('RUNNING','SUCCEEDED','PARTIAL','FAILED','ABANDONED')),
  duration_ms integer check(duration_ms>=0),
  claimed integer not null check(claimed between 1 and 60),
  consulted integer not null default 0 check(consulted between 0 and 60),
  applied integer not null default 0 check(applied between 0 and 60),
  unchanged integer not null default 0 check(unchanged between 0 and 60),
  review integer not null default 0 check(review between 0 and 60),
  failed integer not null default 0 check(failed between 0 and 60),
  error_code text check(error_code=internal_proesc.sync_safe_error_code(error_code)),
  stage text check(stage in ('CLAIM','CREDENTIAL','FETCH','OBSERVE','SNAPSHOT','APPLY','FINISH','RUNTIME')),
  telemetry_complete boolean not null default false
);
create table internal_proesc.sync_run_items (
  run_id uuid not null references internal_proesc.sync_runs(id),
  link_id uuid not null references internal_proesc.obligation_links(id),
  position integer not null check(position between 1 and 60),
  polo_id uuid not null references public.polos(id),
  class_id uuid not null references public.turmas(id),
  snapshot_id uuid references internal_proesc.financial_snapshots(id),
  result text not null default 'QUEUED' check(result in ('QUEUED','APPLIED','UNCHANGED','REVIEW','FAILED','NOT_RECORDED')),
  stage text check(stage in ('OBSERVE','SNAPSHOT','APPLY')),
  error_code text check(error_code=internal_proesc.sync_safe_error_code(error_code)),
  recorded_at timestamptz,
  primary key(run_id,link_id),unique(run_id,position)
);
create table internal_proesc.sync_run_http (
  run_id uuid not null references internal_proesc.sync_runs(id),
  source_unit_id text not null check(source_unit_id ~ '^[0-9]{1,18}$'),
  source_year integer not null check(source_year between 1900 and 2200),
  source_month integer not null check(source_month between 1 and 12),
  http_status integer check(http_status between 100 and 599),
  duration_ms integer not null check(duration_ms between 0 and 120000),
  error_code text check(error_code=internal_proesc.sync_safe_error_code(error_code)),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(run_id,source_unit_id,source_year,source_month)
);
create index proesc_sync_runs_time_idx on internal_proesc.sync_runs(started_at desc,id desc);
create index proesc_sync_items_scope_idx on internal_proesc.sync_run_items(polo_id,run_id);
create index proesc_sync_items_snapshot_idx on internal_proesc.sync_run_items(snapshot_id);
alter table internal_proesc.sync_runs enable row level security;
alter table internal_proesc.sync_run_items enable row level security;
alter table internal_proesc.sync_run_http enable row level security;
revoke all on internal_proesc.sync_runs,internal_proesc.sync_run_items,internal_proesc.sync_run_http
  from public,anon,authenticated,service_role;

create function internal_proesc.start_sync_run(p_actor_id uuid,p_lease_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_state internal_proesc.sync_runtime; v_count integer;
begin
  select * into strict v_state from internal_proesc.sync_runtime where id for update;
  if v_state.lease_id is distinct from p_lease_id or p_lease_id is null or v_state.lease_until<=now() then
    raise exception 'Concessão inválida para registrar execução.' using errcode='40001'; end if;
  update internal_proesc.sync_runs set status='ABANDONED',error_code='LEASE_EXPIRED',stage='RUNTIME',abandoned_at=clock_timestamp()
    where status='RUNNING' and lease_until<=now();
  insert into internal_proesc.sync_runs(id,actor_id,started_at,lease_until,status,claimed)
    values(p_lease_id,p_actor_id,v_state.last_started_at,v_state.lease_until,'RUNNING',cardinality(v_state.lease_links));
  insert into internal_proesc.sync_run_items(run_id,link_id,position,polo_id,class_id)
    select p_lease_id,l.id,item.ordinal,c.polo_id,l.turma_id
    from unnest(v_state.lease_links) with ordinality item(link_id,ordinal)
    join internal_proesc.obligation_links l on l.id=item.link_id
    join public.contas_receber c on c.id=l.receivable_id;
  get diagnostics v_count=row_count;
  if v_count<>cardinality(v_state.lease_links) then
    raise exception 'Vínculos da execução não foram preservados.' using errcode='40001'; end if;
end;
$$;

create function internal_proesc.finish_sync_run(p_state internal_proesc.sync_runtime,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_run internal_proesc.sync_runs;
  v_telemetry jsonb:=p_payload->'telemetry';
  v_item jsonb;
  v_key text;
  v_link uuid;
  v_snapshot uuid;
  v_seen uuid[]:=array[]::uuid[];
  v_complete boolean:=false;
  v_finished timestamptz:=clock_timestamp();
begin
  select * into v_run from internal_proesc.sync_runs where id=p_state.lease_id for update;
  -- A lease already active when the migration was installed has no run record.
  if not found then return; end if;
  if v_run.status<>'RUNNING' or p_state.lease_until<now() then
    raise exception 'Execução fora da concessão atual.' using errcode='40001'; end if;
  foreach v_key in array array['consulted','applied','unchanged','review','failed'] loop
    if not coalesce(p_payload->'counts'->>v_key ~ '^[0-9]{1,2}$',false)
      or (p_payload->'counts'->>v_key)::integer>v_run.claimed then
      raise exception 'Contador de execução inválido.' using errcode='22023'; end if;
  end loop;
  if v_telemetry is not null then
    if jsonb_typeof(v_telemetry)<>'object'
      or v_telemetry-array['http','items','errorCode','stage']<>'{}'::jsonb
      or jsonb_typeof(v_telemetry->'http') is distinct from 'array'
      or jsonb_typeof(v_telemetry->'items') is distinct from 'array'
      or jsonb_array_length(v_telemetry->'http')>256 or jsonb_array_length(v_telemetry->'items')>60 then
      raise exception 'Telemetria de execução inválida.' using errcode='22023'; end if;
    for v_item in select value from jsonb_array_elements(v_telemetry->'http') loop
      if jsonb_typeof(v_item)<>'object' or v_item-array['unitId','year','month','httpStatus','durationMs','errorCode']<>'{}'::jsonb
        or not coalesce(v_item->>'unitId' ~ '^[0-9]{1,18}$',false)
        or not exists(select 1 from internal_proesc.sync_run_items i
          join internal_proesc.obligation_links l on l.id=i.link_id where i.run_id=v_run.id and l.source_unit_id=v_item->>'unitId') then
        raise exception 'Consulta HTTP fora do escopo.' using errcode='22023'; end if;
      insert into internal_proesc.sync_run_http(run_id,source_unit_id,source_year,source_month,http_status,duration_ms,error_code)
        values(v_run.id,v_item->>'unitId',(v_item->>'year')::integer,(v_item->>'month')::integer,
          nullif((v_item->>'httpStatus')::integer,0),(v_item->>'durationMs')::integer,
          internal_proesc.sync_safe_error_code(v_item->>'errorCode'));
    end loop;
    for v_item in select value from jsonb_array_elements(v_telemetry->'items') loop
      if jsonb_typeof(v_item)<>'object' or v_item-array['linkId','snapshotId','result','stage','errorCode']<>'{}'::jsonb then
        raise exception 'Registro de obrigação inválido.' using errcode='22023'; end if;
      v_link:=(v_item->>'linkId')::uuid; v_snapshot:=(v_item->>'snapshotId')::uuid;
      if v_link is null or v_link=any(v_seen) or not coalesce(v_link=any(p_state.lease_links),false)
        or v_item->>'result' not in ('APPLIED','UNCHANGED','REVIEW','FAILED')
        or (v_snapshot is not null and not exists(select 1 from internal_proesc.financial_snapshots s
          where s.id=v_snapshot and s.link_id=v_link and s.recorded_at>=v_run.started_at)) then
        raise exception 'Registro fora do lote consultado.' using errcode='22023'; end if;
      if v_item->>'result'='APPLIED' and not exists(select 1 from internal_proesc.reconciliation_events e
        where e.link_id=v_link and e.snapshot_id=v_snapshot and e.mode='AUTO' and e.result='APPLIED'
          and e.recorded_at>=v_run.started_at) then
        raise exception 'Baixa automática sem evento comprovado.' using errcode='22023'; end if;
      v_seen:=array_append(v_seen,v_link);
      update internal_proesc.sync_run_items set snapshot_id=v_snapshot,result=v_item->>'result',
        stage=v_item->>'stage',error_code=internal_proesc.sync_safe_error_code(v_item->>'errorCode'),recorded_at=v_finished
        where run_id=v_run.id and link_id=v_link;
    end loop;
    if exists(select 1 from (
      select count(*) filter(where snapshot_id is not null) consulted,
        count(*) filter(where result='APPLIED') applied,count(*) filter(where result='UNCHANGED') unchanged,
        count(*) filter(where result='REVIEW') review,count(*) filter(where result='FAILED') failed
      from internal_proesc.sync_run_items where run_id=v_run.id
    ) c where c.consulted<>(p_payload->'counts'->>'consulted')::integer
      or c.applied<>(p_payload->'counts'->>'applied')::integer
      or c.unchanged<>(p_payload->'counts'->>'unchanged')::integer
      or c.review<>(p_payload->'counts'->>'review')::integer
      or c.failed>(p_payload->'counts'->>'failed')::integer) then
      raise exception 'Contadores não conferem com os itens observados.' using errcode='22023'; end if;
    v_complete:=cardinality(v_seen)=v_run.claimed;
  end if;
  update internal_proesc.sync_run_items set result='NOT_RECORDED'
    where run_id=v_run.id and result='QUEUED';
  update internal_proesc.sync_runs set finished_at=v_finished,
    duration_ms=greatest(0,round(extract(epoch from v_finished-started_at)*1000))::integer,
    status=case when (p_payload->>'success')::boolean then 'SUCCEEDED'
      when (p_payload->'counts'->>'consulted')::integer>0 then 'PARTIAL' else 'FAILED' end,
    consulted=(p_payload->'counts'->>'consulted')::integer,applied=(p_payload->'counts'->>'applied')::integer,
    unchanged=(p_payload->'counts'->>'unchanged')::integer,review=(p_payload->'counts'->>'review')::integer,
    failed=(p_payload->'counts'->>'failed')::integer,
    error_code=internal_proesc.sync_safe_error_code(v_telemetry->>'errorCode'),
    stage=case when v_telemetry->>'stage' in ('CLAIM','CREDENTIAL','FETCH','OBSERVE','SNAPSHOT','APPLY','FINISH','RUNTIME')
      then v_telemetry->>'stage' end,telemetry_complete=v_complete
    where id=v_run.id;
end;
$$;
revoke all on function internal_proesc.sync_safe_error_code(text),internal_proesc.sync_error_message(text),
  internal_proesc.start_sync_run(uuid,uuid),internal_proesc.finish_sync_run(internal_proesc.sync_runtime,jsonb)
  from public,anon,authenticated,service_role;
commit;
