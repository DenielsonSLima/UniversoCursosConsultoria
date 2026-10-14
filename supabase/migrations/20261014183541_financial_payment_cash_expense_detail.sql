BEGIN;
-- Preserve explicit ledger charges, including additions, in the existing cash report.
CREATE OR REPLACE FUNCTION public.get_caixa_relatorio_despesas_core(p_polo_id uuid, p_inicio date, p_fim date)
 RETURNS TABLE(id uuid, origem text, data_pagamento date, data_vencimento date, descricao text, fornecedor text, categoria text, polo text, curso text, turma text, parcela_numero integer, total_parcelas integer, forma_pagamento text, conta text, valor_base numeric, juros numeric, multa numeric, acrescimo numeric, desconto numeric, diferenca_nao_discriminada numeric, composicao_status text, valor_pago numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH movimentos AS (
    SELECT
      cp.id,
      'CONTA_PAGAR'::text AS origem,
      cp.data_pagamento,
      cp.data_vencimento,
      cp.descricao,
      cp.fornecedor_id,
      cp.categoria,
      cp.polo_id,
      NULL::uuid AS turma_id,
      NULL::integer AS parcela_numero,
      NULL::integer AS total_parcelas,
      cp.forma_pagamento,
      cp.conta_bancaria_id,
      coalesce(cp.valor, 0)::numeric AS valor_base,
      payment.interest_cents::numeric/100 AS juros,
      payment.penalty_cents::numeric/100 AS multa,
      payment.addition_cents::numeric/100 AS acrescimo,
      payment.discount_cents::numeric/100 AS desconto,
      coalesce(cp.valor_pago, cp.valor, 0)::numeric AS valor_pago,
      payment.id IS NOT NULL AS explicit_components
    FROM internal_financial_payments.cash_payables() cp
    LEFT JOIN internal_financial_payments.cash_components() payment ON payment.id=cp.id
    WHERE cp.status = 'PAGO'
      AND cp.despesa_lancamento_id IS NULL
      AND cp.emprestimo_parcela_id IS NULL
      AND cp.data_pagamento >= p_inicio
      AND cp.data_pagamento < p_fim
      AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)

    UNION ALL

    SELECT
      dl.id,
      'DESPESA_LANCAMENTO'::text,
      dl.data_pagamento,
      dl.data_vencimento,
      dl.descricao,
      dl.fornecedor_id,
      categoria.nome,
      dl.polo_id,
      dl.turma_id,
      dl.parcela_numero,
      dl.total_parcelas,
      dl.forma_pagamento,
      dl.conta_bancaria_id,
      coalesce(dl.valor_base, dl.valor, 0)::numeric,
      coalesce(dl.juros_valor, 0)::numeric,
      coalesce(dl.multa_valor, 0)::numeric,
      coalesce(payment.addition_cents,0)::numeric/100,
      coalesce(dl.desconto_valor, 0)::numeric,
      coalesce(dl.valor_pago, dl.valor, 0)::numeric,
      true
    FROM internal_financial_payments.cash_expenses() dl
    LEFT JOIN internal_financial_payments.cash_components() payment ON payment.id=dl.id
    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = dl.categoria_financeira_id
    WHERE dl.status = 'PAGO'
      AND dl.data_pagamento >= p_inicio
      AND dl.data_pagamento < p_fim
      AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
  )
  SELECT
    movimento.id,
    movimento.origem,
    movimento.data_pagamento,
    movimento.data_vencimento,
    coalesce(nullif(trim(movimento.descricao), ''), 'Despesa') AS descricao,
    coalesce(nullif(trim(fornecedor.nome), ''), 'Fornecedor não identificado') AS fornecedor,
    coalesce(nullif(trim(movimento.categoria), ''), 'Outras despesas') AS categoria,
    CASE
      WHEN movimento_polo.id IS NULL THEN 'A CLASSIFICAR'
      ELSE concat_ws(
        ' · ',
        nullif(trim(movimento_polo.nome), ''),
        nullif(concat_ws('/', movimento_polo.cidade, movimento_polo.estado), '/')
      )
    END AS polo,
    coalesce(nullif(trim(curso.nome), ''), 'Sem curso vinculado') AS curso,
    coalesce(
      nullif(trim(concat_ws(' · ', turma.codigo, turma.nome)), ''),
      'Sem turma vinculada'
    ) AS turma,
    movimento.parcela_numero,
    movimento.total_parcelas,
    coalesce(nullif(trim(movimento.forma_pagamento), ''), 'Não informada') AS forma_pagamento,
    CASE
      WHEN cb.id IS NULL THEN 'Conta não informada'
      ELSE concat_ws(
        ' · ',
        nullif(trim(cb.banco), ''),
        nullif(concat('Ag. ', cb.agencia), 'Ag. '),
        nullif(concat('Conta ', cb.conta), 'Conta ')
      )
    END AS conta,
    movimento.valor_base,
    CASE
      WHEN movimento.explicit_components THEN movimento.juros
      WHEN movimento.valor_pago = movimento.valor_base THEN 0
      ELSE NULL
    END AS juros,
    CASE
      WHEN movimento.explicit_components THEN movimento.multa
      WHEN movimento.valor_pago = movimento.valor_base THEN 0
      ELSE NULL
    END AS multa,
    CASE
      WHEN movimento.explicit_components THEN movimento.acrescimo
      WHEN movimento.valor_pago = movimento.valor_base THEN 0
      ELSE NULL
    END AS acrescimo,
    CASE
      WHEN movimento.explicit_components THEN movimento.desconto
      WHEN movimento.valor_pago = movimento.valor_base THEN 0
      ELSE NULL
    END AS desconto,
    CASE
      WHEN NOT movimento.explicit_components
       AND movimento.valor_pago <> movimento.valor_base
      THEN movimento.valor_pago - movimento.valor_base
      ELSE 0
    END AS diferenca_nao_discriminada,
    CASE
      WHEN movimento.explicit_components THEN 'COMPOSICAO_EXPLICITA'
      WHEN movimento.valor_pago = movimento.valor_base THEN 'SEM_DIFERENCA_FINANCEIRA'
      ELSE 'NAO_DISCRIMINADA'
    END AS composicao_status,
    movimento.valor_pago
  FROM movimentos movimento
  LEFT JOIN public.parceiros fornecedor
    ON fornecedor.id = movimento.fornecedor_id
  LEFT JOIN public.polos movimento_polo
    ON movimento_polo.id = movimento.polo_id
  LEFT JOIN public.turmas turma
    ON turma.id = movimento.turma_id
  LEFT JOIN public.cursos curso
    ON curso.id = turma.curso_id
  LEFT JOIN public.contas_bancarias cb
    ON cb.id = movimento.conta_bancaria_id
  ORDER BY movimento.data_pagamento, movimento_polo.nome, fornecedor.nome, movimento.id;
$function$;

COMMIT;
