-- Fix PostgREST 500 errors caused by recursive RLS evaluation on cursos.
-- A policy on cursos must not call a function that queries cursos again.

create or replace function public.has_course_private_access(p_curso_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_gestor()
    or exists (
      select 1
      from public.matriculas m
      join public.turmas t on t.id = m.turma_id
      where m.aluno_id = public.current_aluno_id()
        and t.curso_id = p_curso_id
    )
    or exists (
      select 1
      from public.turmas_disciplinas td
      join public.turmas t on t.id = td.turma_id
      where td.professor_id = public.current_professor_id()
        and t.curso_id = p_curso_id
    );
$$;

create or replace function public.course_is_public_for_policy(p_curso_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cursos c
    where c.id = p_curso_id
      and lower(coalesce(c.status, '')) = 'ativo'
      and coalesce(c.publicar_site, false) = true
  );
$$;

revoke all on function public.has_course_private_access(uuid) from public, anon;
grant execute on function public.has_course_private_access(uuid) to authenticated, service_role;

revoke all on function public.course_is_public_for_policy(uuid) from public;
grant execute on function public.course_is_public_for_policy(uuid) to anon, authenticated, service_role;

drop policy if exists portal_cursos_public_select on public.cursos;
create policy portal_cursos_public_select
on public.cursos
for select
to anon, authenticated
using (
  lower(coalesce(status, '')) = 'ativo'
  and coalesce(publicar_site, false) = true
);

drop policy if exists portal_cursos_authenticated_select on public.cursos;
create policy portal_cursos_authenticated_select
on public.cursos
for select
to authenticated
using (public.has_course_private_access(id));

drop policy if exists portal_turmas_public_select on public.turmas;
create policy portal_turmas_public_select
on public.turmas
for select
to anon, authenticated
using (
  upper(coalesce(status, '')) = 'EM_ANDAMENTO'
  and coalesce(permitir_inscricoes_online, false) = true
  and public.course_is_public_for_policy(curso_id)
);
