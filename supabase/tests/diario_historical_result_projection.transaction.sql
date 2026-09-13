-- Run after historical migrations inside the caller's rollback transaction.
-- These synthetic composites do not insert people, enrollments or diaries.
do $historical_projection$
declare
  v_source internal_academic.diario_resultados_importados;
  v_result record;
  v_routine text;
  v_claims text;
  v_role text;
  v_subject text;
  v_blocked boolean := false;
begin
  v_source := jsonb_populate_record(null::internal_academic.diario_resultados_importados,
    '{"notas_estado":"CONFERIDO","frequencia_estado":"CONFERIDO",
      "media_parcial":5.3,"media_final":5.3,"nota_rec":8.5,
      "frequencia_percent":100,"total_faltas":0,
      "aulas_registradas":4,"frequencias_lancadas":4,
      "resultado_documental":"REPROVADO"}'::jsonb);
  select * into strict v_result from internal_academic.resolve_diario_historical_result(v_source);
  assert v_result.media_parcial = 5.3 and v_result.media_final = 5.3
    and v_result.nota_rec = 8.5, 'The resolver recalculated a documented average';
  assert v_result.nota_p is null and v_result.nota_ti is null and v_result.nota_tg is null,
    'Historical evidence became regular assessment inputs';
  assert v_result.total_aulas = 4 and v_result.total_faltas = 0
    and v_result.frequencia_percent = 100, 'Confirmed attendance was changed';
  assert v_result.resultado_final = 'REPROVADO', 'Documented result was inferred again';

  v_source.media_parcial := 0;
  v_source.media_final := 0;
  v_source.nota_rec := null;
  select * into strict v_result from internal_academic.resolve_diario_historical_result(v_source);
  assert v_result.media_parcial = 0 and v_result.media_final = 0,
    'An explicit zero was treated as a blank';

  v_source.media_final := 8.3;
  v_source.media_parcial := null;
  v_source.resultado_documental := 'APROVADO';
  select * into strict v_result from internal_academic.resolve_diario_historical_result(v_source);
  assert v_result.media_parcial is null and v_result.media_final = 8.3,
    'A documented final manufactured a partial';
  assert v_result.resultado_final = 'APROVADO', 'A complete documented result was lost';

  v_source.notas_estado := 'EM_CONFERENCIA';
  v_source.media_parcial := 10;
  v_source.media_final := 10;
  v_source.nota_rec := 9;
  select * into strict v_result from internal_academic.resolve_diario_historical_result(v_source);
  assert v_result.media_parcial is null and v_result.media_final is null
    and v_result.nota_rec is null, 'Review values leaked into academic results';
  assert v_result.resultado_final = 'EM_CONFERENCIA', 'Review was approved';
  assert v_result.frequencia_percent = 100, 'Independent confirmed attendance was erased';

  v_source.notas_estado := 'CONFERIDO';
  v_source.frequencia_estado := 'EM_CONFERENCIA';
  select * into strict v_result from internal_academic.resolve_diario_historical_result(v_source);
  assert v_result.frequencia_percent is null and v_result.total_faltas is null,
    'Incomplete attendance was exposed as a confirmed zero';
  assert v_result.media_final = 10 and v_result.resultado_final = 'EM_CONFERENCIA',
    'Attendance review either erased a known grade or approved the student';

  v_source.frequencia_estado := 'CONFERIDO';
  v_source.resultado_documental := null;
  select * into strict v_result from internal_academic.resolve_diario_historical_result(v_source);
  assert v_result.resultado_final = 'EM_CONFERENCIA', 'A good grade inferred source approval';
  v_source.resultado_documental := 'APROVEITADO';
  select * into strict v_result from internal_academic.resolve_diario_historical_result(v_source);
  assert v_result.resultado_final = 'EM_CONFERENCIA', 'Import manufactured an exemption';
  v_source.resultado_documental := 'APROVADO';
  v_source.media_final := null;
  select * into strict v_result from internal_academic.resolve_diario_historical_result(v_source);
  assert v_result.media_final is null and v_result.resultado_final = 'EM_CONFERENCIA',
    'An approval label manufactured a grade';

  assert not has_table_privilege('authenticated',
    'internal_academic.diario_resultados_importados', 'SELECT'), 'Private evidence became public';
  assert not has_function_privilege('authenticated',
    'internal_academic.resolve_diario_historical_result(internal_academic.diario_resultados_importados)',
    'EXECUTE'), 'The pure resolver became a public API';
  assert exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'v_diario_notas_resultados'
      and 'security_invoker=true' = any(c.reloptions)), 'Snapshot lost invoker security';

  foreach v_routine in array array[
    'public.get_diario_resultados(uuid,uuid)',
    'internal_academic.get_enrollment_results(uuid)',
    'internal_academic.get_diario_historical_snapshot_rows()'
  ] loop
    assert position('resolve_diario_historical_result' in pg_get_functiondef(v_routine::regprocedure)) > 0,
      'A result path does not consume the canonical historical projection: ' || v_routine;
  end loop;
  assert exists (select 1 from pg_trigger where tgrelid = 'public.diario_notas'::regclass
    and tgname = 'guard_diario_historical_notes_write' and not tgisinternal), 'Missing grade guard';
  assert exists (select 1 from pg_trigger where tgrelid = 'public.diario_frequencia'::regclass
    and tgname = 'guard_diario_historical_attendance_write' and not tgisinternal), 'Missing attendance guard';
  assert exists (select 1 from pg_trigger where tgrelid = 'public.aulas_turma'::regclass
    and tgname = 'lock_diario_historical_lesson_scope' and not tgisinternal), 'Missing lesson scope lock';
  v_claims := current_setting('request.jwt.claims', true);
  v_role := current_setting('request.jwt.claim.role', true);
  v_subject := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform 1 from public.get_diario_alunos(null, null);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  assert v_blocked, 'Roster access without an identified authorized user was allowed';
  assert not exists (select 1 from internal_academic.get_diario_historical_snapshot_rows()),
    'Historical snapshot exposed rows without an identified authorized user';
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(v_role, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_subject, ''), true);
  raise notice 'Historical projection assertions passed; caller must ROLLBACK';
end;
$historical_projection$;
