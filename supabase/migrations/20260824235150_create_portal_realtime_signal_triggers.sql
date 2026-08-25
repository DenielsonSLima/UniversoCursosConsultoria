begin;

create or replace function public.emit_portal_student_direct_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_aluno_id uuid;
  v_new_aluno_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_aluno_id := old.aluno_id;
    perform public.insert_portal_realtime_signal(
      'portal:gestor:aluno:' || v_old_aluno_id::text || ':' || tg_argv[0],
      'GESTOR_ALUNO',
      v_old_aluno_id
    );
  end if;

  if tg_op <> 'DELETE' then
    v_new_aluno_id := new.aluno_id;
    if tg_op = 'INSERT' or v_new_aluno_id is distinct from v_old_aluno_id then
      perform public.insert_portal_realtime_signal(
        'portal:gestor:aluno:' || v_new_aluno_id::text || ':' || tg_argv[0],
        'GESTOR_ALUNO',
        v_new_aluno_id
      );
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.emit_portal_student_release_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_aluno_id uuid;
  v_new_aluno_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_aluno_id := old.aluno_id;
    perform public.insert_portal_realtime_signal(
      'portal:gestor:aluno:' || v_old_aluno_id::text || ':matricula',
      'GESTOR_ALUNO',
      v_old_aluno_id
    );
  end if;

  if tg_op <> 'DELETE' then
    v_new_aluno_id := new.aluno_id;
    if tg_op = 'INSERT' or v_new_aluno_id is distinct from v_old_aluno_id then
      perform public.insert_portal_realtime_signal(
        'portal:gestor:aluno:' || v_new_aluno_id::text || ':matricula',
        'GESTOR_ALUNO',
        v_new_aluno_id
      );
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.emit_portal_professor_academic_signal(
  p_professor_id uuid,
  p_polo_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_professor_id is null or p_polo_id is null then
    return;
  end if;

  perform public.insert_portal_realtime_signal(
    'portal:professor:' || p_professor_id::text
      || ':polo:' || p_polo_id::text || ':academico',
    'PROFESSOR_POLO',
    p_professor_id,
    p_polo_id
  );
end;
$function$;

create or replace function public.emit_portal_academic_context_signal(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment record;
begin
  for v_assignment in
    select distinct assignment.professor_id, class.polo_id
    from public.turmas_disciplinas assignment
    join public.turmas class on class.id = assignment.turma_id
    where assignment.turma_id = p_turma_id
      and assignment.professor_id is not null
      and (
        p_disciplina_id is null
        or assignment.disciplina_id = p_disciplina_id
      )
  loop
    perform public.emit_portal_professor_academic_signal(
      v_assignment.professor_id,
      v_assignment.polo_id
    );
  end loop;
end;
$function$;

create or replace function public.emit_portal_assignment_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_polo_id uuid;
  v_new_polo_id uuid;
begin
  if tg_op <> 'INSERT' then
    select class.polo_id into v_old_polo_id
    from public.turmas class where class.id = old.turma_id;
    perform public.emit_portal_professor_academic_signal(
      old.professor_id, v_old_polo_id
    );
  end if;

  if tg_op <> 'DELETE' then
    select class.polo_id into v_new_polo_id
    from public.turmas class where class.id = new.turma_id;
    if tg_op = 'INSERT'
      or new.professor_id is distinct from old.professor_id
      or new.turma_id is distinct from old.turma_id
      or v_new_polo_id is distinct from v_old_polo_id then
      perform public.emit_portal_professor_academic_signal(
        new.professor_id, v_new_polo_id
      );
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.emit_portal_academic_row_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_disciplina_id uuid;
  v_new_disciplina_id uuid;
begin
  if tg_op <> 'INSERT' then
    if tg_table_name in ('aulas_turma', 'atividades_extra_classe') then
      v_old_disciplina_id := old.disciplina_id;
    end if;
    perform public.emit_portal_academic_context_signal(
      old.turma_id, v_old_disciplina_id
    );
  end if;

  if tg_op <> 'DELETE' then
    if tg_table_name in ('aulas_turma', 'atividades_extra_classe') then
      v_new_disciplina_id := new.disciplina_id;
    end if;
    if tg_op = 'INSERT'
      or new.turma_id is distinct from old.turma_id
      or v_new_disciplina_id is distinct from v_old_disciplina_id then
      perform public.emit_portal_academic_context_signal(
        new.turma_id, v_new_disciplina_id
      );
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.emit_portal_turma_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment record;
begin
  if tg_op <> 'INSERT' then
    for v_assignment in
      select distinct assignment.professor_id
      from public.turmas_disciplinas assignment
      where assignment.turma_id = old.id
        and assignment.professor_id is not null
    loop
      perform public.emit_portal_professor_academic_signal(
        v_assignment.professor_id, old.polo_id
      );
      if tg_op = 'UPDATE' and new.polo_id is distinct from old.polo_id then
        perform public.emit_portal_professor_academic_signal(
          v_assignment.professor_id, new.polo_id
        );
      end if;
    end loop;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.emit_portal_disciplina_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment record;
begin
  if tg_op <> 'INSERT' then
    for v_assignment in
      select distinct assignment.professor_id, class.polo_id, assignment.turma_id
      from public.turmas_disciplinas assignment
      join public.turmas class on class.id = assignment.turma_id
      where assignment.disciplina_id = old.id
        and assignment.professor_id is not null
    loop
      perform public.emit_portal_professor_academic_signal(
        v_assignment.professor_id,
        v_assignment.polo_id
      );
    end loop;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists portal_signal_matriculas on public.matriculas;
create trigger portal_signal_matriculas before insert or update or delete
on public.matriculas for each row
execute function public.emit_portal_student_direct_signal('matricula');

drop trigger if exists portal_signal_matricula_liberacoes on public.matricula_liberacoes_diario;
create trigger portal_signal_matricula_liberacoes before insert or update or delete
on public.matricula_liberacoes_diario for each row
execute function public.emit_portal_student_release_signal();

drop trigger if exists portal_signal_aluno_vacinas on public.aluno_vacinas;
create trigger portal_signal_aluno_vacinas before insert or update or delete
on public.aluno_vacinas for each row
execute function public.emit_portal_student_direct_signal('vacinas');

drop trigger if exists portal_signal_turmas_disciplinas on public.turmas_disciplinas;
create trigger portal_signal_turmas_disciplinas before insert or update or delete
on public.turmas_disciplinas for each row
execute function public.emit_portal_assignment_signal();

drop trigger if exists portal_signal_aulas_turma on public.aulas_turma;
create trigger portal_signal_aulas_turma before insert or update or delete
on public.aulas_turma for each row execute function public.emit_portal_academic_row_signal();

drop trigger if exists portal_signal_atividades_extra on public.atividades_extra_classe;
create trigger portal_signal_atividades_extra before insert or update or delete
on public.atividades_extra_classe for each row execute function public.emit_portal_academic_row_signal();

drop trigger if exists portal_signal_periodos_letivos on public.periodos_letivos;
create trigger portal_signal_periodos_letivos before insert or update or delete
on public.periodos_letivos for each row execute function public.emit_portal_academic_row_signal();

drop trigger if exists portal_signal_turmas on public.turmas;
create trigger portal_signal_turmas before update or delete
on public.turmas for each row execute function public.emit_portal_turma_signal();

drop trigger if exists portal_signal_disciplinas on public.disciplinas;
create trigger portal_signal_disciplinas before update or delete
on public.disciplinas for each row execute function public.emit_portal_disciplina_signal();

revoke all on function public.emit_portal_student_direct_signal() from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_student_release_signal() from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_professor_academic_signal(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_academic_context_signal(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_assignment_signal() from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_academic_row_signal() from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_turma_signal() from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_disciplina_signal() from public, anon, authenticated, service_role;
commit;
