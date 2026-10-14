-- Contract-shaped synthetic read fixture used only by isolated payment tests.
CREATE TYPE public.test_expense_read_row AS (
  id uuid,
  despesa_lancamento_id uuid,
  polo_id uuid,
  polo_nome text,
  tipo text,
  descricao text,
  valor_base numeric,
  juros_valor numeric,
  multa_valor numeric,
  desconto_valor numeric,
  valor numeric,
  data_lancamento date,
  data_vencimento date,
  data_pagamento date,
  valor_pago numeric,
  status text,
  categoria_financeira_id uuid,
  categoria_nome text,
  fornecedor_id uuid,
  fornecedor_nome text,
  forma_pagamento text,
  conta_bancaria_id uuid,
  conta_bancaria_nome text,
  parcela_numero integer,
  total_parcelas integer,
  grupo_parcelas_id uuid,
  observacao text,
  turma_id uuid,
  turma_nome text,
  anexo_bucket text,
  anexo_path text,
  anexo_nome text,
  anexo_mime text,
  anexo_tamanho bigint,
  cancelamento_motivo text,
  cancelado_em timestamptz,
  estornado_em timestamptz,
  created_at timestamptz,
  is_rateio_derivado boolean,
  rateio_modo text,
  rateio_polos_quantidade integer,
  polo_matriz_id uuid,
  polo_matriz_nome text,
  convenio_mes_id uuid,
  convenio_id uuid,
  convenio_nome text,
  convenio_competencia date);
CREATE FUNCTION public.listar_despesas_economicas_detalhadas_secure(
 p_tipo text,p_polo_id uuid,p_categoria_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
 p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'todos',p_turma_id uuid DEFAULT NULL
) RETURNS SETOF public.test_expense_read_row LANGUAGE sql AS $$
 SELECT jsonb_populate_record(NULL::public.test_expense_read_row,to_jsonb(d)||jsonb_build_object(
  'despesa_lancamento_id',d.id,'is_rateio_derivado',false))
 FROM public.despesas_lancamentos d WHERE d.polo_id=p_polo_id AND d.tipo=p_tipo
 UNION ALL
 SELECT jsonb_populate_record(NULL::public.test_expense_read_row,to_jsonb(d)||to_jsonb(r)||jsonb_build_object(
  'valor',r.valor_total,'is_rateio_derivado',true))
 FROM public.despesas_lancamentos_rateios r JOIN public.despesas_lancamentos d ON d.id=r.despesa_lancamento_id
 WHERE r.polo_id=p_polo_id AND d.tipo=p_tipo;
$$;
CREATE FUNCTION public.listar_despesas_economicas_secure(
 p_tipo text,p_polo_id uuid,p_categoria_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
 p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'todos',p_turma_id uuid DEFAULT NULL
) RETURNS SETOF public.test_expense_read_row LANGUAGE sql AS $$
 SELECT jsonb_populate_record(NULL::public.test_expense_read_row,to_jsonb(d)||jsonb_build_object(
  'despesa_lancamento_id',d.id,'is_rateio_derivado',false))
 FROM public.despesas_lancamentos d WHERE d.polo_id=p_polo_id AND d.tipo=p_tipo
 UNION ALL
 SELECT jsonb_populate_record(NULL::public.test_expense_read_row,to_jsonb(d)||to_jsonb(r)||jsonb_build_object(
  'valor',r.valor_total,'is_rateio_derivado',true))
 FROM public.despesas_lancamentos_rateios r JOIN public.despesas_lancamentos d ON d.id=r.despesa_lancamento_id
 WHERE r.polo_id=p_polo_id AND d.tipo=p_tipo;
$$;
