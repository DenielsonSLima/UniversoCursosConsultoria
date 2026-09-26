-- Bound the sequential monthly GET budget without skipping links or evidence.
-- A lease contains a contiguous prefix, up to 60 links and four unit/months.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

create function internal_proesc.sync_period_budget_prefix(
  p_links jsonb, p_reference_time timestamptz
) returns jsonb language sql immutable security invoker set search_path = ''
as $period_prefix$
  with recursive link_periods as (
    select item.link, item.position,
      array(
        select distinct (item.link->>'unitId') || ':' || left(source_date, 7)
        from unnest(array[
          item.link->>'dueDate', item.link->>'paymentDate',
          to_char(p_reference_time at time zone 'UTC', 'YYYY-MM'),
          to_char((p_reference_time at time zone 'UTC') - interval '1 month', 'YYYY-MM')
        ]) source_date
        where nullif(source_date, '') is not null
      ) as periods
    from jsonb_array_elements(p_links) with ordinality as item(link, position)
    where item.position <= 60
  ), prefix(position, periods) as (
    select 0::bigint, array[]::text[]
    union all
    select candidate.position, combined.periods
    from prefix previous
    join link_periods candidate on candidate.position = previous.position + 1
    cross join lateral (
      select array(select distinct unnest(previous.periods || candidate.periods)) as periods
    ) combined
    where cardinality(combined.periods) <= 4
  )
  select coalesce(jsonb_agg(candidate.link order by candidate.position), '[]'::jsonb)
  from link_periods candidate join prefix using (position);
$period_prefix$;

alter function internal_proesc.sync_period_budget_prefix(jsonb,timestamptz) owner to postgres;
revoke all on function internal_proesc.sync_period_budget_prefix(jsonb,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function internal_proesc.sync_period_budget_prefix(jsonb,timestamptz) to postgres;

do $migration$
declare
  v_function regprocedure := 'public.proesc_sync_runtime_service(text,uuid,jsonb)'::regprocedure;
  v_definition text;
  v_expected text;
  v_metadata jsonb;
  v_claim_anchor constant text := 'into v_links,v_last from batch;';
  v_return_anchor constant text :=
    '''claimed'',true,''leaseId'',v_lease,''lastId'',v_last,''links'',v_links';
begin
  select pg_catalog.pg_get_functiondef(v_function), to_jsonb(p) - 'prosrc'
    into strict v_definition, v_metadata
  from pg_catalog.pg_proc p where p.oid = v_function;
  if md5(v_definition) <> 'a1e7742935e394cede6fe288e57eb83c'
    or (length(v_definition) - length(replace(v_definition, v_claim_anchor, '')))
      / length(v_claim_anchor) <> 1
    or (length(v_definition) - length(replace(v_definition, v_return_anchor, '')))
      / length(v_return_anchor) <> 1 then
    raise exception 'Unexpected Proesc claim contract; inspect live definition before applying.'
      using errcode = '23514';
  end if;

  -- now() is fixed for the transaction: SQL and Edge use the same UTC window.
  -- Trim before persisting lease_links, lease_last_id and start_sync_run.
  v_expected := replace(v_definition, v_claim_anchor, v_claim_anchor || E'\n'
    || '    v_links:=internal_proesc.sync_period_budget_prefix(v_links,now());' || E'\n'
    || '    v_last:=(v_links->-1->>''linkId'')::uuid;');
  v_expected := replace(v_expected, v_return_anchor,
    v_return_anchor || ',''referenceTime'',now()');
  execute v_expected;

  if pg_catalog.pg_get_functiondef(v_function) is distinct from v_expected
    or v_metadata is distinct from (
      select to_jsonb(p) - 'prosrc' from pg_catalog.pg_proc p where p.oid = v_function
    ) then
    raise exception 'Unexpected Proesc claim metadata or authorization change.' using errcode = '23514';
  end if;
end;
$migration$;
commit;
