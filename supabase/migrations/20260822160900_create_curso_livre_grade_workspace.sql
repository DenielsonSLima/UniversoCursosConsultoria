begin;

alter table public.modulos
  add column if not exists descricao text not null default '';

alter table public.aulas
  add column if not exists descricao text not null default '',
  add column if not exists ordem integer;

with ranked_lessons as (
  select
    lesson.id,
    row_number() over (
      partition by lesson.disciplina_id
      order by lesson.created_at, lesson.id
    )::integer as ordem
  from public.aulas lesson
)
update public.aulas lesson
set ordem = ranked.ordem
from ranked_lessons ranked
where lesson.id = ranked.id
  and lesson.ordem is null;

create index if not exists aulas_disciplina_ordem_idx
  on public.aulas(disciplina_id, ordem);

create table internal_academic.curso_livre_grade_requests (
  request_id uuid primary key,
  actor_id uuid,
  curso_id uuid not null,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

revoke all on table internal_academic.curso_livre_grade_requests
  from public, anon, authenticated, service_role;

create or replace function internal_academic.assert_can_operate_curso_livre_grade(
  p_curso_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce((select auth.role()), '') = 'service_role' then
    return;
  end if;

  if exists (
    select 1
    from public.turmas class
    where class.curso_id = p_curso_id
      and not coalesce(public.can_operate_turma_academics(class.id), false)
  ) then
    raise exception 'Sem permissão acadêmica em todas as turmas deste Curso Livre.'
      using errcode = '42501';
  end if;
end;
$function$;

revoke all on function internal_academic.assert_can_operate_curso_livre_grade(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.get_curso_livre_grade_payload(
  p_curso_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_modules jsonb;
  v_payload jsonb;
  v_fingerprint text;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', module.id,
      'nome', module.nome,
      'descricao', coalesce(module.descricao, ''),
      'disciplinas', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', discipline.id,
            'nome', discipline.nome,
            'cargaHoraria', discipline.carga_horaria,
            'cargaHorariaTeoria', coalesce(discipline.carga_horaria_teoria, 0),
            'cargaHorariaPratica', coalesce(discipline.carga_horaria_pratica, 0),
            'cargaHorariaEstagio', coalesce(discipline.carga_horaria_estagio, 0),
            'descricao', coalesce(discipline.descricao, ''),
            'aulas', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', lesson.id,
                  'titulo', lesson.titulo,
                  'cargaHoraria', lesson.carga_horaria,
                  'descricao', coalesce(lesson.descricao, '')
                ) order by coalesce(lesson.ordem, 2147483647), lesson.created_at, lesson.id
              )
              from public.aulas lesson
              where lesson.disciplina_id = discipline.id
            ), '[]'::jsonb)
          ) order by coalesce(discipline.ordem, 2147483647), discipline.created_at, discipline.id
        )
        from public.disciplinas discipline
        where discipline.modulo_id = module.id
      ), '[]'::jsonb)
    ) order by coalesce(module.ordem, 2147483647), module.created_at, module.id
  ), '[]'::jsonb)
  into v_modules
  from public.modulos module
  where module.curso_id = p_curso_id;

  v_payload := jsonb_build_object(
    'cursoId', p_curso_id,
    'modulos', v_modules
  );
  v_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return v_payload || jsonb_build_object('fingerprint', v_fingerprint);
end;
$function$;

revoke all on function internal_academic.get_curso_livre_grade_payload(uuid)
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
  return internal_academic.get_curso_livre_grade_payload(p_curso_id)
    || jsonb_build_object('replayed', false);
end;
$function$;

revoke all on function public.obter_grade_curso_livre_gestao_secure(uuid)
  from public, anon, authenticated;
grant execute on function public.obter_grade_curso_livre_gestao_secure(uuid)
  to authenticated, service_role;

drop policy if exists portal_modulos_write_global on public.modulos;
create policy portal_modulos_write_global on public.modulos
for all to authenticated
using (
  public.is_gestor_global()
  and public.gestor_can_manage_curso(curso_id)
  and not exists (
    select 1 from public.cursos course
    where course.id = curso_id and upper(coalesce(course.modalidade, '')) = 'LIVRE'
  )
)
with check (
  public.is_gestor_global()
  and public.gestor_can_manage_curso(curso_id)
  and not exists (
    select 1 from public.cursos course
    where course.id = curso_id and upper(coalesce(course.modalidade, '')) = 'LIVRE'
  )
);

drop policy if exists portal_disciplinas_write_global on public.disciplinas;
create policy portal_disciplinas_write_global on public.disciplinas
for all to authenticated
using (
  public.is_gestor_global() and exists (
    select 1
    from public.modulos module
    join public.cursos course on course.id = module.curso_id
    where module.id = modulo_id
      and public.gestor_can_manage_curso(module.curso_id)
      and upper(coalesce(course.modalidade, '')) <> 'LIVRE'
  )
)
with check (
  public.is_gestor_global() and exists (
    select 1
    from public.modulos module
    join public.cursos course on course.id = module.curso_id
    where module.id = modulo_id
      and public.gestor_can_manage_curso(module.curso_id)
      and upper(coalesce(course.modalidade, '')) <> 'LIVRE'
  )
);

drop policy if exists portal_aulas_write_global on public.aulas;
create policy portal_aulas_write_global on public.aulas
for all to authenticated
using (
  public.is_gestor_global() and exists (
    select 1
    from public.disciplinas discipline
    join public.modulos module on module.id = discipline.modulo_id
    join public.cursos course on course.id = module.curso_id
    where discipline.id = disciplina_id
      and public.gestor_can_manage_curso(module.curso_id)
      and upper(coalesce(course.modalidade, '')) <> 'LIVRE'
  )
)
with check (
  public.is_gestor_global() and exists (
    select 1
    from public.disciplinas discipline
    join public.modulos module on module.id = discipline.modulo_id
    join public.cursos course on course.id = module.curso_id
    where discipline.id = disciplina_id
      and public.gestor_can_manage_curso(module.curso_id)
      and upper(coalesce(course.modalidade, '')) <> 'LIVRE'
  )
);

commit;
