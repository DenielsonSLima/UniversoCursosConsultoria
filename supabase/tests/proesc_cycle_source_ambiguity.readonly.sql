-- No writes: verify normalized ambiguity cannot release a possible owner.
do $source_ambiguity$
declare v_rows jsonb; v_context jsonb; v_marker jsonb;
begin
  select jsonb_agg(jsonb_build_object('key',n::text,'classId','2','personHash',repeat('a',64),
    'amountCents',27990,'dueDate',to_char(date '2026-01-15'+((n-1)||' months')::interval,'YYYY-MM-DD'),
    'createdDate','2026-01-01','unsafe',false) order by n) into v_rows from generate_series(1,12) n;
  v_context:=jsonb_build_object('classId','2','personHash',repeat('a',64),
    'startDate','2026-01-01','academicReady',true,'obligations',v_rows);
  v_marker:=jsonb_build_object('key','99','classId','2','personHash',repeat('b',64),
    'amountCents',27990,'dueDate','2026-02-15','createdDate','2026-01-01',
    'unsafe',true,'ambiguity','MISSING_CLASS_ID');
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,v_rows||jsonb_build_array(v_marker))
    ->>'classification'='C1','Unrelated identified person must not invalidate this enrollment';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context||jsonb_build_object('personHash',repeat('b',64)),
    v_rows||jsonb_build_array(v_marker))->>'classification'='UNKNOWN',
    'The possible owner of an unclassified obligation must remain blocked';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    v_rows||jsonb_build_array(v_marker||jsonb_build_object('personHash',repeat('a',64))))
    ->>'classification'='UNKNOWN','Every observed owner of a conflicting group must remain blocked';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    v_rows||jsonb_build_array(v_marker||'{"personHash":null}'))
    ->>'classification'='UNKNOWN','Absent identity must prevent claiming absence of a second cycle';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    v_rows||jsonb_build_array(v_marker||'{"classId":"3","personHash":null}'))
    ->>'classification'='C1','An identified different class must not contaminate this class';
end;
$source_ambiguity$;
select 'Ambiguous source blocks possible owners and preserves independent enrollments.' as result;
