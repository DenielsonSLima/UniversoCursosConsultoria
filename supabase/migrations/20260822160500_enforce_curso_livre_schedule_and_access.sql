begin;

create or replace function internal_academic.guard_curso_livre_meeting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid := case when tg_op = 'DELETE' then old.turma_id else new.turma_id end;
  v_disciplina_id uuid := case when tg_op = 'DELETE' then old.disciplina_id else new.disciplina_id end;
  v_start date;
  v_end date;
  v_course_id uuid;
  v_course_hours numeric;
  v_discipline_hours numeric;
  v_is_livre boolean;
  v_planned_course numeric;
  v_planned_discipline numeric;
begin
  if tg_op = 'UPDATE' and new.turma_id is distinct from old.turma_id
    and exists (
      select 1 from public.turmas old_class
      join public.cursos old_course on old_course.id = old_class.curso_id
      where old_class.id = old.turma_id
        and upper(coalesce(old_course.modalidade, '')) = 'LIVRE'
    )
  then
    raise exception 'Uma aula Livre não pode ser transferida para outra turma.'
      using errcode = '55000';
  end if;
  select class.data_inicio, class.data_previsao_termino, class.curso_id,
    course.carga_horaria::numeric,
    upper(coalesce(course.modalidade, '')) = 'LIVRE'
  into v_start, v_end, v_course_id, v_course_hours, v_is_livre
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = v_turma_id;
  if not coalesce(v_is_livre, false) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'curso-livre-schedule:' || v_turma_id::text, 0
  ));
  if exists (
    select 1 from public.curso_livre_tentativas attempt
    join public.matriculas enrollment on enrollment.id = attempt.matricula_id
    where enrollment.turma_id = v_turma_id
  ) then
    raise exception 'O cronograma não pode mudar após o início de uma tentativa.'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.data_aula is null or v_start is null or v_end is null
    or new.data_aula not between v_start and v_end then
    raise exception 'A aula Livre deve ocorrer entre o início e o fim da turma.'
      using errcode = '23514';
  end if;
  if new.carga_horaria is null or new.carga_horaria <= 0 then
    raise exception 'A carga da aula Livre deve ser maior que zero.'
      using errcode = '23514';
  end if;
  select discipline.carga_horaria::numeric into v_discipline_hours
  from public.disciplinas discipline
  join public.modulos module on module.id = discipline.modulo_id
  where discipline.id = new.disciplina_id and module.curso_id = v_course_id;
  if not found or not exists (
    select 1 from public.turmas_disciplinas binding
    where binding.turma_id = new.turma_id
      and binding.disciplina_id = new.disciplina_id
  ) then
    raise exception 'A aula deve usar uma disciplina vinculada ao Curso Livre.'
      using errcode = '23514';
  end if;
  select coalesce(sum(meeting.carga_horaria), 0)
  into v_planned_course
  from public.aulas_turma meeting
  where meeting.turma_id = new.turma_id
    and (tg_op <> 'UPDATE' or meeting.id <> old.id);
  select coalesce(sum(meeting.carga_horaria), 0)
  into v_planned_discipline
  from public.aulas_turma meeting
  where meeting.turma_id = new.turma_id
    and meeting.disciplina_id = new.disciplina_id
    and (tg_op <> 'UPDATE' or meeting.id <> old.id);
  if v_planned_course + new.carga_horaria > v_course_hours then
    raise exception 'As aulas excedem a carga horária total do Curso Livre.'
      using errcode = '23514';
  end if;
  if v_planned_discipline + new.carga_horaria > v_discipline_hours then
    raise exception 'As aulas excedem a carga horária da disciplina.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_curso_livre_meeting()
  from public, anon, authenticated, service_role;
create trigger guard_curso_livre_meeting_trigger
before insert or update or delete on public.aulas_turma
for each row execute function internal_academic.guard_curso_livre_meeting();

create or replace function internal_academic.guard_curso_livre_class_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_new_mode text;
  v_old_mode text;
begin
  select upper(coalesce(course.modalidade, '')) into v_new_mode
  from public.cursos course where course.id = new.curso_id;
  if tg_op = 'UPDATE' then
    select upper(coalesce(course.modalidade, '')) into v_old_mode
    from public.cursos course where course.id = old.curso_id;
    if (v_new_mode = 'LIVRE' or v_old_mode = 'LIVRE')
      and new.curso_id is distinct from old.curso_id then
      raise exception 'O curso de uma turma Livre é imutável.' using errcode = '55000';
    end if;
  end if;
  if v_new_mode <> 'LIVRE' then return new; end if;
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'curso-livre-schedule:' || new.id::text, 0
  ));
  if new.data_inicio is null or new.data_previsao_termino is null
    or new.data_previsao_termino < new.data_inicio then
    raise exception 'A turma Livre exige datas de início e fim válidas.'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.aulas_turma meeting
    where meeting.turma_id = new.id
      and (meeting.data_aula < new.data_inicio
        or meeting.data_aula > new.data_previsao_termino)
  ) then
    raise exception 'As novas datas deixam aulas Livres fora do período da turma.'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
    and (new.data_inicio, new.data_previsao_termino)
      is distinct from (old.data_inicio, old.data_previsao_termino)
    and exists (
      select 1 from public.curso_livre_tentativas attempt
      join public.matriculas enrollment on enrollment.id = attempt.matricula_id
      where enrollment.turma_id = new.id
    )
  then
    raise exception 'As datas da turma não mudam após o início de uma tentativa.'
      using errcode = '55000';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_curso_livre_class_dates()
  from public, anon, authenticated, service_role;
create trigger guard_curso_livre_class_dates_trigger
before insert or update of curso_id, data_inicio, data_previsao_termino on public.turmas
for each row execute function internal_academic.guard_curso_livre_class_dates();

create or replace function public.is_aluno_matriculado_turma(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    join public.cursos course on course.id = class.curso_id
    where enrollment.turma_id = p_turma_id
      and enrollment.aluno_id = (select public.current_aluno_id())
      and case upper(coalesce(course.modalidade, ''))
        when 'TECNICO' then (
          (class.status = 'EM_ANDAMENTO' and upper(coalesce(enrollment.status, '')) = 'ATIVO')
          or (class.status = 'FINALIZADA' and upper(coalesce(enrollment.status, '')) in (
            'CONCLUIDO', 'REPROVADO', 'EM_DEPENDENCIA'
          ))
        )
        when 'LIVRE' then upper(coalesce(enrollment.status, '')) in ('ATIVO', 'CONCLUIDO')
        else true
      end
  );
$function$;

revoke all on function public.is_aluno_matriculado_turma(uuid) from public, anon;
grant execute on function public.is_aluno_matriculado_turma(uuid)
  to authenticated, service_role;

commit;
