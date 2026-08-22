begin;

create or replace function internal_academic.curso_livre_disciplina_em_uso_operacional(
  p_disciplina_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_reference record;
  v_used boolean;
begin
  for v_reference in
    select distinct
      namespace.nspname as schema_name,
      relation.relname as table_name,
      attribute.attname as column_name
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class relation
      on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    join lateral pg_catalog.generate_subscripts(
      constraint_row.conkey,
      1
    ) as key_position(position) on true
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = constraint_row.conkey[key_position.position]
    join pg_catalog.pg_attribute referenced_attribute
      on referenced_attribute.attrelid = constraint_row.confrelid
     and referenced_attribute.attnum = constraint_row.confkey[key_position.position]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.disciplinas'::regclass
      and referenced_attribute.attname = 'id'
      and constraint_row.conrelid not in (
        'public.aulas'::regclass,
        'public.turmas_disciplinas'::regclass
      )
  loop
    execute pg_catalog.format(
      'select exists (select 1 from %I.%I where %I = $1)',
      v_reference.schema_name,
      v_reference.table_name,
      v_reference.column_name
    )
    using p_disciplina_id
    into v_used;

    if coalesce(v_used, false) then
      return true;
    end if;
  end loop;

  for v_reference in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      pg_catalog.string_agg(
        pg_catalog.format(
          'dependent.%I = binding.%I',
          attribute.attname,
          referenced_attribute.attname
        ),
        ' and ' order by key_position.position
      ) as join_condition
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class relation
      on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    join lateral pg_catalog.generate_subscripts(
      constraint_row.conkey,
      1
    ) as key_position(position) on true
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = constraint_row.conkey[key_position.position]
    join pg_catalog.pg_attribute referenced_attribute
      on referenced_attribute.attrelid = constraint_row.confrelid
     and referenced_attribute.attnum = constraint_row.confkey[key_position.position]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.turmas_disciplinas'::regclass
    group by constraint_row.oid, namespace.nspname, relation.relname
  loop
    execute pg_catalog.format(
      'select exists (
        select 1
        from public.turmas_disciplinas binding
        join %I.%I dependent on %s
        where binding.disciplina_id = $1
      )',
      v_reference.schema_name,
      v_reference.table_name,
      v_reference.join_condition
    )
    using p_disciplina_id
    into v_used;

    if coalesce(v_used, false) then
      return true;
    end if;
  end loop;

  return false;
end;
$function$;

revoke all on function internal_academic.curso_livre_disciplina_em_uso_operacional(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.curso_livre_modulo_em_uso_operacional(
  p_modulo_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_reference record;
  v_discipline record;
  v_used boolean;
begin
  for v_discipline in
    select discipline.id
    from public.disciplinas discipline
    where discipline.modulo_id = p_modulo_id
    order by discipline.id
  loop
    if internal_academic.curso_livre_disciplina_em_uso_operacional(v_discipline.id) then
      return true;
    end if;
  end loop;

  for v_reference in
    select distinct
      namespace.nspname as schema_name,
      relation.relname as table_name,
      attribute.attname as column_name
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    join lateral pg_catalog.generate_subscripts(constraint_row.conkey, 1)
      as key_position(position) on true
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = constraint_row.conkey[key_position.position]
    join pg_catalog.pg_attribute referenced_attribute
      on referenced_attribute.attrelid = constraint_row.confrelid
     and referenced_attribute.attnum = constraint_row.confkey[key_position.position]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.modulos'::regclass
      and referenced_attribute.attname = 'id'
      and constraint_row.conrelid <> 'public.disciplinas'::regclass
  loop
    execute pg_catalog.format(
      'select exists (select 1 from %I.%I where %I = $1)',
      v_reference.schema_name,
      v_reference.table_name,
      v_reference.column_name
    ) using p_modulo_id into v_used;
    if coalesce(v_used, false) then return true; end if;
  end loop;
  return false;
end;
$function$;

revoke all on function internal_academic.curso_livre_modulo_em_uso_operacional(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.curso_livre_grade_tem_tentativa(
  p_curso_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.curso_livre_tentativas attempt
    join public.matriculas enrollment on enrollment.id = attempt.matricula_id
    join public.turmas class on class.id = enrollment.turma_id
    where class.curso_id = p_curso_id
  );
$function$;

revoke all on function internal_academic.curso_livre_grade_tem_tentativa(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.lock_curso_livre_grade_on_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_class_id uuid;
  v_old_curso_id uuid;
  v_new_curso_id uuid;
  v_curso_id uuid;
  v_live_curso_ids uuid[] := array[]::uuid[];
begin
  if tg_op = 'INSERT' then
    v_class_id := new.id;
    v_new_curso_id := new.curso_id;
  elsif tg_op = 'DELETE' then
    v_class_id := old.id;
    v_old_curso_id := old.curso_id;
  else
    v_class_id := new.id;
    v_old_curso_id := old.curso_id;
    v_new_curso_id := new.curso_id;
  end if;

  for v_curso_id in
    select course.id
    from public.cursos course
    where course.id in (v_old_curso_id, v_new_curso_id)
      and upper(coalesce(course.modalidade, '')) = 'LIVRE'
    order by course.id
  loop
    v_live_curso_ids := pg_catalog.array_append(v_live_curso_ids, v_curso_id);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'curso-livre-class-set:' || v_curso_id::text,
      0
    ));
  end loop;

  if pg_catalog.array_length(v_live_curso_ids, 1) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'curso-livre-schedule:' || v_class_id::text,
    0
  ));
  foreach v_curso_id in array v_live_curso_ids
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'curso-livre-grade:' || v_curso_id::text,
      0
    ));
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function internal_academic.lock_curso_livre_grade_on_class()
  from public, anon, authenticated, service_role;
drop trigger if exists lock_curso_livre_grade_on_class_trigger on public.turmas;
drop trigger if exists a_lock_curso_livre_grade_on_class_trigger on public.turmas;
create trigger a_lock_curso_livre_grade_on_class_trigger
before insert or delete or update of
  curso_id, polo_id, data_inicio, data_previsao_termino on public.turmas
for each row execute function internal_academic.lock_curso_livre_grade_on_class();

create or replace function internal_academic.lock_curso_livre_grade_on_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_curso_id uuid;
begin
  select class.curso_id into v_curso_id
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  where enrollment.id = new.matricula_id;
  if v_curso_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'curso-livre-grade:' || v_curso_id::text,
      0
    ));
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.lock_curso_livre_grade_on_attempt()
  from public, anon, authenticated, service_role;
create trigger lock_curso_livre_grade_on_attempt_trigger
before insert on public.curso_livre_tentativas
for each row execute function internal_academic.lock_curso_livre_grade_on_attempt();

create or replace function internal_academic.assert_curso_livre_grade_frozen_structure(
  p_curso_id uuid,
  p_modulos jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_module_entry record;
  v_discipline_entry record;
  v_lesson_entry record;
  v_module public.modulos%rowtype;
  v_discipline public.disciplinas%rowtype;
  v_lesson public.aulas%rowtype;
  v_module_id uuid;
  v_discipline_id uuid;
  v_lesson_id uuid;
  v_count integer;
  v_hours numeric;
  v_theory numeric;
  v_practice numeric;
  v_internship numeric;
begin
  if not internal_academic.curso_livre_grade_tem_tentativa(p_curso_id) then
    return;
  end if;

  select count(*)::integer into v_count
  from public.modulos module
  where module.curso_id = p_curso_id;
  if v_count <> pg_catalog.jsonb_array_length(p_modulos) then
    raise exception 'Após a primeira tentativa, somente resumos podem ser alterados.'
      using errcode = '55000';
  end if;

  for v_module_entry in
    select item, ordinality::integer as position
    from pg_catalog.jsonb_array_elements(p_modulos) with ordinality as input(item, ordinality)
  loop
    if pg_catalog.jsonb_typeof(v_module_entry.item) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_module_entry.item -> 'disciplinas') is distinct from 'array' then
      raise exception 'Módulo da grade Livre inválido.' using errcode = '22023';
    end if;
    begin
      v_module_id := (v_module_entry.item ->> 'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Não é permitido criar módulos após uma tentativa.'
        using errcode = '55000';
    end;
    select module.* into v_module
    from public.modulos module
    where module.id = v_module_id and module.curso_id = p_curso_id;
    if not found
      or v_module.nome is distinct from pg_catalog.btrim(v_module_entry.item ->> 'nome')
      or coalesce(v_module.ordem, v_module_entry.position) <> v_module_entry.position then
      raise exception 'Após a primeira tentativa, nomes, ordem e estrutura são imutáveis.'
        using errcode = '55000';
    end if;

    select count(*)::integer into v_count
    from public.disciplinas discipline
    where discipline.modulo_id = v_module_id;
    if v_count <> pg_catalog.jsonb_array_length(v_module_entry.item -> 'disciplinas') then
      raise exception 'Após a primeira tentativa, disciplinas não podem ser incluídas ou removidas.'
        using errcode = '55000';
    end if;

    for v_discipline_entry in
      select item, ordinality::integer as position
      from pg_catalog.jsonb_array_elements(v_module_entry.item -> 'disciplinas')
        with ordinality as input(item, ordinality)
    loop
      if pg_catalog.jsonb_typeof(v_discipline_entry.item) is distinct from 'object'
        or pg_catalog.jsonb_typeof(v_discipline_entry.item -> 'aulas') is distinct from 'array' then
        raise exception 'Disciplina da grade Livre inválida.' using errcode = '22023';
      end if;
      begin
        v_discipline_id := (v_discipline_entry.item ->> 'id')::uuid;
        v_hours := coalesce((v_discipline_entry.item ->> 'cargaHoraria')::numeric, 0);
        v_theory := coalesce((v_discipline_entry.item ->> 'cargaHorariaTeoria')::numeric, 0);
        v_practice := coalesce((v_discipline_entry.item ->> 'cargaHorariaPratica')::numeric, 0);
        v_internship := coalesce((v_discipline_entry.item ->> 'cargaHorariaEstagio')::numeric, 0);
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Identificador ou carga da disciplina Livre inválido.'
          using errcode = '22023';
      end;
      select discipline.* into v_discipline
      from public.disciplinas discipline
      where discipline.id = v_discipline_id
        and discipline.modulo_id = v_module_id;
      if not found
        or v_discipline.nome is distinct from pg_catalog.btrim(v_discipline_entry.item ->> 'nome')
        or coalesce(v_discipline.ordem, v_discipline_entry.position) <> v_discipline_entry.position
        or v_discipline.carga_horaria::numeric is distinct from v_hours
        or coalesce(v_discipline.carga_horaria_teoria, 0)::numeric is distinct from v_theory
        or coalesce(v_discipline.carga_horaria_pratica, 0)::numeric is distinct from v_practice
        or coalesce(v_discipline.carga_horaria_estagio, 0)::numeric is distinct from v_internship then
        raise exception 'Após a primeira tentativa, disciplina e cargas são imutáveis.'
          using errcode = '55000';
      end if;

      select count(*)::integer into v_count
      from public.aulas lesson
      where lesson.disciplina_id = v_discipline_id;
      if v_count <> pg_catalog.jsonb_array_length(v_discipline_entry.item -> 'aulas') then
        raise exception 'Após a primeira tentativa, aulas da grade são imutáveis.'
          using errcode = '55000';
      end if;

      for v_lesson_entry in
        select item, ordinality::integer as position
        from pg_catalog.jsonb_array_elements(v_discipline_entry.item -> 'aulas')
          with ordinality as input(item, ordinality)
      loop
        if pg_catalog.jsonb_typeof(v_lesson_entry.item) is distinct from 'object' then
          raise exception 'Aula da grade Livre inválida.' using errcode = '22023';
        end if;
        begin
          v_lesson_id := (v_lesson_entry.item ->> 'id')::uuid;
          v_hours := coalesce((v_lesson_entry.item ->> 'cargaHoraria')::numeric, 0);
        exception when invalid_text_representation or numeric_value_out_of_range then
          raise exception 'Identificador ou carga da aula Livre inválido.'
            using errcode = '22023';
        end;
        select lesson.* into v_lesson
        from public.aulas lesson
        where lesson.id = v_lesson_id
          and lesson.disciplina_id = v_discipline_id;
        if not found
          or v_lesson.titulo is distinct from pg_catalog.btrim(v_lesson_entry.item ->> 'titulo')
          or coalesce(v_lesson.ordem, v_lesson_entry.position) <> v_lesson_entry.position
          or v_lesson.carga_horaria is distinct from v_hours then
          raise exception 'Após a primeira tentativa, aulas, ordem e cargas são imutáveis.'
            using errcode = '55000';
        end if;
      end loop;
    end loop;
  end loop;
end;
$function$;

revoke all on function internal_academic.assert_curso_livre_grade_frozen_structure(uuid, jsonb)
  from public, anon, authenticated, service_role;

commit;
