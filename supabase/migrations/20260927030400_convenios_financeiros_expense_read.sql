BEGIN;

ALTER FUNCTION public.listar_despesas_economicas_detalhadas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) RENAME TO listar_despesas_economicas_detalhadas_v1_core;

REVOKE ALL ON FUNCTION public.listar_despesas_economicas_detalhadas_v1_core(
  text, uuid, uuid, text, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.listar_despesas_economicas_detalhadas_secure(
  p_tipo text,
  p_polo_id uuid,
  p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'todos',
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE(
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
  convenio_competencia date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    item.*,
    CASE WHEN auth.role() = 'service_role'
      OR public.gestor_has_effective_financeiro_tab('convenios')
      THEN vinculo.competencia_id END,
    CASE WHEN auth.role() = 'service_role'
      OR public.gestor_has_effective_financeiro_tab('convenios')
      THEN vinculo.convenio_id END,
    CASE WHEN auth.role() = 'service_role'
      OR public.gestor_has_effective_financeiro_tab('convenios')
      THEN convenio.nome END,
    CASE WHEN auth.role() = 'service_role'
      OR public.gestor_has_effective_financeiro_tab('convenios')
      THEN mes.competencia END
  FROM public.listar_despesas_economicas_detalhadas_v1_core(
    p_tipo, p_polo_id, p_categoria_id, p_search,
    p_due_start, p_due_end, p_status_scope, p_turma_id
  ) item
  LEFT JOIN public.convenios_financeiros_despesas vinculo
    ON vinculo.despesa_lancamento_id = item.despesa_lancamento_id
   AND vinculo.status = 'ATIVO'
   AND item.is_rateio_derivado = false
  LEFT JOIN public.convenios_financeiros convenio ON convenio.id = vinculo.convenio_id
  LEFT JOIN public.convenios_financeiros_competencias mes ON mes.id = vinculo.competencia_id;
$function$;

REVOKE ALL ON FUNCTION public.listar_despesas_economicas_detalhadas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_despesas_economicas_detalhadas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_despesas_economicas_detalhadas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) IS 'Lista contas a pagar com o vínculo analítico de convênio financeiro, sem duplicar a despesa física.';

COMMIT;
