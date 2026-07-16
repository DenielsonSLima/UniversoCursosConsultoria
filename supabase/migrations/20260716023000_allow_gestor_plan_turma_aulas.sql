begin;

-- A grade curricular é montada pelo gestor antes do início da turma. A política
-- anterior usava apenas can_write_academic_record_open, que exige turma técnica
-- EM_ANDAMENTO e período ABERTO/EM_FECHAMENTO, bloqueando o planejamento nas
-- fases PLANEJADA e INSCRICOES_ABERTAS.
drop policy if exists "portal_aulas_turma_insert" on public.aulas_turma;

create policy "portal_aulas_turma_insert"
  on public.aulas_turma
  for insert
  to authenticated
  with check (
    (select public.can_write_turma(turma_id))
    or (select public.can_write_academic_record_open(turma_id, disciplina_id))
  );

comment on policy "portal_aulas_turma_insert" on public.aulas_turma is
  'Permite ao gestor planejar aulas antes do início da turma; docentes permanecem limitados ao período acadêmico operacional.';

commit;
