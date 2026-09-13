-- The same canonical composition feeds the student statement and other credits.
-- Existing visibility filters, actual received amounts and bank/manual fields remain.
begin;

do $base$ begin
  if md5(pg_get_functiondef('public.get_aluno_extrato_financeiro(uuid)'::regprocedure)) <> 'd3c6c33e529941035f10b7204429446f' then
    raise exception 'Financial statement projection changed: get_aluno_extrato_financeiro(uuid)';
  end if;
end; $base$;

CREATE OR REPLACE FUNCTION public.get_aluno_extrato_financeiro(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH matricula_base AS (
  SELECT
    m.id,
    m.status,
    m.data_matricula,
    p.nome AS aluno_nome,
    p.cpf_cnpj AS aluno_cpf,
    t.nome AS turma_nome,
    t.codigo AS turma_codigo,
    t.polo_id,
    c.nome AS curso_nome,
    po.nome AS polo_nome
  FROM public.matriculas m
  LEFT JOIN public.parceiros p ON p.id = m.aluno_id
  LEFT JOIN public.turmas t ON t.id = m.turma_id
  LEFT JOIN public.cursos c ON c.id = t.curso_id
  LEFT JOIN public.polos po ON po.id = t.polo_id
  WHERE m.id = p_matricula_id
    AND (
      COALESCE(auth.role(), '') = 'service_role'
      OR m.aluno_id = public.current_aluno_id()
      OR public.is_financeiro_for_polo(t.polo_id)
    )
), recebiveis AS (
  SELECT
    cr.id,
    cr.descricao,
    cr.valor,
    cr.valor_pago,
    cr.data_vencimento,
    cr.data_pagamento,
    cr.status,
    cr.forma_pagamento,
    cr.origem_pagamento,
    cr.tipo_lancamento,
    cr.parcela_numero,
    cr.asaas_status,
    cr.asaas_invoice_url,
    cr.asaas_payment_id,
    cr.created_at,
    composition.juros AS juros_aplicados,
    composition.multa AS multa_aplicada,
    composition.desconto AS desconto_aplicado,
    composition.acrescimo AS acrescimo_aplicado,
    composition.diferenca_nao_discriminada AS diferenca_nao_discriminada,
    composition.composicao_status AS composicao_status,
    CASE composition.composicao_status
        WHEN 'CALCULADO_REGRA_INFORMADA_PROESC' THEN 'REGRA_INFORMADA_USUARIO'
        WHEN 'API_E_REGRA_INFORMADA_PROESC' THEN 'API_E_REGRA_INFORMADA_USUARIO'
        WHEN 'PARCIAL_POR_API_PROESC' THEN 'API_PROESC_COMPONENTES_EXPLICITOS'
        WHEN 'CONCILIADO_POR_CONFERENCIA_PROESC' THEN 'CONFERENCIA_PROESC'
        ELSE NULL END AS composicao_proveniencia
  FROM public.contas_receber cr
  LEFT JOIN LATERAL public.resolve_integrated_receivable_financial_composition(
    cr.id, cr.valor, cr.valor_pago, cr.data_vencimento,
    cr.data_pagamento, cr.gateway_financial_terms,
    cr.manual_settlement_id, cr.manual_settlement_reversed_at,
    cr.manual_settlement_principal_cents, cr.manual_settlement_interest_cents,
    cr.manual_settlement_penalty_cents, cr.manual_settlement_addition_cents,
    cr.manual_settlement_discount_cents, cr.manual_settlement_received_cents
  ) composition ON cr.status = 'PAGO'
  WHERE cr.matricula_id = p_matricula_id
    AND EXISTS (SELECT 1 FROM matricula_base)
  ORDER BY cr.data_vencimento ASC, cr.created_at ASC
), totais AS (
  SELECT
    COALESCE(SUM(valor), 0)::numeric AS total,
    COALESCE(SUM(CASE WHEN status = 'PAGO' THEN COALESCE(valor_pago, valor) ELSE 0 END), 0)::numeric AS recebido,
    COALESCE(SUM(CASE WHEN status IN ('PENDENTE', 'VENCIDO') THEN valor ELSE 0 END), 0)::numeric AS pendente,
    COALESCE(SUM(CASE WHEN status = 'VENCIDO' THEN valor ELSE 0 END), 0)::numeric AS vencido,
    COUNT(*) FILTER (WHERE status = 'PAGO')::integer AS pagos,
    COUNT(*) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO'))::integer AS pendentes
  FROM recebiveis
)
SELECT jsonb_build_object(
  'matriculaId', mb.id,
  'dataMatricula', mb.data_matricula,
  'poloId', mb.polo_id,
  'alunoNome', COALESCE(mb.aluno_nome, 'Aluno'),
  'alunoCpf', COALESCE(mb.aluno_cpf, ''),
  'turmaNome', COALESCE(mb.turma_nome, mb.turma_codigo, ''),
  'cursoNome', COALESCE(mb.curso_nome, ''),
  'poloNome', COALESCE(mb.polo_nome, ''),
  'statusMatricula', mb.status,
  'total', t.total,
  'recebido', t.recebido,
  'pendente', t.pendente,
  'vencido', t.vencido,
  'pagos', t.pagos,
  'pendentes', t.pendentes,
  'recebiveis', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM recebiveis r), '[]'::jsonb)
)
FROM matricula_base mb
CROSS JOIN totais t;
$function$;

do $base$ begin
  if md5(pg_get_functiondef('public.listar_outros_creditos_secure(uuid)'::regprocedure)) <> 'c49fdbaae20064fb59eaec2747d46080' then
    raise exception 'Financial statement projection changed: listar_outros_creditos_secure(uuid)';
  end if;
end; $base$;

CREATE OR REPLACE FUNCTION public.listar_outros_creditos_secure(p_polo_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    ) || jsonb_build_object(
      'juros_aplicados', composition.juros,
      'multa_aplicada', composition.multa,
      'desconto_aplicado', composition.desconto,
      'acrescimo_aplicado', composition.acrescimo,
      'diferenca_nao_discriminada', composition.diferenca_nao_discriminada,
      'composicao_status', composition.composicao_status,
      'composicao_proveniencia', CASE composition.composicao_status
        WHEN 'CALCULADO_REGRA_INFORMADA_PROESC' THEN 'REGRA_INFORMADA_USUARIO'
        WHEN 'API_E_REGRA_INFORMADA_PROESC' THEN 'API_E_REGRA_INFORMADA_USUARIO'
        WHEN 'PARCIAL_POR_API_PROESC' THEN 'API_PROESC_COMPONENTES_EXPLICITOS'
        WHEN 'CONCILIADO_POR_CONFERENCIA_PROESC' THEN 'CONFERENCIA_PROESC'
        ELSE NULL END
    ) ORDER BY credito.data_vencimento, credito.created_at, credito.id)
    FROM public.contas_receber credito
  LEFT JOIN LATERAL public.resolve_integrated_receivable_financial_composition(
    credito.id, credito.valor, credito.valor_pago, credito.data_vencimento,
    credito.data_pagamento, credito.gateway_financial_terms,
    credito.manual_settlement_id, credito.manual_settlement_reversed_at,
    credito.manual_settlement_principal_cents, credito.manual_settlement_interest_cents,
    credito.manual_settlement_penalty_cents, credito.manual_settlement_addition_cents,
    credito.manual_settlement_discount_cents, credito.manual_settlement_received_cents
  ) composition ON credito.status = 'PAGO'
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

notify pgrst, 'reload schema';
commit;
