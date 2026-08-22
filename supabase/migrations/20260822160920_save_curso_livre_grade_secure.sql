begin;

create or replace function public.salvar_grade_curso_livre_gestao_secure(
  p_request_id uuid,
  p_curso_id uuid,
  p_expected_fingerprint text,
  p_modulos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_payload_hash text;
  v_stored internal_academic.curso_livre_grade_requests%rowtype;
  v_current jsonb;
  v_response jsonb;
  v_grade_frozen boolean;
  v_module_entry record;
  v_discipline_entry record;
  v_lesson_entry record;
  v_delete record;
  v_module public.modulos%rowtype;
  v_discipline public.disciplinas%rowtype;
  v_lesson public.aulas%rowtype;
  v_module_id uuid;
  v_discipline_id uuid;
  v_lesson_id uuid;
  v_current_course_id uuid;
  v_client_id text;
  v_name text;
  v_description text;
  v_hours numeric;
  v_theory numeric;
  v_practice numeric;
  v_internship numeric;
  v_seen_module_ids text[] := array[]::text[];
  v_seen_discipline_ids text[] := array[]::text[];
  v_seen_lesson_ids text[] := array[]::text[];
  v_keep_modules uuid[] := array[]::uuid[];
  v_keep_disciplines uuid[] := array[]::uuid[];
  v_keep_lessons uuid[] := array[]::uuid[];
  v_total_disciplines integer := 0;
  v_total_lessons integer := 0;
begin
  perform internal_academic.assert_can_manage_curso_livre(p_curso_id);
  perform internal_academic.assert_can_operate_curso_livre_grade(p_curso_id);

  if p_request_id is null then
    raise exception 'requestId obrigatório.' using errcode = '22023';
  end if;
  if p_expected_fingerprint is null
    or p_expected_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Fingerprint esperado da grade Livre inválido.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_modulos) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_modulos) > 100 then
    raise exception 'A grade Livre deve conter uma lista de até 100 módulos.'
      using errcode = '22023';
  end if;

  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'cursoId', p_curso_id,
      'expectedFingerprint', p_expected_fingerprint,
      'modulos', p_modulos
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('curso-livre-grade-request:' || p_request_id::text, 0)
  );
  select request.* into v_stored
  from internal_academic.curso_livre_grade_requests request
  where request.request_id = p_request_id;
  if found then
    if v_stored.actor_id is distinct from v_actor_id
      or v_stored.curso_id is distinct from p_curso_id
      or v_stored.payload_hash <> v_payload_hash then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_stored.response, '{replayed}', 'true'::jsonb, true);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('curso-livre-class-set:' || p_curso_id::text, 0)
  );
  for v_delete in
    select class.id
    from public.turmas class
    where class.curso_id = p_curso_id
    order by class.id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'curso-livre-schedule:' || v_delete.id::text,
      0
    ));
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('curso-livre-grade:' || p_curso_id::text, 0)
  );
  perform 1
  from public.cursos course
  where course.id = p_curso_id
    and upper(coalesce(course.modalidade, '')) = 'LIVRE'
  for share;
  if not found then
    raise exception 'Curso Livre não encontrado.' using errcode = 'P0002';
  end if;

  perform internal_academic.assert_can_manage_curso_livre(p_curso_id);
  perform internal_academic.assert_can_operate_curso_livre_grade(p_curso_id);
  perform module.id
  from public.modulos module
  where module.curso_id = p_curso_id
  order by module.id
  for update;
  perform discipline.id
  from public.disciplinas discipline
  join public.modulos module on module.id = discipline.modulo_id
  where module.curso_id = p_curso_id
  order by discipline.id
  for update of discipline;
  perform lesson.id
  from public.aulas lesson
  join public.disciplinas discipline on discipline.id = lesson.disciplina_id
  join public.modulos module on module.id = discipline.modulo_id
  where module.curso_id = p_curso_id
  order by lesson.id
  for update of lesson;
  perform binding.turma_id
  from public.turmas_disciplinas binding
  join public.disciplinas discipline on discipline.id = binding.disciplina_id
  join public.modulos module on module.id = discipline.modulo_id
  where module.curso_id = p_curso_id
  order by binding.turma_id, binding.disciplina_id
  for update of binding;

  v_current := internal_academic.get_curso_livre_grade_payload(p_curso_id);
  if v_current ->> 'fingerprint' <> p_expected_fingerprint then
    raise exception 'A grade Livre foi alterada por outra sessão. Recarregue antes de salvar.'
      using errcode = '40001';
  end if;

  perform internal_academic.assert_curso_livre_grade_frozen_structure(
    p_curso_id,
    p_modulos
  );
  v_grade_frozen := internal_academic.curso_livre_grade_tem_tentativa(p_curso_id);

  for v_module_entry in
    select item, ordinality::integer as position
    from pg_catalog.jsonb_array_elements(p_modulos) with ordinality as input(item, ordinality)
  loop
    if pg_catalog.jsonb_typeof(v_module_entry.item) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_module_entry.item -> 'disciplinas') is distinct from 'array' then
      raise exception 'Módulo da grade Livre inválido.' using errcode = '22023';
    end if;
    v_total_disciplines := v_total_disciplines
      + pg_catalog.jsonb_array_length(v_module_entry.item -> 'disciplinas');
    if v_total_disciplines > 500 then
      raise exception 'A grade Livre aceita no máximo 500 disciplinas.' using errcode = '22023';
    end if;

    v_client_id := nullif(pg_catalog.btrim(coalesce(v_module_entry.item ->> 'id', '')), '');
    if v_client_id is not null and pg_catalog.array_position(v_seen_module_ids, v_client_id) is not null then
      raise exception 'Módulo repetido na grade Livre.' using errcode = '22023';
    end if;
    if v_client_id is not null then
      v_seen_module_ids := pg_catalog.array_append(v_seen_module_ids, v_client_id);
    end if;
    v_module_id := null;
    begin
      v_module_id := v_client_id::uuid;
    exception when invalid_text_representation then
      v_module_id := null;
    end;
    if v_module_id is not null and v_module_id = any(v_keep_modules) then
      raise exception 'Módulo repetido na grade Livre.' using errcode = '22023';
    end if;

    v_name := pg_catalog.btrim(coalesce(v_module_entry.item ->> 'nome', ''));
    v_description := coalesce(v_module_entry.item ->> 'descricao', '');
    if v_name = '' or pg_catalog.length(v_name) > 200
      or pg_catalog.length(v_description) > 10000 then
      raise exception 'Revise o nome ou resumo do módulo Livre.' using errcode = '22023';
    end if;

    if v_module_id is not null then
      select module.* into v_module
      from public.modulos module
      where module.id = v_module_id;
      if not found or v_module.curso_id <> p_curso_id then
        raise exception 'ID de módulo não pertence a este Curso Livre.' using errcode = '22023';
      end if;
      if v_grade_frozen then
        update public.modulos module set descricao = v_description
        where module.id = v_module_id;
      else
        update public.modulos module
        set nome = v_name, descricao = v_description, ordem = v_module_entry.position
        where module.id = v_module_id;
      end if;
    else
      insert into public.modulos(curso_id, nome, descricao, ordem)
      values (p_curso_id, v_name, v_description, v_module_entry.position)
      returning id into v_module_id;
    end if;
    v_keep_modules := pg_catalog.array_append(v_keep_modules, v_module_id);

    for v_discipline_entry in
      select item, ordinality::integer as position
      from pg_catalog.jsonb_array_elements(v_module_entry.item -> 'disciplinas')
        with ordinality as input(item, ordinality)
    loop
      if pg_catalog.jsonb_typeof(v_discipline_entry.item) is distinct from 'object'
        or pg_catalog.jsonb_typeof(v_discipline_entry.item -> 'aulas') is distinct from 'array' then
        raise exception 'Disciplina da grade Livre inválida.' using errcode = '22023';
      end if;
      v_total_lessons := v_total_lessons
        + pg_catalog.jsonb_array_length(v_discipline_entry.item -> 'aulas');
      if v_total_lessons > 5000 then
        raise exception 'A grade Livre aceita no máximo 5.000 aulas.' using errcode = '22023';
      end if;

      v_client_id := nullif(pg_catalog.btrim(coalesce(v_discipline_entry.item ->> 'id', '')), '');
      if v_client_id is not null
        and pg_catalog.array_position(v_seen_discipline_ids, v_client_id) is not null then
        raise exception 'Disciplina repetida na grade Livre.' using errcode = '22023';
      end if;
      if v_client_id is not null then
        v_seen_discipline_ids := pg_catalog.array_append(v_seen_discipline_ids, v_client_id);
      end if;
      v_discipline_id := null;
      begin
        v_discipline_id := v_client_id::uuid;
      exception when invalid_text_representation then
        v_discipline_id := null;
      end;
      if v_discipline_id is not null and v_discipline_id = any(v_keep_disciplines) then
        raise exception 'Disciplina repetida na grade Livre.' using errcode = '22023';
      end if;

      v_name := pg_catalog.btrim(coalesce(v_discipline_entry.item ->> 'nome', ''));
      v_description := coalesce(v_discipline_entry.item ->> 'descricao', '');
      begin
        v_hours := coalesce((v_discipline_entry.item ->> 'cargaHoraria')::numeric, 0);
        v_theory := coalesce((v_discipline_entry.item ->> 'cargaHorariaTeoria')::numeric, 0);
        v_practice := coalesce((v_discipline_entry.item ->> 'cargaHorariaPratica')::numeric, 0);
        v_internship := coalesce((v_discipline_entry.item ->> 'cargaHorariaEstagio')::numeric, 0);
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Carga horária da disciplina Livre inválida.' using errcode = '22023';
      end;
      if v_name = '' or pg_catalog.length(v_name) > 200
        or pg_catalog.length(v_description) > 10000
        or v_hours not between 0 and 100000 or v_hours <> pg_catalog.trunc(v_hours)
        or v_theory not between 0 and 100000 or v_theory <> pg_catalog.trunc(v_theory)
        or v_practice not between 0 and 100000 or v_practice <> pg_catalog.trunc(v_practice)
        or v_internship not between 0 and 100000 or v_internship <> pg_catalog.trunc(v_internship) then
        raise exception 'Revise nome, resumo e cargas da disciplina Livre.' using errcode = '22023';
      end if;

      if v_discipline_id is not null then
        select discipline.* into v_discipline
        from public.disciplinas discipline
        where discipline.id = v_discipline_id;
        if not found then
          raise exception 'ID de disciplina não pertence a este Curso Livre.' using errcode = '22023';
        end if;
        select module.curso_id into v_current_course_id
        from public.modulos module where module.id = v_discipline.modulo_id;
        if v_current_course_id <> p_curso_id then
          raise exception 'ID de disciplina não pertence a este Curso Livre.' using errcode = '22023';
        end if;
        if v_discipline.modulo_id <> v_module_id
          and internal_academic.curso_livre_disciplina_em_uso_operacional(v_discipline_id) then
          raise exception 'Disciplina com aula, diário ou resultado não pode mudar de módulo.'
            using errcode = '55000';
        end if;
        if v_grade_frozen then
          update public.disciplinas discipline set descricao = v_description
          where discipline.id = v_discipline_id;
        else
          update public.disciplinas discipline
          set modulo_id = v_module_id,
              nome = v_name,
              ordem = v_discipline_entry.position,
              carga_horaria = v_hours::integer,
              carga_horaria_teoria = v_theory::integer,
              carga_horaria_pratica = v_practice::integer,
              carga_horaria_estagio = v_internship::integer,
              descricao = v_description
          where discipline.id = v_discipline_id;
        end if;
      else
        insert into public.disciplinas(
          modulo_id, nome, ordem, carga_horaria,
          carga_horaria_teoria, carga_horaria_pratica,
          carga_horaria_estagio, descricao
        ) values (
          v_module_id, v_name, v_discipline_entry.position, v_hours::integer,
          v_theory::integer, v_practice::integer, v_internship::integer, v_description
        ) returning id into v_discipline_id;
      end if;
      v_keep_disciplines := pg_catalog.array_append(v_keep_disciplines, v_discipline_id);

      for v_lesson_entry in
        select item, ordinality::integer as position
        from pg_catalog.jsonb_array_elements(v_discipline_entry.item -> 'aulas')
          with ordinality as input(item, ordinality)
      loop
        if pg_catalog.jsonb_typeof(v_lesson_entry.item) is distinct from 'object' then
          raise exception 'Aula da grade Livre inválida.' using errcode = '22023';
        end if;
        v_client_id := nullif(pg_catalog.btrim(coalesce(v_lesson_entry.item ->> 'id', '')), '');
        if v_client_id is not null and pg_catalog.array_position(v_seen_lesson_ids, v_client_id) is not null then
          raise exception 'Aula repetida na grade Livre.' using errcode = '22023';
        end if;
        if v_client_id is not null then
          v_seen_lesson_ids := pg_catalog.array_append(v_seen_lesson_ids, v_client_id);
        end if;
        v_lesson_id := null;
        begin
          v_lesson_id := v_client_id::uuid;
        exception when invalid_text_representation then
          v_lesson_id := null;
        end;
        if v_lesson_id is not null and v_lesson_id = any(v_keep_lessons) then
          raise exception 'Aula repetida na grade Livre.' using errcode = '22023';
        end if;

        v_name := pg_catalog.btrim(coalesce(v_lesson_entry.item ->> 'titulo', ''));
        v_description := coalesce(v_lesson_entry.item ->> 'descricao', '');
        begin
          v_hours := coalesce((v_lesson_entry.item ->> 'cargaHoraria')::numeric, 0);
        exception when invalid_text_representation or numeric_value_out_of_range then
          raise exception 'Carga horária da aula Livre inválida.' using errcode = '22023';
        end;
        if v_name = '' or pg_catalog.length(v_name) > 200
          or pg_catalog.length(v_description) > 10000
          or v_hours not between 0 and 999.99
          or v_hours <> pg_catalog.round(v_hours, 2) then
          raise exception 'Revise título, resumo e carga da aula Livre.' using errcode = '22023';
        end if;

        if v_lesson_id is not null then
          select lesson.* into v_lesson
          from public.aulas lesson where lesson.id = v_lesson_id;
          if not found then
            raise exception 'ID de aula não pertence a este Curso Livre.' using errcode = '22023';
          end if;
          select module.curso_id into v_current_course_id
          from public.disciplinas discipline
          join public.modulos module on module.id = discipline.modulo_id
          where discipline.id = v_lesson.disciplina_id;
          if v_current_course_id <> p_curso_id then
            raise exception 'ID de aula não pertence a este Curso Livre.' using errcode = '22023';
          end if;
          if v_grade_frozen then
            update public.aulas lesson set descricao = v_description
            where lesson.id = v_lesson_id;
          else
            update public.aulas lesson
            set disciplina_id = v_discipline_id,
                titulo = v_name,
                carga_horaria = v_hours,
                descricao = v_description,
                ordem = v_lesson_entry.position
            where lesson.id = v_lesson_id;
          end if;
        else
          insert into public.aulas(disciplina_id, titulo, carga_horaria, descricao, ordem)
          values (v_discipline_id, v_name, v_hours, v_description, v_lesson_entry.position)
          returning id into v_lesson_id;
        end if;
        v_keep_lessons := pg_catalog.array_append(v_keep_lessons, v_lesson_id);
      end loop;
    end loop;
  end loop;

  delete from public.aulas lesson
  using public.disciplinas discipline, public.modulos module
  where lesson.disciplina_id = discipline.id
    and discipline.modulo_id = module.id
    and module.curso_id = p_curso_id
    and not (lesson.id = any(v_keep_lessons));

  for v_delete in
    select discipline.id
    from public.disciplinas discipline
    join public.modulos module on module.id = discipline.modulo_id
    where module.curso_id = p_curso_id
      and not (discipline.id = any(v_keep_disciplines))
  loop
    if internal_academic.curso_livre_disciplina_em_uso_operacional(v_delete.id) then
      raise exception 'Disciplina com aula, diário ou resultado não pode ser removida.'
        using errcode = '55000';
    end if;
  end loop;

  perform pg_catalog.set_config('app.curso_livre_structure_sync', 'on', true);
  delete from public.turmas_disciplinas binding
  using public.turmas class, public.disciplinas discipline, public.modulos module
  where binding.turma_id = class.id
    and binding.disciplina_id = discipline.id
    and discipline.modulo_id = module.id
    and class.curso_id = p_curso_id
    and module.curso_id = p_curso_id
    and not (discipline.id = any(v_keep_disciplines));

  delete from public.disciplinas discipline
  using public.modulos module
  where discipline.modulo_id = module.id
    and module.curso_id = p_curso_id
    and not (discipline.id = any(v_keep_disciplines));

  for v_delete in
    select module.id
    from public.modulos module
    where module.curso_id = p_curso_id
      and not (module.id = any(v_keep_modules))
  loop
    if internal_academic.curso_livre_modulo_em_uso_operacional(v_delete.id) then
      raise exception 'Módulo vinculado a período ou histórico não pode ser removido.'
        using errcode = '55000';
    end if;
  end loop;

  delete from public.modulos module
  where module.curso_id = p_curso_id
    and not (module.id = any(v_keep_modules));

  v_response := internal_academic.get_curso_livre_grade_workspace_payload(p_curso_id)
    || jsonb_build_object('replayed', false);
  insert into internal_academic.curso_livre_grade_requests(
    request_id, actor_id, curso_id, payload_hash, response
  ) values (
    p_request_id, v_actor_id, p_curso_id, v_payload_hash, v_response
  );
  return v_response;
end;
$function$;

revoke all on function public.salvar_grade_curso_livre_gestao_secure(
  uuid, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.salvar_grade_curso_livre_gestao_secure(
  uuid, uuid, text, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
