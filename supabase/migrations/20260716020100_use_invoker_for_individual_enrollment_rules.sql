-- A funcao-base valida o vinculo e a atualizacao final respeita a RLS de matriculas.

ALTER FUNCTION public.matricular_aluno_turma_financeiro_individual(
  uuid, uuid, uuid, numeric, date, numeric, numeric, numeric, numeric, numeric,
  integer, boolean, boolean, boolean, boolean
) SECURITY INVOKER;
