begin;

-- Cobrem as duas FKs apontadas pelo advisor sem alterar o contrato funcional.
-- O primeiro índice preserva a validação composta matrícula/turma/aluno; o
-- segundo acelera bloqueios/remoções do título inicial referenciado.
create index if not exists matriculas_tecnicas_financeiro_matricula_scope_idx
  on public.matriculas_tecnicas_financeiro_config (
    matricula_id,
    turma_id,
    aluno_id
  );

create index if not exists matriculas_tecnicas_financeiro_titulo_idx
  on public.matriculas_tecnicas_financeiro_config (titulo_matricula_id)
  where titulo_matricula_id is not null;

comment on index public.matriculas_tecnicas_financeiro_matricula_scope_idx is
  'Cobertura da FK composta do estado financeiro para a matrícula técnica.';
comment on index public.matriculas_tecnicas_financeiro_titulo_idx is
  'Cobertura parcial da FK do título inicial; pendentes não ocupam o índice.';

commit;
