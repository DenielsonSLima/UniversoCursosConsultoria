-- Avoid anonymous requests evaluating student-only helpers in matriculas RLS.

drop policy if exists portal_matriculas_select on public.matriculas;

create policy portal_matriculas_select
on public.matriculas
for select
to authenticated
using (
  aluno_id = public.current_aluno_id()
  or public.is_professor_assigned_turma(turma_id)
  or public.can_write_turma(turma_id)
);
