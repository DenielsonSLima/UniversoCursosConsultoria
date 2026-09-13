-- Pure source fixtures and rolled-back schema changes; no synthetic fresh evidence.
begin;
/* __TEMPORAL_SCOPE_MIGRATION__ */
do $temporal_contract$
declare v_rows jsonb; v_context jsonb; v_marker jsonb; v_changed jsonb; v_result jsonb;
  v_seed uuid; v_proved uuid; v_date text;
begin
  select jsonb_agg(jsonb_build_object('key',n::text,'classId','2','personHash',repeat('a',64),
    'amountCents',27990,'dueDate',to_char(date '2026-01-15'+((n-1)||' months')::interval,'YYYY-MM-DD'),
    'createdDate','2026-01-01','unsafe',false) order by n) into v_rows from generate_series(1,12) n;
  v_context:=jsonb_build_object('classId','2','personHash',repeat('a',64),
    'startDate','2026-01-01','classStartDate','2026-01-01','academicReady',true,'obligations',v_rows);
  v_marker:=jsonb_build_object('key','99','classId','2','personHash',null,'amountCents',27990,
    'dueDate','2025-06-05','createdDate','2025-01-01','unsafe',true,
    'ambiguity','MISSING_CLASS_ID','unidentifiedGroupLatestDate','2025-06-05');
  v_result:=internal_proesc.evaluate_api_cycle_schedule(v_context,v_rows||jsonb_build_array(v_marker));
  assert v_result->>'classification'='C1' and v_result->'unidentifiedBeforeClassCount'='1';
  for v_changed in select value from jsonb_array_elements(jsonb_build_array(
    v_marker-'unidentifiedGroupLatestDate',
    v_marker||'{"unidentifiedGroupLatestDate":null}',
    v_marker||'{"unidentifiedGroupLatestDate":"2026-01-01"}',
    v_marker||'{"unidentifiedGroupLatestDate":"2026-06-01"}',
    v_marker||'{"ambiguity":"CONFLICTING_IDENTITY"}',
    v_marker||jsonb_build_object('personHash',repeat('a',64)),
    v_marker||'{"key":"1"}'
  )) loop
    assert internal_proesc.evaluate_api_cycle_schedule(v_context,v_rows||jsonb_build_array(v_changed))
      ->>'classification'='UNKNOWN','Relevant or unproven source ambiguity must remain blocked';
  end loop;
  assert internal_proesc.evaluate_api_cycle_schedule(v_context-'classStartDate',
    v_rows||jsonb_build_array(v_marker))->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context||'{"classStartDate":"2025-01-01"}',
    v_rows||jsonb_build_array(v_marker))->>'classification'='UNKNOWN',
    'Late enrollment must not replace the earlier class start as the cutoff';
  -- Current stored caches predate the new group-wide proof: nothing is silently reclassified.
  select m.id into strict v_seed from public.matriculas m join internal_proesc.class_scopes s
    on s.turma_id=m.turma_id where s.class_code='ENF-T42-INT-MAT' order by m.id limit 1;
  assert internal_proesc.cycle_review_context(v_seed)->>'classStartDate'='2025-09-01';
  assert position('classStartDate' in pg_get_functiondef(
    'internal_proesc.api_cycle_schedule_is_fresh(uuid)'::regprocedure))>0;
  assert position('classStartDate' in pg_get_functiondef(
    'internal_proesc.api_cycle_schedule_matches_source(uuid)'::regprocedure))>0;
  select e.matricula_id into strict v_proved from internal_proesc.enrollment_cycle_evidence e
    join internal_proesc.class_scopes s on s.id=e.scope_id
    where s.class_code='ENF-T43-INT-MAT' and e.classification='C1' order by e.matricula_id limit 1;
  v_date:=internal_proesc.cycle_review_context(v_proved)->>'classStartDate';
  assert not internal_proesc.api_cycle_schedule_matches_source(v_proved),
    'Evidence predating the new class-start binding must wait for source re-review';
  update internal_proesc.enrollment_cycle_evidence set source_evidence=source_evidence
    ||jsonb_build_object('classStartDate',v_date) where matricula_id=v_proved;
  assert internal_proesc.api_cycle_schedule_matches_source(v_proved),
    'Same observed source and matching class start retain persistent C1';
  update internal_proesc.enrollment_cycle_evidence set source_evidence=source_evidence
    ||jsonb_build_object('classStartDate',((v_date)::date-1)::text) where matricula_id=v_proved;
  assert not internal_proesc.api_cycle_schedule_matches_source(v_proved),
    'Different class start invalidates the previously derived evidence';
end;
$temporal_contract$;
select 'Anonymous complete groups before class start are scoped; current, identified, linked and unproven groups remain blocked.' as result;
rollback;
