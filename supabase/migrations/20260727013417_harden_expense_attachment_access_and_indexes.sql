ALTER FUNCTION public.can_access_despesa_anexo(text) SECURITY INVOKER;

CREATE INDEX IF NOT EXISTS idx_despesas_fornecedor_id
  ON public.despesas_lancamentos (fornecedor_id);

CREATE INDEX IF NOT EXISTS idx_despesas_conta_bancaria_id
  ON public.despesas_lancamentos (conta_bancaria_id);
