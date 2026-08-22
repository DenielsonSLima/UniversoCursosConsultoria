begin;

create table public.turmas_livres_academico (
  turma_id uuid primary key references public.turmas(id) on delete cascade,
  avaliacao_id uuid references public.curso_livre_avaliacoes(id) on delete restrict,
  professor_id uuid references public.parceiros(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index turmas_livres_academico_avaliacao_idx
  on public.turmas_livres_academico(avaliacao_id)
  where avaliacao_id is not null;
create index turmas_livres_academico_professor_idx
  on public.turmas_livres_academico(professor_id)
  where professor_id is not null;

alter table public.turmas_livres_academico enable row level security;
revoke all on table public.turmas_livres_academico
  from public, anon, authenticated;
grant all on table public.turmas_livres_academico to service_role;

create or replace function internal_academic.validate_turma_livre_academico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course_id uuid;
begin
  select class.curso_id into v_course_id
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = new.turma_id
    and upper(coalesce(course.modalidade, '')) = 'LIVRE';
  if not found then
    raise exception 'A configuração acadêmica exige uma turma de Curso Livre.'
      using errcode = '23514';
  end if;
  if new.avaliacao_id is not null and not exists (
    select 1 from public.curso_livre_avaliacoes assessment
    where assessment.id = new.avaliacao_id
      and assessment.curso_id = v_course_id
      and assessment.status = 'PUBLICADA'
  ) then
    raise exception 'A turma Livre deve fixar uma avaliação publicada do próprio curso.'
      using errcode = '23514';
  end if;
  if new.professor_id is not null and not exists (
    select 1 from public.parceiros professor
    where professor.id = new.professor_id
      and upper(coalesce(professor.tipo, '')) = 'PROFESSOR'
      and upper(coalesce(professor.status, '')) = 'ATIVO'
  ) then
    raise exception 'A turma Livre exige um professor ativo.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function internal_academic.validate_turma_livre_academico()
  from public, anon, authenticated, service_role;
create trigger validate_turma_livre_academico_trigger
before insert or update on public.turmas_livres_academico
for each row execute function internal_academic.validate_turma_livre_academico();

do $backfill$
begin
  if exists (
    select 1
    from public.turmas_disciplinas binding
    join public.turmas class on class.id = binding.turma_id
    join public.cursos course on course.id = class.curso_id
    where upper(coalesce(course.modalidade, '')) = 'LIVRE'
      and binding.professor_id is not null
    group by binding.turma_id
    having count(distinct binding.professor_id) > 1
  ) then
    raise exception 'Backfill bloqueado: turma Livre possui mais de um professor.';
  end if;
end;
$backfill$;

insert into public.turmas_livres_academico(turma_id, avaliacao_id, professor_id)
select class.id,
  (
    select assessment.id
    from public.curso_livre_avaliacoes assessment
    where assessment.curso_id = class.curso_id
      and assessment.status = 'PUBLICADA'
    order by assessment.versao desc limit 1
  ),
  (
    select binding.professor_id
    from public.turmas_disciplinas binding
    where binding.turma_id = class.id and binding.professor_id is not null
    order by binding.created_at, binding.disciplina_id
    limit 1
  )
from public.turmas class
join public.cursos course on course.id = class.curso_id
where upper(coalesce(course.modalidade, '')) = 'LIVRE'
on conflict (turma_id) do nothing;

insert into public.turmas_disciplinas(turma_id, disciplina_id)
select class.id, discipline.id
from public.turmas class
join public.cursos course on course.id = class.curso_id
join public.modulos module on module.curso_id = course.id
join public.disciplinas discipline on discipline.modulo_id = module.id
where upper(coalesce(course.modalidade, '')) = 'LIVRE'
on conflict (turma_id, disciplina_id) do nothing;

create or replace function internal_academic.sync_turma_livre_structure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_livre boolean;
  v_old_is_livre boolean := false;
begin
  select upper(coalesce(course.modalidade, '')) = 'LIVRE' into v_is_livre
  from public.cursos course where course.id = new.curso_id;
  if tg_op = 'UPDATE' and new.curso_id is distinct from old.curso_id then
    select upper(coalesce(course.modalidade, '')) = 'LIVRE' into v_old_is_livre
    from public.cursos course where course.id = old.curso_id;
    if coalesce(v_is_livre, false) or coalesce(v_old_is_livre, false) then
      raise exception 'O curso de uma turma Livre é imutável.' using errcode = '55000';
    end if;
  end if;
  if not coalesce(v_is_livre, false) then return new; end if;

  insert into public.turmas_livres_academico(turma_id, avaliacao_id)
  values (
    new.id,
    (select assessment.id from public.curso_livre_avaliacoes assessment
     where assessment.curso_id = new.curso_id and assessment.status = 'PUBLICADA'
     order by assessment.versao desc limit 1)
  ) on conflict (turma_id) do nothing;

  perform pg_catalog.set_config('app.curso_livre_structure_sync', 'on', true);
  insert into public.turmas_disciplinas(turma_id, disciplina_id)
  select new.id, discipline.id
  from public.modulos module
  join public.disciplinas discipline on discipline.modulo_id = module.id
  where module.curso_id = new.curso_id
  on conflict (turma_id, disciplina_id) do nothing;
  return new;
end;
$function$;

revoke all on function internal_academic.sync_turma_livre_structure()
  from public, anon, authenticated, service_role;
create trigger sync_turma_livre_structure_trigger
after insert or update of curso_id on public.turmas
for each row execute function internal_academic.sync_turma_livre_structure();

create or replace function internal_academic.sync_disciplina_to_turmas_livres()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform pg_catalog.set_config('app.curso_livre_structure_sync', 'on', true);
  insert into public.turmas_disciplinas(turma_id, disciplina_id)
  select class.id, new.id
  from public.modulos module
  join public.turmas class on class.curso_id = module.curso_id
  join public.cursos course on course.id = class.curso_id
  where module.id = new.modulo_id
    and upper(coalesce(course.modalidade, '')) = 'LIVRE'
  on conflict (turma_id, disciplina_id) do nothing;
  return new;
end;
$function$;

revoke all on function internal_academic.sync_disciplina_to_turmas_livres()
  from public, anon, authenticated, service_role;
create trigger sync_disciplina_to_turmas_livres_trigger
after insert on public.disciplinas
for each row execute function internal_academic.sync_disciplina_to_turmas_livres();

create or replace function internal_academic.enforce_turma_livre_single_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_teacher_name text;
  v_is_livre boolean;
begin
  select upper(coalesce(course.modalidade, '')) = 'LIVRE'
  into v_is_livre
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = case when tg_op = 'DELETE' then old.turma_id else new.turma_id end;
  if not coalesce(v_is_livre, false) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if coalesce(pg_catalog.current_setting('app.curso_livre_structure_sync', true), '') <> 'on' then
      raise exception 'Todas as disciplinas do Curso Livre devem permanecer vinculadas à turma.'
        using errcode = '23514';
    end if;
    return old;
  end if;
  if not exists (
    select 1 from public.turmas class
    join public.modulos module on module.curso_id = class.curso_id
    join public.disciplinas discipline on discipline.modulo_id = module.id
    where class.id = new.turma_id and discipline.id = new.disciplina_id
  ) then
    raise exception 'A disciplina não pertence ao Curso Livre da turma.' using errcode = '23514';
  end if;
  select config.professor_id, professor.nome
  into v_teacher_id, v_teacher_name
  from public.turmas_livres_academico config
  left join public.parceiros professor on professor.id = config.professor_id
  where config.turma_id = new.turma_id;
  new.professor_id := v_teacher_id;
  new.professor_nome := v_teacher_name;
  return new;
end;
$function$;

revoke all on function internal_academic.enforce_turma_livre_single_teacher()
  from public, anon, authenticated, service_role;
create trigger enforce_turma_livre_single_teacher_trigger
before insert or update of turma_id, disciplina_id, professor_id, professor_nome
or delete on public.turmas_disciplinas
for each row execute function internal_academic.enforce_turma_livre_single_teacher();

create or replace function internal_academic.sync_turma_livre_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.professor_id is distinct from old.professor_id then
    perform pg_catalog.set_config('app.curso_livre_structure_sync', 'on', true);
    update public.turmas_disciplinas binding
    set professor_id = new.professor_id,
        professor_nome = professor.nome
    from public.parceiros professor
    where binding.turma_id = new.turma_id
      and professor.id = new.professor_id;
    if new.professor_id is null then
      update public.turmas_disciplinas binding
      set professor_id = null, professor_nome = null
      where binding.turma_id = new.turma_id;
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.sync_turma_livre_teacher()
  from public, anon, authenticated, service_role;
create trigger sync_turma_livre_teacher_trigger
after update of professor_id on public.turmas_livres_academico
for each row execute function internal_academic.sync_turma_livre_teacher();

select pg_catalog.set_config('app.curso_livre_structure_sync', 'on', true);
update public.turmas_disciplinas binding
set professor_id = config.professor_id,
    professor_nome = (
      select professor.nome from public.parceiros professor
      where professor.id = config.professor_id
    )
from public.turmas_livres_academico config
where config.turma_id = binding.turma_id
  and (binding.professor_id, binding.professor_nome) is distinct from (
    config.professor_id,
    (select professor.nome from public.parceiros professor
     where professor.id = config.professor_id)
  );

create or replace function internal_academic.pin_published_assessment_to_livre_classes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'PUBLICADA' and old.status <> 'PUBLICADA' then
    update public.turmas_livres_academico config
    set avaliacao_id = new.id
    from public.turmas class
    where config.turma_id = class.id
      and class.curso_id = new.curso_id
      and config.avaliacao_id is null;
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.pin_published_assessment_to_livre_classes()
  from public, anon, authenticated, service_role;
create trigger pin_published_assessment_to_livre_classes_trigger
after update of status on public.curso_livre_avaliacoes
for each row execute function internal_academic.pin_published_assessment_to_livre_classes();

alter function public.atribuir_docente_disciplinas_turma(uuid, uuid[], uuid)
  set schema internal_academic;
alter function internal_academic.atribuir_docente_disciplinas_turma(uuid, uuid[], uuid)
  rename to atribuir_docente_disciplinas_turma_pre_livre;
revoke all on function internal_academic.atribuir_docente_disciplinas_turma_pre_livre(uuid, uuid[], uuid)
  from public, anon, authenticated, service_role;

create or replace function public.atribuir_docente_disciplinas_turma(
  p_turma_id uuid, p_disciplina_ids uuid[], p_professor_id uuid
)
returns table(disciplina_id uuid, professor_id uuid, professor_nome text, concluida boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mode text;
  v_expected uuid[];
begin
  select upper(coalesce(course.modalidade, '')) into v_mode
  from public.turmas class join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if v_mode is distinct from 'LIVRE' then
    return query select * from internal_academic.atribuir_docente_disciplinas_turma_pre_livre(
      p_turma_id, p_disciplina_ids, p_professor_id
    );
    return;
  end if;
  if not public.can_operate_turma_academics(p_turma_id) then
    raise exception 'Sem permissão para atribuir professor nesta turma Livre.'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.turmas class
    where class.id = p_turma_id and upper(coalesce(class.status, '')) = 'FINALIZADA'
  ) then
    raise exception 'Turma Livre finalizada não permite alterar o professor.'
      using errcode = '55000';
  end if;
  select array_agg(binding.disciplina_id order by binding.disciplina_id)
  into v_expected from public.turmas_disciplinas binding
  where binding.turma_id = p_turma_id;
  if v_expected is distinct from (
    select array_agg(distinct requested.id order by requested.id)
    from unnest(p_disciplina_ids) as requested(id)
  ) then
    raise exception 'O professor único deve ser aplicado a todas as disciplinas da turma Livre.'
      using errcode = '23514';
  end if;
  update public.turmas_livres_academico config
  set professor_id = p_professor_id where config.turma_id = p_turma_id;
  return query
  select binding.disciplina_id, binding.professor_id, binding.professor_nome, binding.concluida
  from public.turmas_disciplinas binding
  where binding.turma_id = p_turma_id order by binding.disciplina_id;
end;
$function$;

revoke all on function public.atribuir_docente_disciplinas_turma(uuid, uuid[], uuid)
  from public, anon;
grant execute on function public.atribuir_docente_disciplinas_turma(uuid, uuid[], uuid)
  to authenticated, service_role;

commit;
