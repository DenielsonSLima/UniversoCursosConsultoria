begin;

create or replace function internal_academic.curso_livre_curso_em_uso_operacional(
  p_curso_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_module record;
  v_discipline record;
begin
  if internal_academic.curso_livre_grade_tem_tentativa(p_curso_id) then
    return true;
  end if;
  for v_discipline in
    select discipline.id
    from public.disciplinas discipline
    join public.modulos module on module.id = discipline.modulo_id
    where module.curso_id = p_curso_id
    order by discipline.id
  loop
    if internal_academic.curso_livre_disciplina_em_uso_operacional(
      v_discipline.id
    ) then
      return true;
    end if;
  end loop;
  for v_module in
    select module.id
    from public.modulos module
    where module.curso_id = p_curso_id
    order by module.id
  loop
    if internal_academic.curso_livre_modulo_em_uso_operacional(v_module.id) then
      return true;
    end if;
  end loop;
  return false;
end;
$function$;

revoke all on function internal_academic.curso_livre_curso_em_uso_operacional(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.get_curso_livre_grade_lock_payload(
  p_curso_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if internal_academic.curso_livre_grade_tem_tentativa(p_curso_id) then
    return jsonb_build_object(
      'estruturaBloqueada', true,
      'motivoBloqueio', 'TENTATIVA_REGISTRADA'
    );
  end if;
  if internal_academic.curso_livre_curso_em_uso_operacional(p_curso_id) then
    return jsonb_build_object(
      'estruturaBloqueada', true,
      'motivoBloqueio', 'USO_OPERACIONAL'
    );
  end if;
  return jsonb_build_object(
    'estruturaBloqueada', false,
    'motivoBloqueio', null
  );
end;
$function$;

revoke all on function internal_academic.get_curso_livre_grade_lock_payload(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.get_curso_livre_grade_workspace_payload(
  p_curso_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select internal_academic.get_curso_livre_grade_payload(p_curso_id)
    || internal_academic.get_curso_livre_grade_lock_payload(p_curso_id);
$function$;

revoke all on function internal_academic.get_curso_livre_grade_workspace_payload(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.obter_grade_curso_livre_gestao_secure(
  p_curso_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform internal_academic.assert_can_manage_curso_livre(p_curso_id);
  return internal_academic.get_curso_livre_grade_workspace_payload(p_curso_id)
    || jsonb_build_object('replayed', false);
end;
$function$;

revoke all on function public.obter_grade_curso_livre_gestao_secure(uuid)
  from public, anon, authenticated;
grant execute on function public.obter_grade_curso_livre_gestao_secure(uuid)
  to authenticated, service_role;

create or replace function internal_academic.guard_curso_livre_module_operational_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_curso_id uuid;
  v_new_curso_id uuid;
  v_old_livre boolean := false;
  v_new_livre boolean := false;
  v_old_course_used boolean := false;
  v_new_course_used boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_old_curso_id := old.curso_id;
    select upper(coalesce(course.modalidade, '')) = 'LIVRE' into v_old_livre
    from public.cursos course where course.id = v_old_curso_id;
    if coalesce(v_old_livre, false) then
      v_old_course_used := internal_academic.curso_livre_curso_em_uso_operacional(
        v_old_curso_id
      );
    end if;
  end if;
  if tg_op <> 'DELETE' then
    v_new_curso_id := new.curso_id;
    select upper(coalesce(course.modalidade, '')) = 'LIVRE' into v_new_livre
    from public.cursos course where course.id = v_new_curso_id;
    if coalesce(v_new_livre, false) then
      v_new_course_used := internal_academic.curso_livre_curso_em_uso_operacional(
        v_new_curso_id
      );
    end if;
  end if;

  if tg_op = 'INSERT' and v_new_course_used then
    raise exception 'Curso Livre em uso acadêmico não aceita novo módulo.'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' and v_old_course_used then
    raise exception 'Curso Livre em uso acadêmico não aceita remover módulo.'
      using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and (v_old_course_used or v_new_course_used)
    and pg_catalog.to_jsonb(new) - 'descricao'
      is distinct from pg_catalog.to_jsonb(old) - 'descricao' then
    raise exception 'Curso Livre em uso acadêmico aceita somente alterar resumos.'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function internal_academic.guard_curso_livre_module_operational_use()
  from public, anon, authenticated, service_role;
create trigger guard_curso_livre_module_operational_use_trigger
before insert or update or delete on public.modulos
for each row execute function internal_academic.guard_curso_livre_module_operational_use();

create or replace function internal_academic.guard_curso_livre_discipline_operational_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_curso_id uuid;
  v_new_curso_id uuid;
  v_old_livre boolean := false;
  v_new_livre boolean := false;
  v_old_course_used boolean := false;
  v_new_course_used boolean := false;
begin
  if tg_op <> 'INSERT' then
    select module.curso_id, upper(coalesce(course.modalidade, '')) = 'LIVRE'
      into v_old_curso_id, v_old_livre
    from public.modulos module
    join public.cursos course on course.id = module.curso_id
    where module.id = old.modulo_id;
    if coalesce(v_old_livre, false) then
      v_old_course_used := internal_academic.curso_livre_curso_em_uso_operacional(
        v_old_curso_id
      );
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select module.curso_id, upper(coalesce(course.modalidade, '')) = 'LIVRE'
      into v_new_curso_id, v_new_livre
    from public.modulos module
    join public.cursos course on course.id = module.curso_id
    where module.id = new.modulo_id;
    if coalesce(v_new_livre, false) then
      v_new_course_used := internal_academic.curso_livre_curso_em_uso_operacional(
        v_new_curso_id
      );
    end if;
  end if;

  if tg_op = 'INSERT' and v_new_course_used then
    raise exception 'Curso Livre em uso acadêmico não aceita nova disciplina.'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' and v_old_course_used then
    raise exception 'Curso Livre em uso acadêmico não aceita remover disciplina.'
      using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and (v_old_course_used or v_new_course_used)
    and pg_catalog.to_jsonb(new) - 'descricao'
      is distinct from pg_catalog.to_jsonb(old) - 'descricao' then
    raise exception 'Curso Livre em uso acadêmico aceita somente alterar resumos.'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function internal_academic.guard_curso_livre_discipline_operational_use()
  from public, anon, authenticated, service_role;
create trigger guard_curso_livre_discipline_operational_use_trigger
before insert or update or delete on public.disciplinas
for each row execute function internal_academic.guard_curso_livre_discipline_operational_use();

create or replace function internal_academic.guard_curso_livre_lesson_operational_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_curso_id uuid;
  v_new_curso_id uuid;
  v_old_livre boolean := false;
  v_new_livre boolean := false;
  v_old_course_used boolean := false;
  v_new_course_used boolean := false;
begin
  if tg_op <> 'INSERT' then
    select module.curso_id, upper(coalesce(course.modalidade, '')) = 'LIVRE'
      into v_old_curso_id, v_old_livre
    from public.disciplinas discipline
    join public.modulos module on module.id = discipline.modulo_id
    join public.cursos course on course.id = module.curso_id
    where discipline.id = old.disciplina_id;
    if coalesce(v_old_livre, false) then
      v_old_course_used := internal_academic.curso_livre_curso_em_uso_operacional(
        v_old_curso_id
      );
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select module.curso_id, upper(coalesce(course.modalidade, '')) = 'LIVRE'
      into v_new_curso_id, v_new_livre
    from public.disciplinas discipline
    join public.modulos module on module.id = discipline.modulo_id
    join public.cursos course on course.id = module.curso_id
    where discipline.id = new.disciplina_id;
    if coalesce(v_new_livre, false) then
      v_new_course_used := internal_academic.curso_livre_curso_em_uso_operacional(
        v_new_curso_id
      );
    end if;
  end if;

  if tg_op = 'INSERT' and v_new_course_used then
    raise exception 'Curso Livre em uso acadêmico não aceita nova aula de grade.'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' and v_old_course_used then
    raise exception 'Curso Livre em uso acadêmico não aceita remover aula de grade.'
      using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and (v_old_course_used or v_new_course_used)
    and pg_catalog.to_jsonb(new) - 'descricao'
      is distinct from pg_catalog.to_jsonb(old) - 'descricao' then
    raise exception 'Curso Livre em uso acadêmico aceita somente alterar resumos.'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function internal_academic.guard_curso_livre_lesson_operational_use()
  from public, anon, authenticated, service_role;
create trigger guard_curso_livre_lesson_operational_use_trigger
before insert or update or delete on public.aulas
for each row execute function internal_academic.guard_curso_livre_lesson_operational_use();

commit;
