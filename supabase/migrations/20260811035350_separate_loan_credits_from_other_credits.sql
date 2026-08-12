-- Crédito de empréstimo é uma entrada financeira de financiamento, não um
-- "Outro Crédito" operacional. O vínculo canônico continua em
-- emprestimos_financeiros.conta_receber_id para não alterar o Caixa nem o
-- histórico; as leituras de Outros Créditos apenas excluem esse vínculo.
-- Aplicada no ambiente remoto sob a versão 20260811035350.

BEGIN;

CREATE OR REPLACE FUNCTION public.listar_outros_creditos_secure(
  p_polo_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       public.gestor_has_effective_financeiro_tab('outros-creditos')
       AND (
         (p_polo_id IS NULL AND public.is_financeiro_global())
         OR (p_polo_id IS NOT NULL AND public.is_financeiro_for_polo(p_polo_id))
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos Outros Créditos deste escopo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', credito.id,
      'polo_id', credito.polo_id,
      'polo_nome', polo.nome,
      'polo_cnpj', polo.cnpj,
      'polo_cidade', polo.cidade,
      'polo_uf', polo.estado,
      'descricao', credito.descricao,
      'valor', credito.valor,
      'data_vencimento', credito.data_vencimento,
      'data_emissao', coalesce(credito.gateway_boleto_issued_at, credito.created_at),
      'data_pagamento', credito.data_pagamento,
      'valor_pago', credito.valor_pago,
      'status', credito.status,
      'categoria', credito.categoria,
      'categoria_financeira_id', credito.categoria_financeira_id,
      'categoria_financeira_nome', categoria.nome,
      'cliente_id', credito.cliente_id,
      'cliente_nome', coalesce(cliente.nome, 'Cliente Geral'),
      'cliente_cpf_cnpj', cliente.cpf_cnpj,
      'cliente_telefone', cliente.telefone,
      'matricula_id', credito.matricula_id,
      'turma_id', credito.turma_id,
      'turma_nome', turma.nome,
      'curso_nome', curso.nome,
      'curso_modalidade', curso.modalidade,
      'forma_pagamento', credito.forma_pagamento,
      'origem_pagamento', credito.origem_pagamento,
      'gateway_provider', credito.gateway_provider,
      'gateway_payment_method', credito.gateway_payment_method,
      'gateway_settlement_channel', credito.gateway_settlement_channel,
      'gateway_settlement_source', credito.gateway_settlement_source,
      'conta_bancaria_id', credito.conta_bancaria_id,
      'nosso_numero_asaas', credito.nosso_numero_asaas,
      'asaas_payment_id', coalesce(credito.asaas_payment_id, credito.gateway_payment_id),
      'asaas_payment_link_id', coalesce(credito.asaas_payment_link_id, credito.gateway_payment_link_id),
      'asaas_invoice_url', coalesce(credito.asaas_invoice_url, credito.gateway_invoice_url),
      'asaas_bank_slip_url', coalesce(credito.asaas_bank_slip_url, credito.gateway_bank_slip_url),
      'asaas_installment_id', coalesce(credito.asaas_installment_id, credito.gateway_installment_id),
      'asaas_transaction_receipt_url', credito.asaas_transaction_receipt_url,
      'asaas_status', coalesce(credito.asaas_status, credito.gateway_status),
      'asaas_last_error', credito.asaas_last_error,
      'taxa', coalesce(credito.asaas_fee_value, credito.gateway_fee_value),
      'valor_liquido', coalesce(credito.asaas_net_value, credito.gateway_net_value),
      'created_at', credito.created_at,
      'tipo_lancamento', credito.tipo_lancamento,
      'parcela_numero', credito.parcela_numero,
      'origem_cronograma_id', credito.origem_cronograma_id
    ) ORDER BY credito.data_vencimento, credito.created_at, credito.id)
    FROM public.contas_receber credito
    LEFT JOIN public.parceiros cliente ON cliente.id = credito.cliente_id
    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = credito.categoria_financeira_id
    LEFT JOIN public.polos polo ON polo.id = credito.polo_id
    LEFT JOIN public.turmas turma ON turma.id = credito.turma_id
    LEFT JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE credito.categoria = 'OUTROS_CREDITOS'
      AND (p_polo_id IS NULL OR credito.polo_id = p_polo_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.emprestimos_financeiros emprestimo
        WHERE emprestimo.conta_receber_id = credito.id
      )
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_outros_creditos_summary(
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL
)
RETURNS TABLE(
  pending_count bigint,
  received_count bigint,
  canceled_count bigint,
  overdue_count bigint,
  all_count bigint,
  pending_value numeric,
  received_value numeric,
  canceled_value numeric,
  overdue_value numeric,
  all_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_search text := nullif(
    public.financeiro_normalize_search_text(btrim(coalesce(p_search, ''))),
    ''
  );
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       public.gestor_has_effective_financeiro_tab('outros-creditos')
       AND (
         (p_polo_id IS NULL AND public.is_financeiro_global())
         OR (p_polo_id IS NOT NULL AND public.is_financeiro_for_polo(p_polo_id))
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao resumo de Outros Créditos.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      credito.status,
      credito.valor,
      credito.valor_pago,
      credito.data_vencimento
    FROM public.contas_receber credito
    LEFT JOIN public.parceiros cliente ON cliente.id = credito.cliente_id
    LEFT JOIN public.polos polo ON polo.id = credito.polo_id
    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = credito.categoria_financeira_id
    WHERE credito.categoria = 'OUTROS_CREDITOS'
      AND (p_polo_id IS NULL OR credito.polo_id = p_polo_id)
      AND (p_due_start IS NULL OR credito.data_vencimento >= p_due_start)
      AND (p_due_end IS NULL OR credito.data_vencimento <= p_due_end)
      AND (p_categoria_id IS NULL OR credito.categoria_financeira_id = p_categoria_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.emprestimos_financeiros emprestimo
        WHERE emprestimo.conta_receber_id = credito.id
      )
      AND (
        v_search IS NULL
        OR public.financeiro_normalize_search_text(credito.descricao) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(categoria.nome) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(cliente.nome) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(cliente.cpf_cnpj) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(polo.nome) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(polo.cnpj) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(polo.cidade) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(polo.estado) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(credito.forma_pagamento::text) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(credito.asaas_status::text) LIKE '%' || v_search || '%'
      )
  )
  SELECT
    count(*) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO'))::bigint,
    count(*) FILTER (WHERE status = 'PAGO')::bigint,
    count(*) FILTER (WHERE status IN ('CANCELADO', 'ESTORNADO'))::bigint,
    count(*) FILTER (
      WHERE status = 'VENCIDO'
        OR (status = 'PENDENTE' AND data_vencimento < current_date)
    )::bigint,
    count(*)::bigint,
    coalesce(sum(valor) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')), 0),
    coalesce(sum(coalesce(valor_pago, valor)) FILTER (WHERE status = 'PAGO'), 0),
    coalesce(sum(valor) FILTER (WHERE status IN ('CANCELADO', 'ESTORNADO')), 0),
    coalesce(sum(valor) FILTER (
      WHERE status = 'VENCIDO'
        OR (status = 'PENDENTE' AND data_vencimento < current_date)
    ), 0),
    coalesce(sum(coalesce(valor_pago, valor)), 0)
  FROM filtered;
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_outros_creditos_secure(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_outros_creditos_summary(uuid, text, date, date, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.listar_outros_creditos_secure(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_outros_creditos_summary(uuid, text, date, date, uuid)
  TO authenticated, service_role;

-- A mesma assinatura já era usada por outras abas financeiras. Incluímos
-- explicitamente Outros Créditos para que sua lista/KPIs atualizem por
-- Realtime, sem ampliar o escopo de polos ou de eventos.
DROP POLICY IF EXISTS finance_realtime_events_select
  ON public.finance_realtime_events;
CREATE POLICY finance_realtime_events_select
  ON public.finance_realtime_events
  FOR SELECT
  TO authenticated
  USING (
    (
      aluno_id IS NOT NULL
      AND aluno_id = public.current_aluno_id()
    )
    OR (
      (
        (polo_id IS NULL AND public.is_gestor_global())
        OR (polo_id IS NOT NULL AND public.is_gestor_for_polo(polo_id))
      )
      AND (
        public.gestor_has_module('caixa')
        OR public.gestor_has_module('relatorios')
        OR public.gestor_has_financeiro_tab('resumo')
        OR public.gestor_has_financeiro_tab('receber')
        OR public.gestor_has_financeiro_tab('despesas')
        OR public.gestor_has_financeiro_tab('outros-debitos')
        OR public.gestor_has_financeiro_tab('outros-creditos')
        OR public.gestor_has_tab('secretaria', 'recebimentos')
        OR public.gestor_has_tab('secretaria', 'dependencias-academicas')
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
      )
    )
  );

COMMENT ON FUNCTION public.listar_outros_creditos_secure(uuid) IS
  'Lista somente créditos avulsos: exclui créditos vinculados canonicamente a empréstimos, sem alterar Caixa ou histórico.';
COMMENT ON FUNCTION public.get_outros_creditos_summary(uuid, text, date, date, uuid) IS
  'Resumo autorizado de Outros Créditos que exclui lançamentos vinculados a empréstimos.';

COMMIT;
