CREATE INDEX IF NOT EXISTS matricula_aproveitamentos_disciplina_idx
  ON public.matricula_aproveitamentos (disciplina_id);

REVOKE ALL ON FUNCTION public.ajustar_financeiro_movimentacao_matricula()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.processar_continuidade_transferencia()
  FROM PUBLIC, anon, authenticated;
