-- Run after 20260913040010/11/12 and40030..34, as one transaction, before real ingestion.
-- Existing IDs are selected at runtime; all source text/marks/grades are synthetic.
-- No partner, enrollment, teacher or operational diary record is created/modified.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

create function pg_temp.diario_fixture_field(
  p_sha text,
  p_locator text,
  p_raw text,
  p_value jsonb,
  p_state text default 'CONFERIDO'
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'raw',p_raw,
    'value',p_value,
    'sourceRefs',jsonb_build_array(jsonb_build_object(
      'sha256',p_sha,'part','word/document.xml','locator',p_locator
    )),
    'review',jsonb_build_object(
      'state',p_state,
      'codes',case when p_state='REVIEW'
        then jsonb_build_array('SYNTHETIC_PARTIAL_CONFLICT') else '[]'::jsonb end
    )
  );
$$;

do $test$
declare
  v_turma constant uuid := '6092cf2b-04f2-48ea-9441-4bbef0238023';
  v_disciplina uuid;
  v_professor uuid;
  v_matricula uuid;
  v_aluno uuid;
  v_import uuid;
  v_horas numeric;
  v_horas_aula numeric;
  v_remaining numeric;
  v_n integer := 0;
  v_source text := encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
  v_manifest text := encode(extensions.digest('SYNTHETIC_DIARY_ROLLBACK_MANIFEST','sha256'),'hex');
  v_other_sha text := encode(extensions.digest('WRONG_SOURCE_SHA','sha256'),'hex');
  v_lessons jsonb := '[]'::jsonb;
  v_attendance jsonb := '[]'::jsonb;
  v_results jsonb;
  v_grades jsonb;
  v_grade_row jsonb;
  v_student jsonb;
  v_unresolved jsonb;
  v_payload jsonb;
  v_bad jsonb;
  v_response jsonb;
  v_read jsonb;
  v_before jsonb;
  v_after jsonb;
  v_normal_write_before boolean;
  v_normal_write_after boolean;
  v_count bigint;
  v_lesson_key text;
  v_day date;
  v_state text;
  v_partial numeric;
  v_final numeric;
  v_row jsonb;
begin
  -- Require an empty, assigned context rather than deleting preexisting evidence.
  select td.disciplina_id,td.professor_id,
      coalesce(d.carga_horaria_teoria,0)+coalesce(d.carga_horaria_pratica,0)
    into v_disciplina,v_professor,v_horas
  from public.turmas_disciplinas td
  join public.disciplinas d on d.id=td.disciplina_id
  join public.parceiros p on p.id=td.professor_id and p.tipo='Professor'
  where td.turma_id=v_turma
    and coalesce(d.carga_horaria_teoria,0)+coalesce(d.carga_horaria_pratica,0)>0
    and not exists(select 1 from public.aulas_turma a
      where a.turma_id=td.turma_id and a.disciplina_id=td.disciplina_id)
    and not exists(select 1 from public.diario_notas n
      where n.turma_id=td.turma_id and n.disciplina_id=td.disciplina_id)
    and not exists(select 1 from public.diario_frequencia f
      where f.turma_id=td.turma_id and f.disciplina_id=td.disciplina_id)
    and not exists(select 1 from internal_academic.diario_importacoes i
      where i.turma_id=td.turma_id and i.disciplina_id=td.disciplina_id)
  order by coalesce(d.carga_horaria_teoria,0)+coalesce(d.carga_horaria_pratica,0),td.disciplina_id
  limit 1;
  if v_disciplina is null then
    raise exception 'Fixture requires one empty T42 discipline with an existing assigned teacher.';
  end if;
  select m.id,m.aluno_id,to_jsonb(m) into v_matricula,v_aluno,v_before
  from public.matriculas m where m.turma_id=v_turma and m.status='PENDENTE'
    and not exists(select 1 from public.matricula_componentes c
      where c.matricula_id=m.id and c.disciplina_id=v_disciplina
        and c.tentativa_aprovada_id is not null)
  order by m.id limit 1;
  if v_matricula is null then
    raise exception 'Fixture requires an existing PENDENTE T42 enrollment without an approved dependency in this discipline.';
  end if;
  v_normal_write_before := internal_academic.can_write_student_in_diary(
    v_turma,v_disciplina,v_matricula,v_aluno
  );
  if v_normal_write_before then
    raise exception 'Fixture requires a PENDENTE enrollment without an operational diary release.';
  end if;

  -- Fixture-only lesson distribution; it does not normalize real document hours.
  v_remaining := v_horas;
  while v_remaining>0 loop
    v_n := v_n+1;
    if v_n>200 then raise exception 'Synthetic fixture exceeds the RPC lesson bound.'; end if;
    v_horas_aula := least(20,v_remaining);
    v_remaining := v_remaining-v_horas_aula;
    v_day := date '2020-01-01'+(v_n-1);
    v_lesson_key := encode(extensions.digest(v_source||':lesson:'||v_n,'sha256'),'hex');
    v_lessons := v_lessons||jsonb_build_array(jsonb_build_object(
      'sourceKey',v_lesson_key,
      'date',pg_temp.diario_fixture_field(v_source,
        format('tbl[3]/tr[%s]/tc[1]',v_n+1),to_char(v_day,'DD/MM/YYYY'),to_jsonb(v_day::text)),
      'hours',pg_temp.diario_fixture_field(v_source,
        format('tbl[1]/tr[3]/tc[%s]',v_n+2),v_horas_aula::text||'h',to_jsonb(v_horas_aula)),
      'content',pg_temp.diario_fixture_field(v_source,
        format('tbl[3]/tr[%s]/tc[2]',v_n+1),'Conteúdo sintético','"Conteúdo sintético"'::jsonb),
      'practice',pg_temp.diario_fixture_field(v_source,
        format('tbl[3]/tr[%s]/tc[3]',v_n+1),'Prática sintética','"Prática sintética"'::jsonb)
    ));
    v_attendance := v_attendance||jsonb_build_array(jsonb_build_object(
      'sourceKey',encode(extensions.digest(v_source||':attendance:'||v_n,'sha256'),'hex'),
      'lessonSourceKey',v_lesson_key,
      'value',pg_temp.diario_fixture_field(v_source,
        format('tbl[1]/tr[4]/tc[%s]',v_n+2),'P','"P"'::jsonb)
    ));
  end loop;
  v_results := jsonb_build_object(
    'partial',pg_temp.diario_fixture_field(v_source,'tbl[2]/tr[3]/tc[6]','7,5','7.5','REVIEW'),
    'recovery',pg_temp.diario_fixture_field(v_source,'tbl[2]/tr[3]/tc[7]','-','null','EMPTY'),
    'final',pg_temp.diario_fixture_field(v_source,'tbl[2]/tr[3]/tc[8]','7,5','7.5'),
    'absences',pg_temp.diario_fixture_field(v_source,'tbl[2]/tr[3]/tc[9]','0','0'),
    'frequency',pg_temp.diario_fixture_field(v_source,'tbl[2]/tr[3]/tc[10]','100%','100'),
    'outcome',pg_temp.diario_fixture_field(v_source,'tbl[2]/tr[3]/tc[11]',
      'RESULTADO SINTÉTICO','"RESULTADO SINTÉTICO"')
  );
  v_grades := jsonb_build_array(jsonb_build_object(
    'columnOrdinal',1,
    'category',pg_temp.diario_fixture_field(v_source,'tbl[2]/tr[2]/tc[3]','P','"P"'),
    'value',pg_temp.diario_fixture_field(v_source,'tbl[2]/tr[3]/tc[3]','7,5','7.5')
  ));
  v_grade_row := jsonb_build_object(
    'sourceKey',encode(extensions.digest(v_source||':grade-row','sha256'),'hex'),
    'grades',v_grades,'reportedResults',v_results,
    'review',jsonb_build_object('state','REVIEW','codes',jsonb_build_array('SYNTHETIC_PARTIAL_CONFLICT'))
  );
  v_student := jsonb_build_object(
    'sourcePersonKey',encode(extensions.digest(v_source||':student-1','sha256'),'hex'),
    'identity',jsonb_build_object('status','MATCHED','alunoId',v_aluno,
      'matriculaId',v_matricula,'turmaId',v_turma),
    'sourceNames',jsonb_build_array(pg_temp.diario_fixture_field(
      v_source,'tbl[1]/tr[4]/tc[2]','Aluno sintético','"Aluno sintético"')),
    'attendance',v_attendance,'grades',v_grades,'reportedResults',v_results,
    'gradeRows',jsonb_build_array(v_grade_row)
  );
  v_unresolved := jsonb_build_object(
    'sourcePersonKey',encode(extensions.digest(v_source||':unresolved','sha256'),'hex'),
    'identity',jsonb_build_object('status','REVIEW','alunoId',null,'matriculaId',null),
    'sourceNames',jsonb_build_array(pg_temp.diario_fixture_field(
      v_source,'tbl[1]/tr[5]/tc[2]','Identidade sintética pendente','"Identidade sintética pendente"')),
    'attendance','[]'::jsonb,'grades',null,'reportedResults',null
  );
  v_payload := jsonb_build_object(
    'source',jsonb_build_object('sha256',v_source,'fileName','SYNTHETIC-ROLLBACK-ONLY.docx'),
    'turmaId',v_turma,'disciplinaId',v_disciplina,'professorId',v_professor,
    'lessons',v_lessons,'students',jsonb_build_array(v_student,v_unresolved),'issues','[]'::jsonb
  );

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('request.jwt.claim.role','anon',true);
  begin
    perform public.importar_diario_historico_secure(v_manifest,v_payload);
    raise exception 'FAIL: anon ingestion was accepted.';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);

  -- Run before positive ingestion: a replay conflict must not mask the SHA guard.
  v_bad := jsonb_set(v_payload,
    '{students,0,gradeRows,0,reportedResults,final,sourceRefs,0,sha256}',to_jsonb(v_other_sha));
  begin
    perform public.importar_diario_historico_secure(v_manifest,v_bad);
    raise exception 'FAIL: nested sourceRefs SHA mismatch was accepted.';
  exception when sqlstate '22023' or sqlstate '23514' then null;
  end;
  if exists(select 1 from internal_academic.diario_importacoes where source_sha256=v_source) then
    raise exception 'FAIL: rejected source produced an import row.';
  end if;

  -- Matched identity with no grades is a supported source shape, not a zero grade.
  -- Roll this successful branch back before testing the same source's main case.
  v_bad := jsonb_set(jsonb_set(jsonb_set(v_payload,
    '{students,0,reportedResults}','null'::jsonb),
    '{students,0,grades}','null'::jsonb),'{students,0,gradeRows}','[]'::jsonb);
  begin
    v_response := public.importar_diario_historico_secure(v_manifest,v_bad);
    v_import := (v_response ->> 'importacaoId')::uuid;
    select notas_estado,media_final into v_state,v_final
    from internal_academic.diario_resultados_importados where importacao_id=v_import;
    if v_state is distinct from 'EM_CONFERENCIA' or v_final is not null then
      raise exception 'FAIL: a missing grade became a confirmed value.';
    end if;
    raise exception using errcode='PT001',message='Expected rollback of no-grade fixture.';
  exception when sqlstate 'PT001' then null;
  end;

  v_response := public.importar_diario_historico_secure(v_manifest,v_payload);
  v_import := (v_response ->> 'importacaoId')::uuid;
  if v_import is null or (v_response ->> 'replay') is distinct from 'false' then
    raise exception 'FAIL: initial ingestion did not return a new import.';
  end if;
  select count(*) into v_count from internal_academic.diario_resultados_importados
    where importacao_id=v_import;
  if v_count<>1 then raise exception 'FAIL: unresolved identity became a result or mapped result is missing.'; end if;
  select notas_estado,media_parcial,media_final into v_state,v_partial,v_final
  from internal_academic.diario_resultados_importados where importacao_id=v_import;
  if v_state is distinct from 'EM_CONFERENCIA' or v_partial is not null then
    raise exception 'FAIL: partial REVIEW was treated as a confirmed grade row.';
  end if;
  -- A source-final value may remain stored, but cannot make the row confirmed.
  if v_final is not null and v_final<>7.5 then
    raise exception 'FAIL: source final grade was recalculated or changed.';
  end if;
  select count(*) into v_count from internal_academic.diario_aulas_importadas
    where importacao_id=v_import;
  if v_count<>v_n then raise exception 'FAIL: lesson count mismatch.'; end if;
  select count(*) into v_count from internal_academic.diario_frequencias_importadas
    where importacao_id=v_import and status='P' and estado='CONFERIDO';
  if v_count<>v_n then raise exception 'FAIL: source attendance was lost or changed.'; end if;
  if not exists(select 1 from internal_academic.diario_importacoes
      where id=v_import and payload #> '{students,1}'=v_unresolved) then
    raise exception 'FAIL: unresolved source evidence was not preserved verbatim.';
  end if;

  v_response := public.importar_diario_historico_secure(v_manifest,v_payload);
  if (v_response ->> 'replay') is distinct from 'true' or (v_response ->> 'importacaoId')::uuid is distinct from v_import then
    raise exception 'FAIL: identical replay was not idempotent.';
  end if;
  select count(*) into v_count from internal_academic.diario_importacoes where source_sha256=v_source;
  if v_count<>1 then raise exception 'FAIL: replay duplicated the source.'; end if;
  v_bad := jsonb_set(v_payload,'{lessons,0,content,value}','"Alteração sintética"');
  begin
    perform public.importar_diario_historico_secure(v_manifest,v_bad);
    raise exception 'FAIL: changed payload replay was accepted.';
  exception when sqlstate '23505' then null;
  end;

  v_read := public.get_diario_historico_importado(v_turma,v_disciplina);
  if v_read is null or (v_read ->> 'readOnly') is distinct from 'true'
    or (v_read ->> 'studentsCount')::integer is distinct from 1
    or (v_read ->> 'unresolvedCount')::integer is distinct from 1
    or jsonb_array_length(v_read -> 'unresolvedStudents') is distinct from 1 then
    raise exception 'FAIL: authorized historical read lost resolved/unresolved records.';
  end if;
  if (v_read #>> '{students,0,gradeState}') is distinct from 'EM_CONFERENCIA' then
    raise exception 'FAIL: read projection hid grade review.';
  end if;
  select to_jsonb(r) into v_row from public.get_diario_alunos(v_turma,v_disciplina) r
    where r.aluno_id=v_aluno and r.matricula_id=v_matricula;
  if v_row is null or (v_row ->> 'status') is distinct from 'PENDENTE' then
    raise exception 'FAIL: operational roster omitted history or changed enrollment status.';
  end if;
  select to_jsonb(r) into v_row from public.get_diario_resultados(v_turma,v_disciplina) r
    where r.aluno_id=v_aluno;
  if v_row is null or v_row ->> 'media_final' is not null
    or v_row ->> 'media_parcial' is not null
    or (v_row ->> 'resultado_final') is distinct from 'EM_CONFERENCIA' then
    raise exception 'FAIL: diary RPC confirmed a grade still in review.';
  end if;
  select to_jsonb(r) into v_row from internal_academic.get_enrollment_results(v_matricula) r
    where r.disciplina_id=v_disciplina;
  if v_row is null or v_row ->> 'media_final' is not null
    or (v_row ->> 'resultado_final') is distinct from 'EM_CONFERENCIA' then
    raise exception 'FAIL: enrollment projection confirmed a grade still in review.';
  end if;
  select to_jsonb(r) into v_row from public.v_diario_notas_resultados r
    where r.turma_id=v_turma and r.disciplina_id=v_disciplina and r.aluno_id=v_aluno;
  if v_row is null or v_row ->> 'media_final' is not null
    or (v_row ->> 'resultado_final') is distinct from 'EM_CONFERENCIA' then
    raise exception 'FAIL: snapshot view confirmed a grade still in review.';
  end if;

  select count(*) into v_count from pg_trigger
  where not tgisinternal and tgenabled<>'D' and tgname in (
    'guard_diario_historical_notes_write','guard_diario_historical_attendance_write',
    'lock_diario_historical_lesson_scope'
  );
  if v_count<>3 then raise exception 'FAIL: expected import/write serialization guards are absent.'; end if;
  begin
    insert into public.diario_notas(turma_id,disciplina_id,aluno_id,nota_p)
    values(v_turma,v_disciplina,v_aluno,1);
    raise exception using errcode='PT009',message='FAIL: normal note insertion after historical import was accepted.';
  exception when sqlstate '23514' or sqlstate 'P0001' then null;
  end;

  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin
    perform public.get_diario_historico_importado(v_turma,v_disciplina);
    raise exception 'FAIL: authenticated caller without academic identity could read history.';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('request.jwt.claim.role','anon',true);
  begin
    perform public.get_diario_historico_importado(v_turma,v_disciplina);
    raise exception 'FAIL: anon could read history.';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);

  select to_jsonb(m) into v_after from public.matriculas m where m.id=v_matricula;
  v_normal_write_after := internal_academic.can_write_student_in_diary(
    v_turma,v_disciplina,v_matricula,v_aluno
  );
  if v_before is distinct from v_after
    or v_normal_write_before is distinct from v_normal_write_after then
    raise exception 'FAIL: enrollment fields or normal diary permission changed.';
  end if;
  if exists(select 1 from public.diario_notas where turma_id=v_turma and disciplina_id=v_disciplina)
    or exists(select 1 from public.diario_frequencia where turma_id=v_turma and disciplina_id=v_disciplina)
    or exists(select 1 from public.aulas_turma where turma_id=v_turma and disciplina_id=v_disciplina) then
    raise exception 'FAIL: historical ingestion wrote into an operational diary table.';
  end if;
  raise notice 'PASS: historical ingestion, recursive provenance, review, replay, authorization and enrollment preservation; outer transaction will roll back.';
end;
$test$;

-- Force deferred constraints while still inside the synthetic transaction.
set constraints all immediate;
rollback;
