-- Read-only regression against the deployed RPC; no personal data is returned.
begin;
set local request.jwt.claim.role = 'service_role';
do $test$
declare
  v_polo uuid;
  v_before jsonb;
  v_after jsonb;
  v_expected jsonb;
begin
  for v_polo in select distinct t.polo_id from public.turmas t
    join public.cursos c on c.id = t.curso_id
    where t.status = 'EM_ANDAMENTO' and c.modalidade = 'TECNICO'
  loop
    v_before := internal_academic.p1_get_secretaria_carteirinha_workspace_20260719(v_polo);
    v_after := public.get_secretaria_carteirinha_workspace_secure(v_polo);
    select coalesce(jsonb_agg(e.value order by
      lower(extensions.unaccent(btrim(e.value->>'aluno_nome'))) collate "C", e.ordinality
    ), '[]'::jsonb) into v_expected
    from jsonb_array_elements(v_before->'enrollments') with ordinality e(value, ordinality);
    assert v_after->'enrollments' = v_expected, 'RPC must return alphabetical enrollment order';
    assert v_after - 'enrollments' = v_before - 'enrollments', 'Other workspace fields changed';
    -- Stable ties keep each student's original primary (latest) enrollment.
    assert (
      select jsonb_object_agg(aluno_id, enrollment_id) from (
        select distinct on (e.value->>'aluno_id') e.value->>'aluno_id' aluno_id,
          e.value->>'enrollment_id' enrollment_id
        from jsonb_array_elements(v_before->'enrollments') with ordinality e(value, ordinality)
        order by e.value->>'aluno_id', e.ordinality
      ) original
    ) is not distinct from (
      select jsonb_object_agg(aluno_id, enrollment_id) from (
        select distinct on (e.value->>'aluno_id') e.value->>'aluno_id' aluno_id,
          e.value->>'enrollment_id' enrollment_id
        from jsonb_array_elements(v_after->'enrollments') with ordinality e(value, ordinality)
        order by e.value->>'aluno_id', e.ordinality
      ) sorted
    ), 'Primary enrollment changed';
  end loop;
  assert not has_function_privilege('anon',
    'public.get_secretaria_carteirinha_workspace_secure(uuid)', 'execute');
end;
$test$;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '';
do $test$
begin
  begin
    perform public.get_secretaria_carteirinha_workspace_secure('44444444-4444-4444-4444-444444444444');
    raise exception 'Unauthorized request unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;
select 'PASS: alphabetical RPC, complete payload, primary enrollment, access guard' as result;
rollback;
