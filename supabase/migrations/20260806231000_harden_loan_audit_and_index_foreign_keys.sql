-- A tabela de auditoria de baixas é consultada somente pelas RPCs SECURITY DEFINER.
-- A política explícita preserva RLS e impede acesso direto do cliente.
CREATE POLICY emprestimo_parcela_baixas_no_direct_access
  ON public.emprestimo_parcela_baixas
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Índices de apoio às FKs usadas em baixa, auditoria e filtros por Matriz.
CREATE INDEX emprestimo_parcela_baixas_conta_bancaria_idx
  ON public.emprestimo_parcela_baixas (conta_bancaria_id);

CREATE INDEX emprestimo_parcelas_conta_bancaria_idx
  ON public.emprestimo_parcelas (conta_bancaria_id)
  WHERE conta_bancaria_id IS NOT NULL;

CREATE INDEX emprestimos_financeiros_conta_credito_idx
  ON public.emprestimos_financeiros (conta_credito_id);

CREATE INDEX emprestimos_financeiros_polo_matriz_idx
  ON public.emprestimos_financeiros (polo_matriz_id);
