-- Retain anonymous source evidence while respecting the confirmed class start.
begin;
do $class_context$
declare v_definition text; v_helper text;
begin
  v_definition:=pg_get_functiondef('internal_proesc.cycle_review_context(uuid)'::regprocedure);
  if position('''startDate'',greatest(' in v_definition)=0 then
    raise exception 'Academic source context changed; rebase required.'; end if;
  execute replace(v_definition,'''startDate'',greatest(',
    '''classStartDate'',coalesce((s.class_spec->>''startDate'')::date,t.data_inicio),''startDate'',greatest(');
  foreach v_helper in array array['api_cycle_schedule_is_fresh','api_cycle_schedule_matches_source'] loop
    v_definition:=pg_get_functiondef(('internal_proesc.'||v_helper||'(uuid)')::regprocedure);
    if position('and e.obligation_manifest_hash=internal_proesc.enrollment_cycle_manifest_hash(p_matricula_id)' in v_definition)=0 then
      raise exception 'Source fingerprint guard changed; rebase required.'; end if;
    execute replace(v_definition,
      'and e.obligation_manifest_hash=internal_proesc.enrollment_cycle_manifest_hash(p_matricula_id)',
      'and internal_proesc.cycle_review_context(p_matricula_id)->>''classStartDate''=e.source_evidence->>''classStartDate''
      and e.obligation_manifest_hash=internal_proesc.enrollment_cycle_manifest_hash(p_matricula_id)');
  end loop;
end;
$class_context$;
alter function internal_proesc.evaluate_api_cycle_schedule(jsonb,jsonb)
  rename to evaluate_api_cycle_schedule_before_temporal_scope;
create function internal_proesc.evaluate_api_cycle_schedule(p_context jsonb,p_rows jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_rows jsonb; v_start date; v_result jsonb; v_ignored integer:=0;
begin
  if p_context->>'classStartDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    v_start:=(p_context->>'classStartDate')::date;
  end if;
  select coalesce(jsonb_agg(r) filter(where not excluded),'[]'),
    count(*) filter(where excluded and r->>'classId'=p_context->>'classId')
    into v_rows,v_ignored from (
      select r,coalesce(v_start is not null and r->>'ambiguity'='MISSING_CLASS_ID'
        and r->'unsafe'='true' and r->>'personHash' is null
        and r->>'unidentifiedGroupLatestDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and (r->>'unidentifiedGroupLatestDate')::date<v_start
        and not exists(select 1 from jsonb_array_elements(p_context->'obligations') l
          where l->>'key'=r->>'key'),false) excluded
      from jsonb_array_elements(p_rows) r
    ) markers;
  -- Keep and hash the complete source cache; only the per-enrollment view is scoped.
  v_result:=internal_proesc.evaluate_api_cycle_schedule_before_temporal_scope(p_context,v_rows);
  return v_result||jsonb_build_object('classStartDate',v_start,
    'unidentifiedBeforeClassCount',v_ignored);
end;
$$;
revoke all on function internal_proesc.evaluate_api_cycle_schedule(jsonb,jsonb),
  internal_proesc.evaluate_api_cycle_schedule_before_temporal_scope(jsonb,jsonb)
  from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
