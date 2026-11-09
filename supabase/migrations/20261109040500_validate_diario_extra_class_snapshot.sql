-- Validate the versioned credit against frozen evidence before delegating the
-- remaining document contract to the unchanged legacy validator. The returned
-- projection is transient: neither the envelope nor its hashes are rewritten.
begin;

create function internal_academic.diario_snapshot_extra_classe_base(p_snapshot jsonb)
returns jsonb language plpgsql stable set search_path = '' as $function$
declare
  v_credit jsonb := p_snapshot -> 'extraClassCredit';
  v_activities jsonb := v_credit -> 'activities';
  v_eligible jsonb := v_credit -> 'eligibleActivityIdsByStudent';
  v_activity jsonb;
  v_student jsonb;
  v_ids jsonb;
  v_id text;
  v_student_id text;
  v_activity_ids text[] := array[]::text[];
  v_student_ids text[] := array[]::text[];
  v_credited_ids text[];
  v_activity_hours jsonb := '{}'::jsonb;
  v_previous_date date;
  v_previous_id text;
  v_previous_index integer;
  v_index integer;
  v_extra_total numeric := 0;
  v_regular_hours numeric;
  v_credited_hours numeric;
  v_absent_hours numeric;
  v_expected numeric;
  v_legacy_grades jsonb := p_snapshot -> 'gradesMap';
  v_academic jsonb;
  v_base jsonb;
begin
  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or jsonb_typeof(v_credit) is distinct from 'object'
    or not (v_credit ?& array['schemaVersion','activities','eligibleActivityIdsByStudent'])
    or v_credit - array['schemaVersion','activities','eligibleActivityIdsByStudent'] <> '{}'::jsonb
    or v_credit -> 'schemaVersion' is distinct from '1'::jsonb
    or jsonb_typeof(v_activities) is distinct from 'array'
    or jsonb_array_length(v_activities) > 1000
    or jsonb_typeof(v_eligible) is distinct from 'object'
    or jsonb_typeof(p_snapshot -> 'students') is distinct from 'array'
    or jsonb_typeof(p_snapshot -> 'gradesMap') is distinct from 'object'
    or jsonb_typeof(p_snapshot -> 'aulas') is distinct from 'array'
    or jsonb_typeof(p_snapshot -> 'attendanceMap') is distinct from 'object'
  then return null; end if;

  v_academic := jsonb_build_object(
    'students', p_snapshot -> 'students',
    'aulas', p_snapshot -> 'aulas',
    'attendanceMap', p_snapshot -> 'attendanceMap',
    'gradesMap', p_snapshot -> 'gradesMap',
    'praticasMap', p_snapshot -> 'praticasMap',
    'observacoes', p_snapshot -> 'observacoes',
    'activeInstruments', p_snapshot -> 'activeInstruments',
    'closure', p_snapshot -> 'closure',
    'extraClassCredit', v_credit
  );
  if p_snapshot #>> '{source,academicRevisionSha256}' is distinct from
    public.assinatura_eletronica_sha256_json(v_academic)
  then return null; end if;

  for v_activity in select value from jsonb_array_elements(v_activities) loop
    if jsonb_typeof(v_activity) is distinct from 'object'
      or not (v_activity ?& array['id','titulo','cargaHoraria','dataSource'])
      or v_activity - array['id','titulo','cargaHoraria','dataSource'] <> '{}'::jsonb
      or jsonb_typeof(v_activity -> 'id') is distinct from 'string'
      or (v_activity ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(v_activity -> 'titulo') is distinct from 'string'
      or length(btrim(v_activity ->> 'titulo')) not between 1 and 2000
      or jsonb_typeof(v_activity -> 'cargaHoraria') is distinct from 'number'
      or (v_activity ->> 'cargaHoraria')::numeric not between 0.01 and 1000
      or jsonb_typeof(v_activity -> 'dataSource') is distinct from 'string'
      or (v_activity ->> 'dataSource') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or ((v_activity ->> 'dataSource')::date)::text is distinct from v_activity ->> 'dataSource'
      or (v_activity ->> 'dataSource')::date >
        timezone('America/Maceio', (p_snapshot ->> 'generatedAt')::timestamptz)::date
    then return null; end if;
    v_id := v_activity ->> 'id';
    if v_id = any(v_activity_ids) then return null; end if;
    if v_previous_date is not null and (
      ((v_activity ->> 'dataSource')::date, v_id) <= (v_previous_date, v_previous_id)
    ) then return null; end if;
    v_previous_date := (v_activity ->> 'dataSource')::date;
    v_previous_id := v_id;
    v_activity_ids := array_append(v_activity_ids, v_id);
    v_activity_hours := v_activity_hours || jsonb_build_object(v_id, v_activity -> 'cargaHoraria');
    v_extra_total := v_extra_total + (v_activity ->> 'cargaHoraria')::numeric;
  end loop;
  if v_extra_total > 100000 then return null; end if;

  select coalesce(sum((session ->> 'cargaHoraria')::numeric), 0)
  into v_regular_hours
  from jsonb_array_elements(p_snapshot -> 'aulas') lesson
  cross join lateral jsonb_array_elements(lesson -> 'sessoes') session;
  -- The official signature contract still requires a real classroom session.
  if v_regular_hours <= 0 or (p_snapshot #>> '{closure,hoursCompleted}')::numeric
    is distinct from v_regular_hours + v_extra_total
  then return null; end if;

  for v_student in select value from jsonb_array_elements(p_snapshot -> 'students') loop
    v_student_id := v_student ->> 'id';
    if v_student_id is null or v_student_id = any(v_student_ids)
      or not (v_eligible ? v_student_id)
      or jsonb_typeof(v_eligible -> v_student_id) is distinct from 'array'
    then return null; end if;
    v_student_ids := array_append(v_student_ids, v_student_id);
    v_ids := v_eligible -> v_student_id;
    v_credited_ids := array[]::text[];
    v_credited_hours := 0;
    v_previous_index := 0;
    for v_activity in select value from jsonb_array_elements(v_ids) loop
      if jsonb_typeof(v_activity) is distinct from 'string' then return null; end if;
      v_id := v_activity #>> '{}';
      if not (v_id = any(v_activity_ids)) or v_id = any(v_credited_ids)
      then return null; end if;
      v_index := array_position(v_activity_ids, v_id);
      if v_index <= v_previous_index then return null; end if;
      v_previous_index := v_index;
      v_credited_ids := array_append(v_credited_ids, v_id);
      v_credited_hours := v_credited_hours + (v_activity_hours ->> v_id)::numeric;
    end loop;

    select coalesce(sum(case when
      p_snapshot #>> array['attendanceMap',v_student_id,session ->> 'id'] = 'F'
      then (session ->> 'cargaHoraria')::numeric else 0 end), 0)
    into v_absent_hours
    from jsonb_array_elements(p_snapshot -> 'aulas') lesson
    cross join lateral jsonb_array_elements(lesson -> 'sessoes') session;
    v_expected := round(
      (v_regular_hours - v_absent_hours + v_credited_hours)
      / (v_regular_hours + v_credited_hours) * 100, 2
    );
    if jsonb_typeof(p_snapshot #> array['gradesMap',v_student_id,'frequencia_percent'])
        is distinct from 'number'
      or (p_snapshot #>> array['gradesMap',v_student_id,'frequencia_percent'])::numeric
        is distinct from v_expected
    then return null; end if;
    v_legacy_grades := jsonb_set(v_legacy_grades,
      array[v_student_id,'frequencia_percent'],
      to_jsonb(round((v_regular_hours - v_absent_hours) / v_regular_hours * 100, 2)), false);
  end loop;
  if (select count(*) from jsonb_object_keys(v_eligible)) <> cardinality(v_student_ids)
  then return null; end if;

  v_base := jsonb_set(p_snapshot - 'extraClassCredit', array['gradesMap'], v_legacy_grades, false);
  v_academic := jsonb_build_object(
    'students', v_base -> 'students',
    'aulas', v_base -> 'aulas',
    'attendanceMap', v_base -> 'attendanceMap',
    'gradesMap', v_base -> 'gradesMap',
    'praticasMap', v_base -> 'praticasMap',
    'observacoes', v_base -> 'observacoes',
    'activeInstruments', v_base -> 'activeInstruments',
    'closure', v_base -> 'closure'
  );
  return jsonb_set(v_base, array['source','academicRevisionSha256'],
    to_jsonb(public.assinatura_eletronica_sha256_json(v_academic)), false);
exception when others then return null;
end;
$function$;

revoke all on function internal_academic.diario_snapshot_extra_classe_base(jsonb)
  from public, anon, authenticated, service_role;

-- Keep the existing OID/ACL and all institutional/watermark checks. Constraint
-- dependencies therefore continue through the same public validator.
do $patch$
declare
  v_definition text := pg_get_functiondef(
    'public.assinatura_eletronica_snapshot_academico_diario_valido(jsonb)'::regprocedure);
  v_old text := E'BEGIN\n  IF jsonb_typeof(';
  v_new text := E'BEGIN\n  IF v_normalized ? ''extraClassCredit'' THEN\n'
    || E'    v_normalized := internal_academic.diario_snapshot_extra_classe_base(v_normalized);\n'
    || E'    IF v_normalized IS NULL THEN RETURN false; END IF;\n'
    || E'  END IF;\n  IF jsonb_typeof(';
begin
  if md5(v_definition) <> '68a8549b7be0c131b147cb27ff0e6799'
    or length(v_definition) - length(replace(v_definition,v_old,'')) <> length(v_old)
  then raise exception 'Drift no validador canônico do snapshot do diário.'; end if;
  execute replace(v_definition,v_old,v_new);
end;
$patch$;

commit;
