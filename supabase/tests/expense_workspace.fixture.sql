-- Synthetic baseline for the real economic reader and canonical payment migrations.
ALTER TABLE public.parceiros ADD COLUMN tipo text DEFAULT 'PJ';
ALTER TABLE public.contas_bancarias ADD COLUMN natureza text DEFAULT 'CAIXA_INTERNO',
  ADD COLUMN banco text DEFAULT 'Caixa sintético', ADD COLUMN agencia text, ADD COLUMN conta text DEFAULT 'TESTE';
CREATE TABLE public.turmas(id uuid PRIMARY KEY,nome text);

-- The installed production reader adds launch date/cancellation/account metadata
-- around the economic core. This fixture retains its return contract, while all
-- scope/date/search/rateio filters execute the real economic-core migration.
CREATE OR REPLACE FUNCTION public.listar_despesas_economicas_detalhadas_secure(
  p_tipo text,p_polo_id uuid,p_categoria_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'todos',p_turma_id uuid DEFAULT NULL
)
RETURNS SETOF public.test_expense_read_row LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_populate_record(NULL::public.test_expense_read_row,to_jsonb(item)||jsonb_build_object(
    'data_lancamento',source.data_lancamento,'cancelamento_motivo',source.cancelamento_motivo,
    'cancelado_em',source.cancelado_em,'estornado_em',source.estornado_em,
    'conta_bancaria_nome',CASE WHEN item.is_rateio_derivado THEN NULL ELSE conta.nome END))
  FROM public.listar_despesas_economicas_secure(
    p_tipo,p_polo_id,p_categoria_id,p_search,p_due_start,p_due_end,p_status_scope,p_turma_id) item
  JOIN public.despesas_lancamentos source ON source.id=item.despesa_lancamento_id
  LEFT JOIN public.contas_bancarias conta ON conta.id=item.conta_bancaria_id
  WHERE source.excluido_em IS NULL;
$$;
