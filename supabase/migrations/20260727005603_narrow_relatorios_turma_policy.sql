-- Keep the report-only grant attached to turma metadata itself. Do not route
-- it through helpers shared by unrelated academic resources.
drop policy if exists portal_turmas_authenticated_select on public.turmas;
create policy portal_turmas_authenticated_select on public.turmas
for select to authenticated
using (
  public.gestor_can_read_turma(id)
  or (
    public.gestor_has_module('relatorios')
    and public.is_gestor_for_polo(polo_id)
  )
  or public.is_aluno_matriculado_turma(id)
  or public.is_professor_assigned_turma(id)
);
