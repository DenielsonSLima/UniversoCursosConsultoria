-- Production reader captured before the gateway projection; regression baseline.
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
