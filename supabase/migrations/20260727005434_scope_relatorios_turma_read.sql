-- Keep the legacy turma helper narrow because it is reused by academic
-- resources such as extra-class activities and their answers.
create or replace function public.gestor_can_read_turma(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_operate_turma_academics(p_turma_id);
$$;

revoke all on function public.gestor_can_read_turma(uuid)
  from public, anon;
grant execute on function public.gestor_can_read_turma(uuid)
  to authenticated, service_role;

comment on function public.gestor_can_read_turma(uuid) is
  'Legacy-compatible narrow helper: service_role or Gestao in the class polo. Resource-specific reads must use the dedicated helpers.';

-- Turma metadata required by roster/report screens is authorized by the
-- resource-specific helper without widening access to grades or activities.
drop policy if exists portal_turmas_authenticated_select on public.turmas;
create policy portal_turmas_authenticated_select on public.turmas
for select to authenticated
using (
  public.gestor_can_read_academic_roster(id)
  or public.is_aluno_matriculado_turma(id)
  or public.is_professor_assigned_turma(id)
);
